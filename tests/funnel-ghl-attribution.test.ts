import { describe, expect, test } from 'vitest';
import { nlgAttributionFromGhl } from '@/lib/funnel-ghl-attribution';
import { importNlgSalesFunnel, type GhlOpportunity, type GhlPipeline } from '@/lib/funnel-ghl';
import { funnelSummary, funnelSpaceModel, nlgFunnelKpis, presentFunnelJourneys } from '@/lib/funnel';
import { funnelVolume } from '@/lib/funnel-volume';
import { originOf } from '@/lib/funnel-radial';

const NOW = new Date('2026-10-06T12:00:00Z');

const NLG: GhlPipeline = {
  id: 'pipe-nlg',
  name: 'NLG Agency',
  stages: [
    { id: 's-new', name: 'New Lead' },
    { id: 's-sched', name: 'Scheduled Call' },
    { id: 's-sign', name: 'Signed' },
    { id: 's-dq', name: 'Disqualified' },
    { id: 's-ns', name: 'No Show' },
    { id: 's-got', name: 'Got in the Call' },
    { id: 's-prop', name: 'Proposal Sent' },
    { id: 's-fu', name: 'FU - Interested - HI' },
  ],
};

const opp = (over: Partial<GhlOpportunity>): GhlOpportunity => ({
  id: 'opp-1',
  name: 'Lead',
  pipelineId: 'pipe-nlg',
  pipelineStageId: 's-new',
  status: 'open',
  monetaryValue: 0,
  createdAt: '2026-06-01T00:00:00.000Z',
  lastStatusChangeAt: '2026-06-02T00:00:00.000Z',
  ...over,
});

describe('nlgAttributionFromGhl', () => {
  test('prefers isFirst attribution over opportunity source', () => {
    const a = nlgAttributionFromGhl({
      source: 'VSL - Qualification Survey',
      attributions: [
        { isFirst: true, utmSource: 'Instagram_Reels', utmMedium: 'ig', utmCampaign: 'VSL26_Lead', utmContent: 'POV-og-video', utmSessionSource: 'Social media', medium: 'survey' },
        { isFirst: false, medium: 'calendar', utmSessionSource: 'Direct traffic' },
      ],
    });
    expect(a.category).toBe('instagram_meta');
    expect(a.campaign).toBe('VSL26_Lead');
    expect(a.content).toBe('POV-og-video');
    expect(a.opportunitySource).toBe('VSL - Qualification Survey');
  });

  test('falls back to opportunity source when isFirst is missing', () => {
    expect(nlgAttributionFromGhl({ source: 'IG DMs', attributions: [{ medium: 'calendar', utmSessionSource: 'Direct traffic' }] }).category).toBe(
      'instagram_meta',
    );
    expect(nlgAttributionFromGhl({ source: 'Direct traffic' }).category).toBe('direct');
  });

  test('Unknown when attribution and source are absent — never Word of Mouth', () => {
    const a = nlgAttributionFromGhl({});
    expect(a.category).toBe('unknown');
  });

  test('Instagram / Meta Ads from placements, ig/fb mediums, and Paid Social', () => {
    expect(nlgAttributionFromGhl({ attributions: [{ isFirst: true, utmSource: 'Instagram_Feed', utmMedium: 'ig' }] }).category).toBe(
      'instagram_meta',
    );
    expect(nlgAttributionFromGhl({ attributions: [{ isFirst: true, utmSource: 'Facebook_Mobile_Feed', utmMedium: 'fb' }] }).category).toBe(
      'instagram_meta',
    );
    expect(nlgAttributionFromGhl({ attributions: [{ isFirst: true, utmMedium: 'paid', utmSessionSource: 'Paid Social' }] }).category).toBe(
      'instagram_meta',
    );
    expect(nlgAttributionFromGhl({ attributions: [{ isFirst: true, medium: 'instagram' }] }).category).toBe('instagram_meta');
  });

  test('Social media session without Meta evidence is Other, not paid Meta', () => {
    expect(
      nlgAttributionFromGhl({
        source: 'VSL - Qualification Survey',
        attributions: [{ isFirst: true, utmSessionSource: 'Social media', medium: 'survey' }],
      }).category,
    ).toBe('other');
  });

  test('Direct, Organic, Referral, Other', () => {
    expect(nlgAttributionFromGhl({ attributions: [{ isFirst: true, utmSessionSource: 'Direct traffic' }] }).category).toBe('direct');
    expect(nlgAttributionFromGhl({ attributions: [{ isFirst: true, utmSessionSource: 'Organic Search' }] }).category).toBe('organic');
    expect(nlgAttributionFromGhl({ attributions: [{ isFirst: true, utmSessionSource: 'Referral' }] }).category).toBe('referral');
    expect(nlgAttributionFromGhl({ attributions: [{ isFirst: true, utmSessionSource: 'CRM UI', medium: 'manual' }] }).category).toBe(
      'other',
    );
  });

  test('does not treat VSL form name as overwriting first-touch Meta UTMs', () => {
    expect(
      nlgAttributionFromGhl({
        source: 'VSL - Qualification Survey',
        attributions: [{ isFirst: true, utmSource: 'ig', utmMedium: 'ig', utmSessionSource: 'Social media', medium: 'survey' }],
      }).category,
    ).toBe('instagram_meta');
  });
});

