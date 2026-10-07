/**
 * Funnel stage math — pure functions over FunnelJourney rows. The journeys
 * themselves come from db.funnel (seeded dummy today; Trakyo / Meta Ads MCP
 * fill the same shape live), so everything here stays source-agnostic.
 */
import {
  FunnelSummarySchema,
  type FunnelJourney,
  type FunnelStage,
  type FunnelSummary,
  type FunnelTouch,
  type FunnelVenture,
  type NlgAttribution,
} from '@/lib/schemas';

/** Canonical HighLevel pipeline stages — labels match the live GHL names. */
export const FUNNEL_STAGES: { id: FunnelStage; label: string }[] = [
  { id: 'new_lead', label: 'New Lead' },
  { id: 'scheduled_call', label: 'Scheduled Call' },
  { id: 'no_show', label: 'No Show' },
  { id: 'got_in_the_call', label: 'Got in the Call' },
  { id: 'proposal_sent', label: 'Proposal Sent' },
  { id: 'fu_interested_hi', label: 'FU - Interested - HI' },
  { id: 'signed', label: 'Signed' },
  { id: 'disqualified', label: 'Disqualified' },
];

export function isWonStage(status: FunnelStage): boolean {
  return status === 'signed';
}

export function isClosedStage(status: FunnelStage): boolean {
  return status === 'signed' || status === 'disqualified';
}

const STAGE_INDEX: Record<FunnelStage, number> = Object.fromEntries(
  FUNNEL_STAGES.map((s, i) => [s.id, i]),
) as Record<FunnelStage, number>;

/** Display glyphs for touch channels (journey chips). */
export const CHANNEL_GLYPHS: Record<string, string> = {
  organic: '◉',
  ads: '▣',
  dm: '✉',
  email: '@',
  webinar: '▶',
  call: '☎',
  checkout: '$',
  crm: '◈',
};

/** Quiet for more than this many days before converting → the node runs red. */
export const STALL_DAYS = 7;
/** Quiet past this → the lead decays out of the space into the archive tab. */
export const DECAY_DAYS = 90;
/** Nodes stay their neutral segment color until here, then fade toward red.
 * Three quiet weeks = a lead visibly starting to die, which is where a typical
 * pipeline's quiet leads cluster, so the gradient actually shows. */
export const DECAY_FADE_START = 21;

/**
 * Continuous decay for the space's fade-to-red: 0 (neutral) through
 * DECAY_FADE_START, ramping linearly to 1 at DECAY_DAYS — the node visibly
 * dies before it archives. Converted never decays; advancing a stage resets
 * the quiet clock, so movement is what keeps a lead vivid.
 */
export function decayFactor(daysSinceLastTouch: number, status: FunnelStage, crmLocked = false): number {
  if (crmLocked || isClosedStage(status)) return 0;
  return Math.min(1, Math.max(0, (daysSinceLastTouch - DECAY_FADE_START) / (DECAY_DAYS - DECAY_FADE_START)));
}

export type JourneyState = 'converted' | 'stalled' | 'active' | 'decayed';

/** HighLevel CRM rows: stage membership follows current pipeline stage, not quiet-time. */
export function isLiveCrmJourney(j: FunnelJourney): boolean {
  return j.id.startsWith('ghl-') || j.touches.some((t) => t.source === 'ghl');
}

/**
 * Liveness of one journey at `now`: how long since the operator last touched them,
 * and the color-state the space renders — green once converted, red when a
 * pre-conversion lead has sat quiet past STALL_DAYS, blue otherwise, and
 * `decayed` (out of the space, into the archive) past DECAY_DAYS.
 * Incoming leads (still at New Lead) never stall: they render blue-ish
 * until they move — but even they decay after 90 quiet days. Signed and
 * Disqualified are closed and never stall or fade.
 */
export function journeyMeta(j: FunnelJourney, now: Date): { daysSinceLastTouch: number; state: JourneyState } {
  const lastAt = j.touches[j.touches.length - 1]?.at ?? j.createdAt;
  const days = Math.max(0, Math.floor((now.getTime() - new Date(`${lastAt}T00:00:00Z`).getTime()) / 86_400_000));
  if (isLiveCrmJourney(j)) {
    return { daysSinceLastTouch: days, state: isWonStage(j.status) ? 'converted' : 'active' };
  }
  const canStall = !isClosedStage(j.status) && j.status !== 'new_lead';
  const state: JourneyState =
    isWonStage(j.status)
      ? 'converted'
      : days > DECAY_DAYS
        ? 'decayed'
        : canStall && days > STALL_DAYS
          ? 'stalled'
          : 'active';
  return { daysSinceLastTouch: days, state };
}

