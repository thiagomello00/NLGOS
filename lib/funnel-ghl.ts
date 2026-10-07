/**
 * GoHighLevel provider — NLG Agency sales pipeline mapped into FunnelJourney.
 * Auth is a Private Integration Token: set GHL_API_KEY + GHL_LOCATION_ID in
 * .env.local. Honest null when unkeyed or unreachable.
 *
 * Stage mapping prefers exact HighLevel names (the live NLG pipeline). Won
 * opportunities pin to Signed; lost/abandoned land on Disqualified so they
 * stay visible until GHL is the source of truth.
 */
import { resolveCred, CRED_FILES } from '@/lib/creds';
import { FUNNEL_STAGES, isWonStage } from '@/lib/funnel';
import { FunnelJourneySchema, type FunnelJourney, type FunnelStage, type FunnelTouch } from '@/lib/schemas';

export type GhlPipeline = {
  id: string;
  name: string;
  stages: { id: string; name: string; position?: number }[];
};

export type GhlOpportunity = {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: 'open' | 'won' | 'lost' | 'abandoned';
  monetaryValue?: number;
  createdAt?: string;
  updatedAt?: string;
  lastStatusChangeAt?: string;
  contactId?: string;
  contact?: { name?: string; email?: string | null; phone?: string | null };
  source?: string;
  attributions?: { utmSource?: string; medium?: string }[];
};

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

/** Page size HighLevel accepts on opportunity search. */
export const GHL_SEARCH_LIMIT = 100;
/** Safety ceiling: 80 pages × 100 = 8,000 opportunities (live location is ~2.3k). */
export const GHL_MAX_PAGES = 80;

/** The only HighLevel pipeline that may feed Funnel. Matched by exact name; UUID is discovered at runtime. */
export const NLG_AGENCY_PIPELINE_NAME = 'NLG Agency';

/**
 * Pick the NLG Agency pipeline by exact name. UUIDs stay dynamic — never hardcoded.
 */
export function selectNlgSalesPipeline(pipelines: GhlPipeline[]): GhlPipeline | null {
  return pipelines.find((p) => p.name.trim() === NLG_AGENCY_PIPELINE_NAME) ?? null;
}

export type GhlSearchPage = {
  opportunities: GhlOpportunity[];
  nextPage?: number | null;
};