describe('live HighLevel KPIs and occupancy', () => {
  test('Total / Open / Signed / Disqualified / Revenue from current CRM stages', () => {
    const { journeys } = importNlgSalesFunnel(
      [NLG],
      [
        opp({ id: 'a', pipelineStageId: 's-new', monetaryValue: 2500 }),
        opp({ id: 'b', pipelineStageId: 's-sched', monetaryValue: 2500 }),
        opp({ id: 'c', pipelineStageId: 's-sign', monetaryValue: 4800, status: 'won' }),
        opp({ id: 'd', pipelineStageId: 's-sign', monetaryValue: 1200, status: 'won' }),
        opp({ id: 'e', pipelineStageId: 's-dq', monetaryValue: 2500, status: 'lost' }),
      ],
      NOW,
    );
    const kpis = nlgFunnelKpis(journeys);
    expect(kpis).toEqual({
      totalLeads: 5,
      openLeads: 2,
      signed: 2,
      disqualified: 1,
      revenueUsd: 6000,
    });
    expect(journeys.every((j) => j.touches.length === 1 && j.touches[0].stage === j.status)).toBe(true);
  });

  test('occupancy volume has no conversion percentages', () => {
    const { journeys } = importNlgSalesFunnel([NLG], [opp({ id: 'a' }), opp({ id: 'b', pipelineStageId: 's-sign', monetaryValue: 10 })], NOW);
    const presented = presentFunnelJourneys(journeys, NOW);
    expect(presented.countMode).toBe('occupancy');
    const summary = funnelSummary(presented.active, 'occupancy');
    expect(summary.stages.every((s) => s.conversionFromPrev === null)).toBe(true);
    const vol = funnelVolume({ journeys: presented.active, archived: 0, now: NOW, countMode: 'occupancy' });
    expect(vol.meters.every((m) => !m.display.includes('%') && !m.label.includes('→'))).toBe(true);
    expect(vol.foot).toContain('not historical conversion');
    expect(vol.chips.some((c) => /closed|archived|active client/i.test(c.text))).toBe(false);
  });

  test('mapped HighLevel journeys carry NLG attribution and one current stage', () => {
    const { journeys } = importNlgSalesFunnel(
      [NLG],
      [
        opp({
          id: 'ig',
          attributions: [{ isFirst: true, utmSource: 'Instagram_Stories', utmMedium: 'ig', utmCampaign: 'VSL26_Lead' }],
          source: 'VSL - Qualification Survey',
        }),
        opp({ id: 'none' }),
      ],
      NOW,
    );
    expect(journeys.find((j) => j.id === 'ghl-ig')?.nlgAcquisition).toBe('instagram_meta');
    expect(journeys.find((j) => j.id === 'ghl-none')?.nlgAcquisition).toBe('unknown');
    expect(originOf(journeys.find((j) => j.id === 'ghl-ig')!).segment).toBe('Instagram / Meta Ads');
    expect(originOf(journeys.find((j) => j.id === 'ghl-none')!).segment).toBe('Unknown');
    const nodes = funnelSpaceModel(journeys, NOW);
    expect(nodes.every((n) => n.hubs.length === 1)).toBe(true);
  });
});
