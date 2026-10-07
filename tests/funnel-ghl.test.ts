import { describe, expect, test } from 'vitest';
import {
  GHL_MAX_PAGES,
  GHL_SEARCH_LIMIT,
  collectGhlSearchOpportunities,
  importNlgSalesFunnel,
  mapGhlOpportunities,
  selectNlgSalesPipeline,
  type GhlPipeline,
  type GhlOpportunity,
} from '@/lib/funnel-ghl';
import { FunnelJourneySchema } from '@/lib/schemas';

const NOW = new Date('2026-07-02T12:00:00Z');

const PIPELINE: GhlPipeline = {
  id: 'pipe-1',
  name: 'LC Mentorship',
  stages: [
    { id: 's-new', name: 'New Lead', position: 0 },
    { id: 's-dm', name: 'DM Convo', position: 1 },
    { id: 's-vsl', name: 'Watched VSL', position: 2 },
    { id: 's-book', name: 'Call Booked', position: 3 },
    { id: 's-show', name: 'Showed Up', position: 4 },
  ],
};

const opp = (over: Partial<GhlOpportunity>): GhlOpportunity => ({
  id: 'opp-1',
  name: 'Kai Rivera',
  pipelineId: 'pipe-1',
  pipelineStageId: 's-new',
  status: 'open',
  monetaryValue: 0,
  createdAt: '2026-06-01T10:00:00.000Z',
  lastStatusChangeAt: '2026-06-28T10:00:00.000Z',
  ...over,
});

