import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('seedDatabase', () => {
  test('populates core OS entities', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.departments.all().length).toBe(9);
    expect(db.agents.all().length).toBeGreaterThanOrEqual(5);
    expect(db.tools.all().length).toBeGreaterThanOrEqual(8);
    expect(db.roadmap.all().length).toBeGreaterThanOrEqual(10);
    expect(db.metrics.all().length).toBeGreaterThanOrEqual(4);
    expect(db.domains.all().length).toBeGreaterThanOrEqual(8);
    expect(db.phases.all().length).toBeGreaterThanOrEqual(3);
    expect(db.skills.all().length).toBeGreaterThanOrEqual(8);
  });

  test('does not invent company workflows, SOPs, leads, or social metrics', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.workflows.all()).toEqual([]);
    expect(db.sopTasks.all()).toEqual([]);
    expect(db.people.all()).toEqual([]);
    expect(db.leadMagnets.all()).toEqual([]);
    expect(db.funnel.journeys()).toEqual([]);
    expect(db.social.accounts()).toEqual([]);
    expect(db.emailList.snapshots()).toEqual([]);
    expect(db.agentTasks.all().filter((t) => t.id.startsWith('task-seed-'))).toEqual([]);
  });

  test('every agent belongs to an existing department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const deptIds = new Set(db.departments.all().map((d) => d.id));
    for (const agent of db.agents.all()) {
      expect(deptIds.has(agent.departmentId)).toBe(true);
    }
  });

  test('every seeded agent maps to a real runtime agent — no demo', async () => {
    const { realAgents } = await import('@/lib/agents/real');
    db = openDb(':memory:');
    seedDatabase(db);
    const runtimeIds = new Set(realAgents.map((a) => a.id));
    for (const agent of db.agents.all()) {
      expect(runtimeIds.has(agent.id)).toBe(true);
    }
  });

  test('the nine NLG Agency departments, in order', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.departments.all().map((d) => d.name)).toEqual([
      'Leadership',
      'Sales',
      'Client Success',
      'Content',
      'Production',
      'Post Production',
      'Paid Media',
      'Finance & Admin',
      'Growth / NLG Brand',
    ]);
  });

  test('agents are homed in the right department', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byId = new Map(db.agents.all().map((a) => [a.id, a.departmentId]));
    for (const id of [
      'sales-agent',
      'crm-pulse',
      'launchpad-cohort-sales',
      'vantage-sales',
      'vantage-paykit',
      'sales-calls-data',
    ]) {
      expect(byId.get(id)).toBe('dept-sales');
    }
    for (const id of [
      'payments-pulse',
      'stripe-sales',
      'processor-confirmation',
      'paykit-sales',
      'flexpay-financing',
    ]) {
      expect(byId.get(id)).toBe('dept-finance');
    }
    expect(byId.get('social-agent')).toBe('dept-growth');
    expect(byId.get('postly-publisher')).toBe('dept-growth');
    expect(byId.get('dmflow-mcp')).toBe('dept-growth');
    expect(byId.get('adsmith-creative')).toBe('dept-paid-media');
    expect(byId.get('reelkit-editor')).toBe('dept-post-production');
    expect(byId.get('renderly-creative')).toBe('dept-production');
    expect(byId.get('newsletter-agent')).toBe('dept-content');
    for (const id of ['conductor', 'data-agent', 'markdown-auditor', 'vector-auditor', 'stack-monitor']) {
      expect(byId.get(id)).toBe('dept-leadership');
    }
    for (const id of ['comms-agent', 'gmail-worker', 'whatsapp-worker', 'slack-worker', 'client-roster']) {
      expect(byId.get(id)).toBe('dept-client-success');
    }
  });

  test('re-seeding removes departments that left the model', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.departments.insert({ id: 'dept-ghost', name: 'Ghost', slug: 'ghost', tagline: '', color: '#fff', order: 99 });
    seedDatabase(db);
    expect(db.departments.all().some((d) => d.id === 'dept-ghost')).toBe(false);
  });

  test('instance agents have task workers parented beneath them', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const byId = new Map(db.agents.all().map((a) => [a.id, a]));

    for (const worker of ['gmail-worker', 'whatsapp-worker', 'slack-worker']) {
      expect(byId.get(worker)?.parentId).toBe('comms-agent');
      expect(byId.get(worker)?.tier).toBe('worker');
    }
    for (const worker of ['postly-publisher', 'adsmith-creative', 'reelkit-editor', 'renderly-creative', 'dmflow-mcp']) {
      expect(byId.get(worker)?.parentId).toBe('social-agent');
    }
    for (const worker of [
      'crm-pulse',
      'launchpad-cohort-sales',
      'vantage-sales',
      'sales-calls-data',
    ]) {
      expect(byId.get(worker)?.parentId).toBe('sales-agent');
      expect(byId.get(worker)?.tier).toBe('worker');
    }
    expect(byId.get('vantage-paykit')?.parentId).toBe('vantage-sales');
    expect(byId.get('vantage-paykit')?.tier).toBe('worker');
    for (const worker of ['stripe-sales', 'processor-confirmation', 'paykit-sales', 'flexpay-financing']) {
      expect(byId.get(worker)?.parentId).toBe('payments-pulse');
      expect(byId.get(worker)?.tier).toBe('worker');
    }
    for (const worker of ['markdown-auditor', 'vector-auditor']) {
      expect(byId.get(worker)?.parentId).toBe('data-agent');
    }
    expect(byId.get('comms-agent')?.parentId).toBeNull();
    expect(byId.get('comms-agent')?.instance).not.toBe('');
    expect(byId.get('newsletter-agent')?.parentId).toBeNull();
  });

  test('re-seeding removes agents that left the roster', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.agents.insert({
      id: 'ghost', departmentId: 'dept-leadership', name: 'Ghost', role: 'r', status: 'active',
      tier: 'lead', description: '', model: 'm', tools: [], parentId: null, instance: 'builtin',
    });
    seedDatabase(db);
    expect(db.agents.all().some((a) => a.id === 'ghost')).toBe(false);
  });

  test('is idempotent — seeding twice does not duplicate rows', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const counts = {
      departments: db.departments.all().length,
      agents: db.agents.all().length,
      tools: db.tools.all().length,
    };
    seedDatabase(db);
    expect(db.departments.all().length).toBe(counts.departments);
    expect(db.agents.all().length).toBe(counts.agents);
    expect(db.tools.all().length).toBe(counts.tools);
  });

  test('email list stays empty until a live source writes snapshots', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(db.emailList.snapshots()).toEqual([]);
    expect(db.emailList.latest()).toBeNull();
  });

  test('re-seeding drops stale dummy email history and keeps live snapshots', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    db.emailList.insertSnapshot({ capturedAt: '2026-03-14', subscribers: 25800, source: 'seed-dummy' });
    db.emailList.insertSnapshot({ capturedAt: '2026-07-07', subscribers: 4830, source: 'beehiiv' });
    seedDatabase(db);
    const snaps = db.emailList.snapshots();
    expect(snaps.some((s) => s.source === 'seed-dummy')).toBe(false);
    expect(snaps.find((s) => s.capturedAt === '2026-07-07')?.source).toBe('beehiiv');
  });

  test('seeded data passes schema validation end to end', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    expect(() => {
      db.departments.all();
      db.agents.all();
      db.tools.all();
      db.roadmap.all();
      db.metrics.all();
      db.domains.all();
      db.phases.all();
    }).not.toThrow();
  });
});

describe('roadmap grouping', () => {
  test('groups roadmap items by quarter in chronological order', async () => {
    const { groupRoadmapByQuarter } = await import('@/lib/roadmap');
    db = openDb(':memory:');
    seedDatabase(db);
    const grouped = groupRoadmapByQuarter(db.roadmap.all());
    const quarters = grouped.map((g) => g.quarter);
    expect(quarters.length).toBeGreaterThanOrEqual(3);
    expect([...quarters].sort()).toEqual(quarters);
    for (const group of grouped) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
