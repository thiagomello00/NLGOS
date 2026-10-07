import { describe, expect, test } from 'vitest';
import {
  FUNNEL_STAGES,
  funnelSummary,
  funnelSpaceModel,
  journeyMeta,
  presentFunnelJourneys,
  splitFunnelJourneys,
} from '@/lib/funnel';
import { importNlgSalesFunnel, type GhlOpportunity, type GhlPipeline } from '@/lib/funnel-ghl';
import { composeFunnelJourneys, type FunnelComposeDeps } from '@/lib/funnel-compose';
import type { FunnelJourney, FunnelStage } from '@/lib/schemas';

const NOW = new Date('2026-10-06T12:00:00Z');

const NLG: GhlPipeline = {
  id: 'pipe-nlg',
  name: 'NLG Agency',
  stages: [
    { id: 's-new', name: 'New Lead' },
    { id: 's-sched', name: 'Scheduled Call' },
    { id: 's-ns', name: 'No Show' },
    { id: 's-got', name: 'Got in the call' },
    { id: 's-prop', name: 'Proposal Sent' },
    { id: 's-fu', name: 'FU - Interested - HI' },
    { id: 's-sign', name: 'Signed' },
    { id: 's-dq', name: 'Disqualified' },
  ],
};

const ghlOpp = (over: Partial<GhlOpportunity>): GhlOpportunity => ({
  id: 'opp-1',
  name: 'Lead',
  pipelineId: 'pipe-nlg',
  pipelineStageId: 's-new',
  status: 'open',
  createdAt: '2025-01-01T00:00:00.000Z',
  lastStatusChangeAt: '2025-01-02T00:00:00.000Z',
  ...over,
});

const seedJourney = (id: string, status: FunnelStage, lastAt: string): FunnelJourney => ({
  id,
  name: id,
  venture: 'nlg',
  status,
  product: null,
  amountUsd: null,
  relationship: 'warm',
  likelihood: 50,
  url: null,
  email: null,
  phone: null,
  person: null,
  company: null,
  role: null,
  linkedin: null,
  createdAt: lastAt,
  touches: [
    {
      id: `${id}-t1`,
      contactId: id,
      seq: 1,
      stage: status,
      channel: 'organic',
      label: 'seed',
      source: 'manual',
      at: lastAt,
    },
  ],
});

