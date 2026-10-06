import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { CONTENT_DEPT_IDS, contentAgents } from '@/lib/content';

let db: FounderDb;
afterEach(() => db?.close());

describe('contentAgents', () => {
  test('returns the content / production / post crew, lead first', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    expect(crew.some((a) => a.id === 'newsletter-agent')).toBe(true);
    const ids = crew.map((a) => a.id);
    for (const id of ['newsletter-agent', 'reelkit-editor', 'renderly-creative']) {
      expect(ids).toContain(id);
    }
  });

  test('only the content pipeline departments', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const crew = contentAgents(db.agents.all());
    expect(crew.every((a) => (CONTENT_DEPT_IDS as readonly string[]).includes(a.departmentId))).toBe(true);
    expect(crew.map((a) => a.id)).not.toContain('sales-agent');
    expect(crew.map((a) => a.id)).not.toContain('data-agent');
  });

  test('deterministic', () => {
    db = openDb(':memory:');
    seedDatabase(db);
    const a = contentAgents(db.agents.all()).map((x) => x.id);
    const b = contentAgents(db.agents.all()).map((x) => x.id);
    expect(a).toEqual(b);
  });
});