/**
 * What the operator should act on today — the funnel answering a question instead
 * of glowing. Two queues, both capped so the rail reads at a glance:
 *   pushNow — hot leads (likelihood ≥ 70) still in active motion; freshest
 *             movement first, because momentum is when a push closes.
 *   saveNow — leads visibly fading toward the archive (past DECAY_FADE_START);
 *             highest likelihood first, because those are worth saving.
 */
export const ATTENTION_CAP = 4;
export const PUSH_LIKELIHOOD = 70;

export function attentionQueue(
  journeys: FunnelJourney[],
  now: Date,
): { pushNow: FunnelJourney[]; saveNow: FunnelJourney[] } {
  const metas = journeys.map((j) => ({ j, meta: journeyMeta(j, now) }));
  const pushNow = metas
    .filter(
      ({ j, meta }) =>
        meta.state === 'active' &&
        !isWonStage(j.status) &&
        j.likelihood >= PUSH_LIKELIHOOD &&
        // a fading lead is a save, not a push — even where stalling can't apply
        decayFactor(meta.daysSinceLastTouch, j.status) === 0,
    )
    .sort((a, b) => a.meta.daysSinceLastTouch - b.meta.daysSinceLastTouch || b.j.likelihood - a.j.likelihood)
    .slice(0, ATTENTION_CAP)
    .map(({ j }) => j);
  const saveNow = metas
    .filter(
      ({ j, meta }) =>
        meta.state !== 'decayed' &&
        !isWonStage(j.status) &&
        // Stalled counts as well as fading. Testing only "is it fading" left
        // days 8-20 in neither rail: red on the board, absent from the list of
        // what to do about it. Still disjoint from pushNow, which requires
        // active AND decay === 0.
        (meta.state === 'stalled' || decayFactor(meta.daysSinceLastTouch, j.status) > 0),
    )
    .sort((a, b) => b.j.likelihood - a.j.likelihood || b.meta.daysSinceLastTouch - a.meta.daysSinceLastTouch)
    .slice(0, ATTENTION_CAP)
    .map(({ j }) => j);
  return { pushNow, saveNow };
}

/** The space renders actives; the archive tab lists what has decayed. */
export function splitFunnelJourneys(
  journeys: FunnelJourney[],
  now: Date,
): { active: FunnelJourney[]; archived: FunnelJourney[] } {
  const active: FunnelJourney[] = [];
  const archived: FunnelJourney[] = [];
  for (const j of journeys) (journeyMeta(j, now).state === 'decayed' ? archived : active).push(j);
  return { active, archived };
}

export type FunnelCountMode = 'reached' | 'occupancy';

/**
 * Live HighLevel: every opportunity stays in the space at its current CRM
 * stage. Seeded / Attio journeys keep the FounderOS archive split.
 */
export function presentFunnelJourneys(
  journeys: FunnelJourney[],
  now: Date,
): { active: FunnelJourney[]; archived: FunnelJourney[]; countMode: FunnelCountMode } {
  const crm = journeys.filter(isLiveCrmJourney);
  if (crm.length > 0) {
    return { active: crm, archived: [], countMode: 'occupancy' };
  }
  const split = splitFunnelJourneys(journeys, now);
  return { ...split, countMode: 'reached' };
}

/** Occupancy KPIs for the live HighLevel CRM funnel — not FounderOS "clients". */
export function nlgFunnelKpis(journeys: FunnelJourney[]): {
  totalLeads: number;
  openLeads: number;
  signed: number;
  disqualified: number;
  revenueUsd: number;
} {
  const signed = journeys.filter((j) => j.status === 'signed');
  const disqualified = journeys.filter((j) => j.status === 'disqualified');
  return {
    totalLeads: journeys.length,
    openLeads: journeys.length - signed.length - disqualified.length,
    signed: signed.length,
    disqualified: disqualified.length,
    revenueUsd: signed.reduce((sum, j) => sum + (j.amountUsd ?? 0), 0),
  };
}