describe('live HighLevel CRM occupancy', () => {
  test('each imported opportunity belongs to exactly one displayed stage from current CRM state', () => {
    const stageIds = ['s-new', 's-sched', 's-ns', 's-got', 's-prop', 's-fu', 's-sign', 's-dq'] as const;
    const { journeys } = importNlgSalesFunnel(
      [NLG],
      stageIds.map((pipelineStageId, i) => ghlOpp({ id: `o${i}`, pipelineStageId })),
      NOW,
    );
    expect(journeys).toHaveLength(8);
    expect(new Set(journeys.map((j) => j.status)).size).toBe(8);
    expect(journeys.every((j) => j.touches.length === 1)).toBe(true);
    expect(journeys.every((j) => j.touches[0].stage === j.status)).toBe(true);
    const summary = funnelSummary(journeys, 'occupancy');
    expect(summary.stages.map((s) => s.total)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(summary.stages.reduce((n, s) => n + s.total, 0)).toBe(journeys.length);
  });

  test('old HighLevel opportunities stay in their current pipeline stage and stay visible', () => {
    const { journeys } = importNlgSalesFunnel(
      [NLG],
      [
        ghlOpp({
          id: 'stale-new',
          pipelineStageId: 's-new',
          lastStatusChangeAt: '2024-01-01T00:00:00.000Z',
        }),
        ghlOpp({
          id: 'stale-dq',
          pipelineStageId: 's-dq',
          status: 'lost',
          lastStatusChangeAt: '2023-06-01T00:00:00.000Z',
        }),
        ghlOpp({
          id: 'old-won-signed',
          pipelineStageId: 's-sign',
          status: 'won',
          lastStatusChangeAt: '2022-01-01T00:00:00.000Z',
        }),
      ],
      NOW,
    );
    const presented = presentFunnelJourneys(journeys, NOW);
    expect(presented.archived).toEqual([]);
    expect(presented.active).toHaveLength(3);
    expect(presented.countMode).toBe('occupancy');
    expect(journeys.find((j) => j.id === 'ghl-stale-new')?.status).toBe('new_lead');
    expect(journeys.find((j) => j.id === 'ghl-stale-dq')?.status).toBe('disqualified');
    expect(journeys.find((j) => j.id === 'ghl-old-won-signed')?.status).toBe('signed');
    expect(journeyMeta(journeys.find((j) => j.id === 'ghl-stale-dq')!, NOW).state).not.toBe('decayed');
    expect(journeyMeta(journeys.find((j) => j.id === 'ghl-old-won-signed')!, NOW).state).toBe('converted');
    const nodes = funnelSpaceModel(presented.active, NOW);
    expect(nodes.every((n) => n.decay === 0)).toBe(true);
  });

  test('occupancy counts match HighLevel board counts, not reached-stage totals', () => {
    const counts: Record<string, number> = {
      's-new': 530,
      's-sched': 254,
      's-ns': 419,
      's-got': 373,
      's-prop': 54,
      's-fu': 17,
      's-sign': 67,
      's-dq': 24,
    };
    const opps = Object.entries(counts).flatMap(([pipelineStageId, n]) =>
      Array.from({ length: n }, (_, i) => ghlOpp({ id: `${pipelineStageId}-${i}`, pipelineStageId })),
    );
    const { journeys } = importNlgSalesFunnel([NLG], opps, NOW);
    const { active, countMode } = presentFunnelJourneys(journeys, NOW);
    const summary = funnelSummary(active, countMode);
    const byStage = Object.fromEntries(summary.stages.map((s) => [s.stage, s.total]));
    expect(active).toHaveLength(1738);
    expect(byStage).toEqual({
      new_lead: 530,
      scheduled_call: 254,
      no_show: 419,
      got_in_the_call: 373,
      proposal_sent: 54,
      fu_interested_hi: 17,
      signed: 67,
      disqualified: 24,
    });
    expect(FUNNEL_STAGES.map((s) => byStage[s.id]).reduce((a, b) => a + b, 0)).toBe(1738);
  });
});

describe('generic non-HighLevel journey infrastructure', () => {
  test('seeded journeys still archive after 90 quiet days and use reached-stage totals', () => {
    const fresh = seedJourney('fresh', 'scheduled_call', '2026-10-05');
    const dead = seedJourney('dead', 'scheduled_call', '2026-01-01');
    const split = splitFunnelJourneys([fresh, dead], NOW);
    expect(split.archived.map((j) => j.id)).toEqual(['dead']);
    expect(split.active.map((j) => j.id)).toEqual(['fresh']);
    const presented = presentFunnelJourneys([fresh, dead], NOW);
    expect(presented.countMode).toBe('reached');
    expect(presented.archived.map((j) => j.id)).toEqual(['dead']);
    const reached = funnelSummary(split.active, 'reached');
    expect(reached.stages[0].total).toBe(1);
    expect(reached.stages.find((s) => s.stage === 'scheduled_call')?.total).toBe(1);
  });
});

describe('composeFunnelJourneys with live HighLevel', () => {
  const ghlRow = (): FunnelJourney => {
    const { journeys } = importNlgSalesFunnel([NLG], [ghlOpp({ id: 'live' })], NOW);
    return journeys[0];
  };

  const deps = (over: Partial<FunnelComposeDeps> = {}): FunnelComposeDeps => ({
    attio: async () => ({
      journeys: [seedJourney('attio-1', 'scheduled_call', '2026-10-01')],
      closedLost: 0,
      total: 1,
    }),
    ghl: async () => ({ journeys: [ghlRow()], excluded: 0, total: 1 }),
    stripe: async () => [
      {
        id: 'ch_x',
        venture: 'nlg',
        email: 'buyer@example.com',
        name: 'Buyer',
        amountUsd: 100,
        product: 'x',
        at: '2026-10-01',
      },
    ],
    trakyo: async () => [],
    seed: () => [seedJourney('seed', 'new_lead', '2026-10-01')],
    ...over,
  });

  test('does not mix Attio or Stripe-created rows into the HighLevel funnel', async () => {
    const c = await composeFunnelJourneys(NOW, undefined, deps());
    expect(c.journeys).toHaveLength(1);
    expect(c.journeys[0].id).toBe('ghl-live');
    expect(c.journeys[0].status).toBe('new_lead');
  });
});
