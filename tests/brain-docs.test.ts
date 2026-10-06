import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { buildBrainDocs, writeBrainDocs, GENERATED_MARKER } from '@/lib/brain-docs';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

function seeded(): FounderDb {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
}

function docsFor(d: FounderDb) {
  return buildBrainDocs({
    departments: d.departments.all(),
    agents: d.agents.all(),
    people: d.people.all(),
    tasks: d.sopTasks.all(),
    tools: d.tools.all(),
  });
}

describe('buildBrainDocs', () => {
  test('one doc per agent, tool and pillar; SOPs and people stay empty until real NLG content lands', () => {
    const d = seeded();
    const docs = docsFor(d);
    expect(docs.filter((x) => x.path.startsWith('agents/')).length).toBe(d.agents.all().length);
    expect(docs.filter((x) => x.path.startsWith('sops/')).length).toBe(0);
    expect(docs.filter((x) => x.path.startsWith('tools/')).length).toBe(d.tools.all().length);
    expect(docs.filter((x) => x.path.startsWith('people/')).length).toBe(0);
    expect(docs.filter((x) => x.path.startsWith('org/pillar-')).length).toBe(d.departments.all().length);
    expect(docs.some((x) => x.path === 'agents/gmail-worker.md')).toBe(true);
    expect(docs.some((x) => x.path === 'tools/imap.md')).toBe(true);
    expect(docs.some((x) => x.path.startsWith('org/pillar-'))).toBe(true);
  });

  test('every doc carries the generated marker in frontmatter', () => {
    const docs = docsFor(seeded());
    for (const doc of docs) expect(doc.content).toContain(GENERATED_MARKER);
  });

  test('an agent doc holds its charter and wikilinked tools', () => {
    const docs = docsFor(seeded());
    const gmail = docs.find((x) => x.path === 'agents/gmail-worker.md')!.content;
    expect(gmail).toContain('IMAP Inboxes');
    expect(gmail).toContain('[[imap]]');
    expect(gmail).toContain('[[comms-agent]]');
  });

  test('SOP docs are omitted until NLG SOPs are written', () => {
    const docs = docsFor(seeded());
    expect(docs.filter((x) => x.path.startsWith('sops/'))).toEqual([]);
  });

  test('a tool doc lists who uses it, wikilinked', () => {
    const docs = docsFor(seeded());
    const ledger = docs.find((x) => x.path === 'tools/ledger.md')!.content;
    expect(ledger).toContain('[[sales-agent]]');
  });

  test('a pillar doc rosters its workers; people and SOPs stay empty until real NLG content lands', () => {
    const docs = docsFor(seeded());
    const clients = docs.find((x) => x.path === 'org/pillar-client-success.md')!.content;
    expect(clients).toContain('[[client-roster]]');
    expect(clients).not.toContain('[[person-sasha]]');
    expect(clients).not.toContain('[[sop-client-onboarding]]');
  });

  test('deterministic output', () => {
    const d = seeded();
    expect(docsFor(d)).toEqual(docsFor(d));
  });
});

describe('writeBrainDocs', () => {
  test('writes files, is idempotent, and never clobbers a non-generated file', () => {
    const d = seeded();
    const docs = docsFor(d);
    const dir = mkdtempSync(path.join(tmpdir(), 'brain-docs-'));
    const first = writeBrainDocs(docs, dir);
    expect(first.written).toBeGreaterThan(0);
    expect(existsSync(path.join(dir, 'agents', 'gmail-worker.md'))).toBe(true);

    // hand-edited (non-generated) file must be left alone
    const handmade = path.join(dir, 'agents', 'gmail-worker.md');
    writeFileSync(handmade, '# my own notes, no marker');
    const second = writeBrainDocs(docs, dir);
    expect(readFileSync(handmade, 'utf8')).toBe('# my own notes, no marker');
    expect(second.skipped).toBeGreaterThan(0);

    // everything else regenerated cleanly
    const sopsDir = path.join(dir, 'sops');
    if (d.sopTasks.all().length === 0) {
      expect(existsSync(sopsDir)).toBe(false);
    } else {
      expect(readdirSync(sopsDir).length).toBe(d.sopTasks.all().length);
    }
  });
});
