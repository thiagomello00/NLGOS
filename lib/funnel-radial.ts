/**
 * Radial funnel math — the outside → in view. The journey is a circle: leads
 * enter at the rim in one of seven acquisition segments (where they actually
 * came from) and travel inward ring by ring until the center — the purchase.
 *
 * Attribution is honest and layered: a touch that arrives with its own
 * `acquisition` stamp (Trakyo attributed the first touch structurally —
 * source type + source name) is trusted outright; everything else falls to
 * keyword classification over the entry touch, with `word_of_mouth` as the
 * explicit catch-all for what nothing tracked.
 */
import { funnelSpaceModel, type FunnelSpaceNode } from '@/lib/funnel';
import { NLG_ACQUISITIONS, nlgAcquisitionLabel, type NlgAcquisition } from '@/lib/funnel-ghl-attribution';
import type { FunnelAcquisition, FunnelJourney, FunnelTouch } from '@/lib/schemas';

/** Journeys and space nodes both qualify — classification reads touches only. */
type HasTouches = { touches: FunnelTouch[]; nlgAttribution?: FunnelJourney['nlgAttribution'] };

export type { FunnelAcquisition };

/** The rim segments, in render order around the circle. X and LinkedIn share
 * one wedge (the operator condensed them — both are his text-platform funnels). */
export const ACQUISITIONS: { id: FunnelAcquisition; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'x_linkedin', label: 'X / LinkedIn' },
  { id: 'form', label: 'Forms' },
  { id: 'word_of_mouth', label: 'Word of mouth' },
];

const SEGMENT_INDEX: Record<FunnelAcquisition, number> = Object.fromEntries(
  ACQUISITIONS.map((a, i) => [a.id, i]),
) as Record<FunnelAcquisition, number>;

/**
 * Keyword families, first match wins. Order matters: youtube before form so
 * "long-form" stays YouTube; explicit word-of-mouth before the form fallback.
 * Instagram owns Meta paid + ManyChat + TikTok short-form (the operator runs ads
 * and DM automations through the IG/FB machine).
 */
const MATCHERS: { id: FunnelAcquisition; re: RegExp }[] = [
  { id: 'youtube', re: /youtube|\byt\b|long-form/i },
  { id: 'instagram', re: /instagram|\big\b|insta\b|reel|tiktok|meta ad|manychat|facebook|\bfb\b/i },
  { id: 'newsletter', re: /newsletter|beehiiv/i },
  { id: 'x_linkedin', re: /twitter|\bx thread|\bx post|\bx dm|\bon x\b|linkedin/i },
  { id: 'word_of_mouth', re: /referr|word of mouth|recommend/i },
  { id: 'form', re: /\bform\b|application|typeform|survey|landing page|opt.?in|waitlist/i },
];

/** The bare keyword pass — exported so Trakyo's source names run through the
 * exact same taxonomy. Null when nothing matches (callers own the fallback). */
export function matchAcquisition(text: string): FunnelAcquisition | null {
  for (const m of MATCHERS) if (m.re.test(text)) return m.id;
  return null;
}

/**
 * Which rim segment a journey enters through. A touch stamped with its own
 * `acquisition` (Trakyo knew the source structurally) is trusted outright;
 * otherwise classify from the entry touch (label + channel). Unattributed
 * stays word_of_mouth: the honest bucket for "we didn't track this", exactly
 * the operator's framing of referrals.
 */
export function acquisitionFor(j: HasTouches): FunnelAcquisition {
  const entry = j.touches[0];
  if (!entry) return 'word_of_mouth';
  if (entry.acquisition) return entry.acquisition;
  const matched = matchAcquisition(entry.label);
  if (matched) return matched;
  if (entry.channel === 'ads') return 'instagram'; // paid traffic = the IG/FB machine
  return 'word_of_mouth';
}

/** "Where they came from" as words for the dossier card — the acquisition
 * segment plus the actual entry touch that put them in the funnel. */
export type FunnelOrigin = {
  segment: string;
  entry: string | null;
  channel: string | null;
  source: string | null;
  at: string | null;
};

export function originOf(j: HasTouches): FunnelOrigin {
  const attr = j.nlgAttribution;
  if (attr) {
    return {
      segment: nlgAcquisitionLabel(attr.category),
      entry: attr.content ?? attr.campaign ?? attr.firstTouchSource,
      channel: attr.sessionSource,
      source: attr.opportunitySource,
      at: j.touches[0]?.at ?? null,
    };
  }
  const seg = ACQUISITIONS[SEGMENT_INDEX[acquisitionFor(j)]];
  const entry = j.touches[0] ?? null;
  return {
    segment: seg.label,
    entry: entry?.label ?? null,
    channel: entry?.channel ?? null,
    source: entry?.source ?? null,
    at: entry?.at ?? null,
  };
}

/** A space node placed on the circle: rim segment + ring depth. */
export type FunnelRadialNode = FunnelSpaceNode & {
  /** 0–6 index into ACQUISITIONS — the wedge this lead entered through. */
  segment: number;
  /** Stage rings visited in order (aliases the space model's hub path). */
  rings: number[];
  /** Where they are now: 0 = outermost ring, 4 = the converted core. */
  currentRing: number;
};

export type FunnelRadialSegment = {
  id: FunnelAcquisition | NlgAcquisition;
  label: string;
  count: number;
  converted: number;
};

export type FunnelRadialModel = {
  nodes: FunnelRadialNode[];
  segments: FunnelRadialSegment[];
};

/**
 * Model for the radial view: the same living nodes as the space (decay,
 * likelihood, contact channels all preserved), placed by acquisition wedge
 * and stage ring. All seven segments are always present so the rim reads as
 * a fixed compass even when a wedge is empty.
 */
export function funnelRadialModel(journeys: FunnelJourney[], now: Date): FunnelRadialModel {
  const nlg = journeys.some((j) => j.nlgAcquisition);
  const segments: FunnelRadialSegment[] = nlg
    ? NLG_ACQUISITIONS.map((a) => ({ ...a, count: 0, converted: 0 }))
    : ACQUISITIONS.map((a) => ({ ...a, count: 0, converted: 0 }));
  const nlgIndex = Object.fromEntries(NLG_ACQUISITIONS.map((a, i) => [a.id, i])) as Record<NlgAcquisition, number>;
  const byId = new Map(journeys.map((j) => [j.id, j]));

  const nodes: FunnelRadialNode[] = funnelSpaceModel(journeys, now).map((n) => {
    const journey = byId.get(n.id);
    const seg = nlg
      ? nlgIndex[journey?.nlgAcquisition ?? 'unknown']
      : SEGMENT_INDEX[acquisitionFor(journey ?? n)];
    segments[seg].count++;
    if (n.state === 'converted') segments[seg].converted++;
    return { ...n, segment: seg, rings: n.hubs, currentRing: n.currentHub };
  });

  return { nodes, segments };
}