/** Walk HighLevel search pages until a short page, a null nextPage, or the safety ceiling. */
export async function collectGhlSearchOpportunities(
  fetchPage: (page: number) => Promise<GhlSearchPage>,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<GhlOpportunity[]> {
  const pageSize = options.pageSize ?? GHL_SEARCH_LIMIT;
  const maxPages = options.maxPages ?? GHL_MAX_PAGES;
  const out: GhlOpportunity[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const { opportunities, nextPage } = await fetchPage(page);
    const batch = opportunities ?? [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    if (nextPage === null) break;
  }
  return out;
}

/** Scope a location payload to the NLG sales pipeline, then map journeys. */
export function importNlgSalesFunnel(
  pipelines: GhlPipeline[],
  opportunities: GhlOpportunity[],
  now: Date,
  locationId?: string,
): { journeys: FunnelJourney[]; excluded: number; total: number; pipelineName: string | null } {
  const selected = selectNlgSalesPipeline(pipelines);
  if (!selected) {
    return { journeys: [], excluded: opportunities.length, total: 0, pipelineName: null };
  }
  const scoped = opportunities.filter((o) => o.pipelineId === selected.id);
  const mapped = mapGhlOpportunities([selected], scoped, now, locationId, { currentCrmState: true });
  return { ...mapped, excluded: opportunities.length - scoped.length, pipelineName: selected.name };
}

const GHL_STAGE_BY_NAME: Record<string, FunnelStage> = {
  'new lead': 'new_lead',
  'scheduled call': 'scheduled_call',
  'no show': 'no_show',
  'got in the call': 'got_in_the_call',
  'proposal sent': 'proposal_sent',
  'fu - interested - hi': 'fu_interested_hi',
  signed: 'signed',
  disqualified: 'disqualified',
};

function stageFromName(stageName: string): FunnelStage | null {
  return GHL_STAGE_BY_NAME[stageName.trim().toLowerCase()] ?? null;
}

function stageFor(fraction: number, stageName: string): FunnelStage {
  const named = stageFromName(stageName);
  if (named) return named;
  if (fraction <= 0) return 'new_lead';
  const idx = Math.min(FUNNEL_STAGES.length - 1, Math.round(fraction * (FUNNEL_STAGES.length - 1)));
  return FUNNEL_STAGES[idx].id;
}

const day = (iso: string | undefined, fallback: string): string => (iso ?? fallback).slice(0, 10);

/** Pure mapper: GHL pipelines + opportunities → validated journeys. */
export function mapGhlOpportunities(
  pipelines: GhlPipeline[],
  opportunities: GhlOpportunity[],
  now: Date,
  locationId?: string,
  opts: { currentCrmState?: boolean } = {},
): { journeys: FunnelJourney[]; excluded: number; total: number } {
  const stageIndex = new Map<string, { idx: number; count: number; name: string }>();
  for (const p of pipelines) {
    p.stages.forEach((s, idx) => stageIndex.set(`${p.id}:${s.id}`, { idx, count: p.stages.length, name: s.name }));
  }

  let excluded = 0;
  const journeys: FunnelJourney[] = [];

  for (const o of opportunities) {
    const stage = stageIndex.get(`${o.pipelineId}:${o.pipelineStageId}`);
    if (!stage) continue; // unknown pipeline/stage — skip, never fatal

    const fraction = stage.count > 1 ? stage.idx / (stage.count - 1) : 0;
    const lost = o.status === 'lost' || o.status === 'abandoned';
    const won = o.status === 'won';
    const named = stageFromName(stage.name) ?? stageFor(fraction, stage.name);
    const canonical: FunnelStage = opts.currentCrmState ? named : won ? 'signed' : lost ? 'disqualified' : named;
    const hubIdx = FUNNEL_STAGES.findIndex((s) => s.id === canonical);
    const id = `ghl-${o.id}`;
    const createdAt = day(o.createdAt, '1970-01-01');
    const lastAt = day(o.lastStatusChangeAt ?? o.updatedAt, o.createdAt ?? '1970-01-01');
    const value = o.monetaryValue ?? 0;
    const via = [
      ...new Set(
        [o.source, ...(o.attributions ?? []).flatMap((a) => [a.utmSource, a.medium])]
          .filter((v): v is string => Boolean(v))
          .filter((v) => !/^\d{4}-\d{2}-\d{2}T/.test(v)),
      ),
    ];
    const score = won ? 100 : lost ? 0 : Math.min(100, 20 + Math.round(fraction * 50) + (value > 0 ? 15 : 0));

    const touches: FunnelTouch[] = opts.currentCrmState
      ? [
          {
            id: `${id}-t1`,
            contactId: id,
            seq: 1,
            stage: canonical,
            channel: 'crm',
            label: `GHL stage: ${stage.name}`,
            source: 'ghl' as const,
            at: lastAt,
          },
        ]
      : FUNNEL_STAGES.slice(0, Math.max(0, hubIdx) + 1).map((s, i) => ({
          id: `${id}-t${i + 1}`,
          contactId: id,
          seq: i + 1,
          stage: s.id,
          channel: i === hubIdx && won ? 'checkout' : 'crm',
          label:
            i === 0
              ? `Opportunity created in GHL${via.length ? ` · via: ${via.join(', ')}` : ''}`
              : i === hubIdx
                ? `GHL stage: ${stage.name}${won ? ' (won)' : lost ? ' (lost)' : ''}`
                : `Progressed to ${s.label}`,
          source: 'ghl' as const,
          at: i === hubIdx ? lastAt : createdAt,
        }));

    try {
      journeys.push(
        FunnelJourneySchema.parse({
          id,
          name: o.contact?.name || o.name || 'Unnamed opportunity',
          venture: 'nlg',
          status: canonical,
          product: isWonStage(canonical) ? `GHL: ${stage.name}` : null,
          amountUsd: value > 0 ? value : won ? 0 : null,
          relationship: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
          likelihood: score,
          url:
            locationId && o.contactId
              ? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${o.contactId}`
              : null,
          email: o.contact?.email ?? null,
          phone: o.contact?.phone ?? null,
          createdAt,
          touches,
        }),
      );
    } catch {
      // malformed row — skip
    }
  }

  journeys.sort((a, b) => (b.touches.at(-1)?.at ?? '').localeCompare(a.touches.at(-1)?.at ?? ''));
  void now;
  return { journeys, excluded, total: opportunities.length };
}

/**
 * Fetch the live GHL pipeline. Null = not available (no token / API error);
 * the funnel simply runs without the GHL lane and the source strip says so.
 */
export async function ghlFunnelJourneys(
  now = new Date(),
): Promise<{ journeys: FunnelJourney[]; excluded: number; total: number } | null> {
  if ((process.env.FUNNEL_PROVIDER ?? 'attio') !== 'attio') return null; // seed-pinned (tests)
  const key = resolveCred('GHL_API_KEY', [CRED_FILES.brainAgent]);
  const locationId = resolveCred('GHL_LOCATION_ID', [CRED_FILES.brainAgent]);
  if (!key || !locationId) return null;
  const headers = { Authorization: `Bearer ${key}`, Version: GHL_VERSION, Accept: 'application/json' };
  try {
    const pipeRes = await fetch(`${GHL_BASE}/opportunities/pipelines?locationId=${locationId}`, {
      headers,
      cache: 'no-store',
    });
    if (!pipeRes.ok) return null;
    const pipelines = ((await pipeRes.json()) as { pipelines?: GhlPipeline[] }).pipelines ?? [];

    const opportunities = await collectGhlSearchOpportunities(async (page) => {
      const res = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${locationId}&limit=${GHL_SEARCH_LIMIT}&page=${page}`,
        { headers, cache: 'no-store' },
      );
      if (!res.ok) throw new Error('ghl-search');
      const body = (await res.json()) as {
        opportunities?: GhlOpportunity[];
        meta?: { nextPage?: number | null };
      };
      return { opportunities: body.opportunities ?? [], nextPage: body.meta?.nextPage ?? null };
    });
    return importNlgSalesFunnel(pipelines, opportunities, now, locationId);
  } catch {
    return null;
  }
}