/** One client in the open funnel space — everything the canvas needs to move it. */
export type FunnelSpaceNode = {
  id: string;
  name: string;
  venture: FunnelVenture;
  status: FunnelStage;
  relationship: FunnelJourney['relationship'];
  likelihood: number;
  state: JourneyState;
  daysSinceLastTouch: number;
  product: string | null;
  amountUsd: number | null;
  /** Distinct hubs in visit order — the path the node travels on entry. */
  hubs: number[];
  /** Where they live now: the last hub visited. */
  currentHub: number;
  /** Node size encodes likelihood-to-buy. */
  radius: number;
  /** 0 = vivid segment color · → 1 = faded red, about to archive. */
  decay: number;
  /** Deep link to the source record (Attio / GHL contact page). */
  url: string | null;
  email: string | null;
  phone: string | null;
  /** The human behind the deal — the dossier's identity block. */
  person: string | null;
  company: string | null;
  role: string | null;
  linkedin: string | null;
  touches: FunnelTouch[];
  nlgAttribution?: NlgAttribution;
};

/**
 * Model for the "open space" view: each journey becomes one moving node.
 * Repeated touches inside a stage collapse into a single hub visit (the node
 * travels sections, not touches); color-state comes from journeyMeta and size
 * from likelihood.
 */
export function funnelSpaceModel(journeys: FunnelJourney[], now: Date): FunnelSpaceNode[] {
  return journeys.map((j) => {
    const hubs: number[] = [];
    for (const t of j.touches) {
      const col = STAGE_INDEX[t.stage];
      if (hubs[hubs.length - 1] !== col) hubs.push(col);
    }
    if (hubs.length === 0) hubs.push(0);
    const meta = journeyMeta(j, now);
    return {
      id: j.id,
      name: j.name,
      venture: j.venture,
      status: j.status,
      relationship: j.relationship,
      likelihood: j.likelihood,
      state: meta.state,
      daysSinceLastTouch: meta.daysSinceLastTouch,
      product: j.product,
      amountUsd: j.amountUsd,
      hubs,
      currentHub: hubs[hubs.length - 1],
      // Constellation-small: 2.5–5.5px by likelihood, knowledge-graph texture.
      radius: 2.5 + (j.likelihood / 100) * 3,
      decay: decayFactor(meta.daysSinceLastTouch, j.status, isLiveCrmJourney(j)),
      url: j.url,
      email: j.email,
      phone: j.phone,
      person: j.person,
      company: j.company,
      role: j.role,
      linkedin: j.linkedin,
      touches: j.touches,
      nlgAttribution: j.nlgAttribution,
    };
  });
}

/**
 * Per-stage reached counts + stage→stage conversion. "Reached" means the
 * journey's furthest stage is at or past the bar's stage — a journey that
 * skipped the optional `nurtured` touch still progressed past that point.
 * The organic/ads split keys off each journey's first touch.
 */
export function funnelSummary(journeys: FunnelJourney[], mode: FunnelCountMode = 'reached'): FunnelSummary {
  const converted = journeys.filter((j) => isWonStage(j.status));
  const stages = FUNNEL_STAGES.map(({ id }, i) => {
    const members =
      mode === 'occupancy'
        ? journeys.filter((j) => j.status === id)
        : journeys.filter((j) => STAGE_INDEX[j.status] >= i);
    const firstChannel = (j: FunnelJourney) => j.touches[0]?.channel;
    return {
      stage: id,
      total: members.length,
      organic: members.filter((j) => firstChannel(j) === 'organic').length,
      ads: members.filter((j) => firstChannel(j) === 'ads').length,
      conversionFromPrev: null as number | null,
    };
  });
  if (mode === 'reached') {
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1].total;
      stages[i].conversionFromPrev = prev > 0 ? Math.round((stages[i].total / prev) * 1000) / 10 : null;
    }
  }
  return FunnelSummarySchema.parse({
    clients: journeys.length,
    converted: converted.length,
    revenueUsd: converted.reduce((sum, j) => sum + (j.amountUsd ?? 0), 0),
    stages,
  });
}
