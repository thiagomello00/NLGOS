import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { LeadMagnetSchema } from '@/lib/schemas';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Lead magnets (the operator, 2026-08-13): every Vercel landing page we ship lives
 * in the OS under Content, in a Notion-style list. This is the first step of
 * retiring Notion, so the row shape has to carry what Notion carried: status,
 * where it lives, what it captures, and where those leads land.
 */
let db: FounderDb;

beforeAll(() => {
  db = openDb(':memory:');
  seedDatabase(db);
});

describe('lead magnet rows', () => {
  test('NLG seed does not invent lead magnets', () => {
    expect(db.leadMagnets.all()).toEqual([]);
  });

  test('insert + re-seed is idempotent by id', () => {
    const before = db.leadMagnets.all().length;
    seedDatabase(db);
    expect(db.leadMagnets.all().length).toBe(before);
  });
});

describe('GET /api/lead-magnets', () => {
  test('answers 200 with the rows', async () => {
    process.env.FOUNDER_OS_DB = ':memory:';
    const mod = await import('@/app/api/lead-magnets/route');
    const res = (await mod.GET()) as Response;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { leadMagnets: unknown[] };
    expect(Array.isArray(body.leadMagnets)).toBe(true);
  });
});

describe('back-fill on existing databases', () => {
  test('empty lead magnets are allowed — getDb does not treat them as an unseeded install', () => {
    const src = read('lib/data.ts');
    expect(src).not.toContain('instance.leadMagnets.all().length === 0');
  });
});

describe('the Content surface', () => {
  test('the top section is the in-OS Lead Magnets index', () => {
    const page = read('app/content/page.tsx');
    expect(page).toContain('Lead Magnets');
    expect(page).not.toContain('Vantage Intel');
    expect(page).not.toContain('intel.example.com');
    expect(page).toContain('href="/content/lead-magnets"');
  });

  test('the Lead Magnets page lists the pages with copyable live links', () => {
    const page = read('app/content/lead-magnets/page.tsx');
    // the full page copies links AND manages rows (status, delete); the
    // dashboard card renders the same table without either
    expect(page).toMatch(/<LeadMagnets rows=\{rows\}[^>]*showCopy[^>]*\/>/);
    expect(page).toMatch(/<LeadMagnets rows=\{rows\}[^>]*manage[^>]*\/>/);
    expect(page).toContain('<NewLeadMagnet />');
    const list = read('components/LeadMagnets.tsx');
    // Notion-style: a database-like table with property columns, not cards
    for (const col of ['Name', 'Status', 'Captures', 'Leads to']) {
      expect(list).toContain(col);
    }
    // every row opens the real page
    expect(list).toContain('target="_blank"');
  });
});