describe('mapGhlOpportunities', () => {
  test('maps exact HighLevel stage names onto the NLG pipeline', () => {
    const pipeline: GhlPipeline = {
      id: 'pipe-1',
      name: 'NLG Agency',
      stages: [
        { id: 's-new', name: 'New Lead' },
        { id: 's-sched', name: 'Scheduled Call' },
        { id: 's-ns', name: 'No Show' },
        { id: 's-got', name: 'Got in the Call' },
        { id: 's-prop', name: 'Proposal Sent' },
        { id: 's-fu', name: 'FU - Interested - HI' },
        { id: 's-sign', name: 'Signed' },
        { id: 's-dq', name: 'Disqualified' },
      ],
    };
    const { journeys } = mapGhlOpportunities([pipeline], [
      opp({ id: 'o1', pipelineId: 'pipe-1', pipelineStageId: 's-new' }),
      opp({ id: 'o2', pipelineId: 'pipe-1', pipelineStageId: 's-sched' }),
      opp({ id: 'o3', pipelineId: 'pipe-1', pipelineStageId: 's-fu' }),
      opp({ id: 'o4', pipelineId: 'pipe-1', pipelineStageId: 's-sign' }),
    ], NOW);
    const byId = Object.fromEntries(journeys.map((j) => [j.id, j.status]));
    expect(byId['ghl-o1']).toBe('new_lead');
    expect(byId['ghl-o2']).toBe('scheduled_call');
    expect(byId['ghl-o3']).toBe('fu_interested_hi');
    expect(byId['ghl-o4']).toBe('signed');
  });

  test('produces valid journeys: LC venture, ghl source, stall-ready last-touch date', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [opp({ id: 'o1', pipelineStageId: 's-dm' })], NOW);
    const j = FunnelJourneySchema.parse(journeys[0]);
    expect(j.venture).toBe('nlg');
    expect(j.touches.every((t) => t.source === 'ghl')).toBe(true);
    expect(j.touches[0].at).toBe('2026-06-01'); // created
    expect(j.touches.at(-1)?.at).toBe('2026-06-28'); // last stage change → decay clock
  });

  test('carries the contact channel data and deep-links the GHL contact page', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [
      opp({
        id: 'o1',
        contactId: 'CUeK123',
        contact: { name: 'Casey Jordan', email: 'casey.jordan@example.com', phone: '+15550100412' },
      }),
    ], NOW, 'loc_abc');
    const j = journeys[0];
    expect(j.email).toBe('casey.jordan@example.com');
    expect(j.phone).toBe('+15550100412');
    expect(j.url).toBe('https://app.gohighlevel.com/v2/location/loc_abc/contacts/detail/CUeK123');
  });

  test('won opportunities pin to Signed; lost and abandoned stay visible as Disqualified', () => {
    const { journeys, excluded } = mapGhlOpportunities([PIPELINE], [
      opp({ id: 'won', status: 'won', monetaryValue: 6800, pipelineStageId: 's-show' }),
      opp({ id: 'lost', status: 'lost' }),
      opp({ id: 'gone', status: 'abandoned' }),
    ], NOW);
    expect(journeys.map((j) => j.id).sort()).toEqual(['ghl-gone', 'ghl-lost', 'ghl-won']);
    expect(journeys.find((j) => j.id === 'ghl-won')?.status).toBe('signed');
    expect(journeys.find((j) => j.id === 'ghl-won')?.amountUsd).toBe(6800);
    expect(journeys.find((j) => j.id === 'ghl-lost')?.status).toBe('disqualified');
    expect(excluded).toBe(0);
  });

  test('unknown pipeline or stage ids are skipped, never fatal', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [
      opp({ id: 'ok' }),
      opp({ id: 'ghost-pipe', pipelineId: 'nope' }),
      opp({ id: 'ghost-stage', pipelineStageId: 'nope' }),
    ], NOW);
    expect(journeys.map((j) => j.id)).toEqual(['ghl-ok']);
  });

  test('exact HighLevel names win over pipeline position', () => {
    const pipeline: GhlPipeline = {
      id: 'pipe-1',
      name: 'NLG Agency',
      stages: [
        { id: 's-a', name: 'Webinar Meetings' },
        { id: 's-fu', name: 'FU - Interested - HI' },
        { id: 's-z', name: 'Student Onboarded' },
      ],
    };
    const { journeys } = mapGhlOpportunities([pipeline], [
      opp({ id: 'o-n', pipelineId: 'pipe-1', pipelineStageId: 's-fu' }),
    ], NOW);
    expect(journeys[0].status).toBe('fu_interested_hi');
  });

  test('likelihood grows with pipeline depth and money on the table', () => {
    const { journeys } = mapGhlOpportunities([PIPELINE], [
      opp({ id: 'shallow', pipelineStageId: 's-new' }),
      opp({ id: 'deep', pipelineStageId: 's-show', monetaryValue: 5000 }),
    ], NOW);
    const shallow = journeys.find((j) => j.id === 'ghl-shallow')!;
    const deep = journeys.find((j) => j.id === 'ghl-deep')!;
    expect(deep.likelihood).toBeGreaterThan(shallow.likelihood);
    expect(shallow.likelihood).toBeGreaterThanOrEqual(0);
    expect(deep.likelihood).toBeLessThanOrEqual(100);
  });
});

