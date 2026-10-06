import { describe, expect, test } from 'vitest';
import { LIFE_AREAS } from '@/lib/life-map';
import {
  VENTURES,
  ventureAgentSet,
  venturesForAgent,
  getVenture,
} from '@/lib/ventures';

import { realAgents } from '@/lib/agents/real';

const KNOWN_AGENTS = new Set(realAgents.map((a) => a.id));

describe('VENTURES', () => {
  test('NLG Agency is the single company lens', () => {
    expect(VENTURES.map((v) => v.id)).toEqual(['nlg']);
    expect(VENTURES[0].label).toBe('NLG Agency');
    expect(VENTURES[0].focus.length).toBeGreaterThan(0);
    expect(VENTURES[0].detail.length).toBeGreaterThan(0);
  });

  test('Personal Brand (brand-deals) is retired from the venture lens', () => {
    expect(getVenture('brand-deals')).toBeNull();
    expect(VENTURES.some((v) => v.label === 'Personal Brand')).toBe(false);
  });

  test('venture colors do not collide with life-area colors', () => {
    const areaColors = new Set(LIFE_AREAS.map((a) => a.color));
    for (const v of VENTURES) expect(areaColors.has(v.color)).toBe(false);
  });

  test('every areaAgents key is a real life area; every agent id is real', () => {
    const areaIds = new Set(LIFE_AREAS.map((a) => a.id));
    for (const v of VENTURES) {
      for (const [areaId, agents] of Object.entries(v.areaAgents)) {
        expect(areaIds.has(areaId), `unknown area ${areaId} in ${v.id}`).toBe(true);
        for (const id of agents) {
          expect(KNOWN_AGENTS.has(id), `unknown agent ${id} in ${v.id}/${areaId}`).toBe(true);
        }
      }
    }
  });

  test('every venture staffs marketing, communication, and finances at minimum', () => {
    for (const v of VENTURES) {
      for (const required of ['marketing', 'communication', 'finances']) {
        expect(
          (v.areaAgents[required] ?? []).length,
          `${v.id} has no agents on ${required}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe('lookups', () => {
  test('getVenture resolves by id and returns null for unknowns', () => {
    expect(getVenture('nlg')?.label).toBe('NLG Agency');
    expect(getVenture('nope')).toBeNull();
  });

  test('ventureAgentSet unions all areas for a venture', () => {
    const set = ventureAgentSet('nlg');
    const nlg = getVenture('nlg')!;
    for (const agents of Object.values(nlg.areaAgents)) {
      for (const id of agents) expect(set.has(id)).toBe(true);
    }
  });

  test('whatsapp-worker serves NLG Agency comms', () => {
    expect(venturesForAgent('whatsapp-worker').some((v) => v.id === 'nlg')).toBe(true);
  });
});