const NLG_SALES: GhlPipeline = {
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

const OTHER_PIPELINES: GhlPipeline[] = [
  {
    id: 'pipe-buyer',
    name: 'NLG Media Buyer',
    stages: [
      { id: 'b1', name: 'New Application' },
      { id: 'b2', name: 'Disqualified' },
      { id: 'b3', name: 'Maybe' },
      { id: 'b4', name: 'Qualified' },
      { id: 'b5', name: 'Hired' },
    ],
  },
  {
    id: 'pipe-surgeons',
    name: 'Plastic Surgeons Kia Kesser',
    stages: [
      { id: 'p1', name: 'New Lead' },
      { id: 'p2', name: '1st Call' },
      { id: 'p3', name: 'Not interested' },
      { id: 'p4', name: 'Interested' },
      { id: 'p5', name: '2nd Call' },
      { id: 'p6', name: '3rd Call' },
      { id: 'p7', name: 'Booked Call' },
      { id: 'p8', name: 'Proposal Sent' },
      { id: 'p9', name: 'Closed' },
    ],
  },
  {
    id: 'pipe-dms',
    name: 'COLD DMs',
    stages: [
      { id: 'd1', name: 'New Lead' },
      { id: 'd2', name: 'Replied' },
      { id: 'd3', name: 'Scheduled Call' },
      { id: 'd4', name: 'Closed' },
      { id: 'd5', name: 'Disqualified' },
    ],
  },
  {
    id: 'pipe-editors',
    name: 'NLG Video Editors',
    stages: [
      { id: 'e1', name: 'Editor Application' },
      { id: 'e2', name: 'Disqualified' },
      { id: 'e3', name: 'Qualified' },
      { id: 'e4', name: 'Maybe' },
      { id: 'e5', name: 'Will send trial' },
      { id: 'e6', name: 'Hired' },
    ],
  },
];

const SAME_STAGES_DECOY: GhlPipeline = {
  id: 'pipe-decoy',
  name: 'Recruiting decoy',
  stages: NLG_SALES.stages.map((s) => ({ ...s, id: `decoy-${s.id}` })),
};

describe('selectNlgSalesPipeline', () => {
  test('selects only the pipeline whose exact name is NLG Agency', () => {
    const selected = selectNlgSalesPipeline([
      ...OTHER_PIPELINES,
      SAME_STAGES_DECOY,
      NLG_SALES,
      PIPELINE,
    ]);
    expect(selected?.id).toBe('pipe-nlg');
    expect(selected?.name).toBe('NLG Agency');
  });

  test('does not select similarly named or recruiting pipelines', () => {
    expect(selectNlgSalesPipeline(OTHER_PIPELINES)).toBeNull();
    expect(selectNlgSalesPipeline([SAME_STAGES_DECOY])).toBeNull();
    expect(selectNlgSalesPipeline([{ ...NLG_SALES, name: 'NLG Agency Sales' }])).toBeNull();
  });
});

describe('collectGhlSearchOpportunities', () => {
  test('keeps paging past 1,000 opportunities', async () => {
    const pages = await collectGhlSearchOpportunities(async (page) => {
      const count = page <= 11 ? 100 : page === 12 ? 50 : 0;
      return {
        opportunities: Array.from({ length: count }, (_, i) =>
          opp({ id: `p${page}-${i}`, pipelineId: 'pipe-nlg' }),
        ),
        nextPage: page < 12 ? page + 1 : null,
      };
    });
    expect(pages).toHaveLength(1150);
  });

  test('stops when a page is short of the page size', async () => {
    let calls = 0;
    const pages = await collectGhlSearchOpportunities(async (page) => {
      calls += 1;
      return {
        opportunities: Array.from({ length: page === 1 ? 100 : 3 }, (_, i) => opp({ id: `${page}-${i}` })),
      };
    });
    expect(calls).toBe(2);
    expect(pages).toHaveLength(103);
  });

  test('stops when nextPage is null even if the page is full', async () => {
    let calls = 0;
    const pages = await collectGhlSearchOpportunities(async (page) => {
      calls += 1;
      return {
        opportunities: Array.from({ length: 100 }, (_, i) => opp({ id: `${page}-${i}` })),
        nextPage: page === 1 ? 2 : null,
      };
    });
    expect(calls).toBe(2);
    expect(pages).toHaveLength(200);
  });

  test('stops at the safety ceiling instead of looping forever', async () => {
    let calls = 0;
    const pages = await collectGhlSearchOpportunities(
      async (page) => {
        calls += 1;
        return { opportunities: Array.from({ length: 100 }, (_, i) => opp({ id: `${page}-${i}` })) };
      },
      { maxPages: 3 },
    );
    expect(calls).toBe(3);
    expect(pages).toHaveLength(300);
    expect(GHL_MAX_PAGES * GHL_SEARCH_LIMIT).toBeGreaterThanOrEqual(5000);
    expect(GHL_MAX_PAGES).toBeGreaterThan(10);
  });
});

describe('importNlgSalesFunnel', () => {
  test('imports only the NLG sales pipeline and maps every HighLevel stage name', () => {
    const stageIds = ['s-new', 's-sched', 's-ns', 's-got', 's-prop', 's-fu', 's-sign', 's-dq'] as const;
    const expected = [
      'new_lead',
      'scheduled_call',
      'no_show',
      'got_in_the_call',
      'proposal_sent',
      'fu_interested_hi',
      'signed',
      'disqualified',
    ];
    const nlgOpps = stageIds.map((pipelineStageId, i) =>
      opp({ id: `nlg-${i}`, pipelineId: 'pipe-nlg', pipelineStageId }),
    );
    const otherOpps = [
      opp({ id: 'dm-1', pipelineId: 'pipe-dms', pipelineStageId: 'd1' }),
      opp({ id: 'dm-won', pipelineId: 'pipe-dms', pipelineStageId: 'd4', status: 'won' }),
      opp({ id: 'buyer-1', pipelineId: 'pipe-buyer', pipelineStageId: 'b1' }),
      opp({ id: 'editor-1', pipelineId: 'pipe-editors', pipelineStageId: 'e1' }),
      opp({ id: 'decoy-1', pipelineId: 'pipe-decoy', pipelineStageId: 'decoy-s-new' }),
    ];
    const { journeys, total, excluded, pipelineName } = importNlgSalesFunnel(
      [NLG_SALES, SAME_STAGES_DECOY, ...OTHER_PIPELINES],
      [...otherOpps, ...nlgOpps],
      NOW,
    );
    expect(pipelineName).toBe('NLG Agency');
    expect(total).toBe(8);
    expect(excluded).toBe(5);
    expect(journeys).toHaveLength(8);
    expect(journeys.every((j) => j.id.startsWith('ghl-nlg-'))).toBe(true);
    expect(journeys.some((j) => /editor|decoy|dm-|buyer/.test(j.id))).toBe(false);
    const byId = Object.fromEntries(journeys.map((j) => [j.id, j.status]));
    expected.forEach((status, i) => expect(byId[`ghl-nlg-${i}`]).toBe(status));
  });

  test('won and lost do not move a live HighLevel opportunity off its current pipeline stage', () => {
    const { journeys, excluded } = importNlgSalesFunnel(
      [NLG_SALES, ...OTHER_PIPELINES],
      [
        opp({ id: 'nlg-won', pipelineId: 'pipe-nlg', pipelineStageId: 's-got', status: 'won' }),
        opp({ id: 'nlg-lost', pipelineId: 'pipe-nlg', pipelineStageId: 's-new', status: 'lost' }),
        opp({ id: 'nlg-ab', pipelineId: 'pipe-nlg', pipelineStageId: 's-sched', status: 'abandoned' }),
        opp({ id: 'nlg-sign', pipelineId: 'pipe-nlg', pipelineStageId: 's-sign', status: 'won' }),
        opp({ id: 'nlg-dq', pipelineId: 'pipe-nlg', pipelineStageId: 's-dq', status: 'lost' }),
        opp({ id: 'dm-won', pipelineId: 'pipe-dms', pipelineStageId: 'd3', status: 'won' }),
        opp({ id: 'editor-1', pipelineId: 'pipe-editors', pipelineStageId: 'e1' }),
      ],
      NOW,
    );
    expect(excluded).toBe(2);
    const byId = Object.fromEntries(journeys.map((j) => [j.id, j.status]));
    expect(byId['ghl-nlg-won']).toBe('got_in_the_call');
    expect(byId['ghl-nlg-lost']).toBe('new_lead');
    expect(byId['ghl-nlg-ab']).toBe('scheduled_call');
    expect(byId['ghl-nlg-sign']).toBe('signed');
    expect(byId['ghl-nlg-dq']).toBe('disqualified');
  });
});

