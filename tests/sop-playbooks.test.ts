import { afterAll, describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { playbookFor } from '@/lib/sop-playbooks';

describe('SOP playbooks', () => {
  const db = openDb(':memory:');
  seedDatabase(db);
  const tasks = db.sopTasks.all();
  afterAll(() => db.close());

  test('NLG seed does not invent SOP tasks — playbooks wait for real SOPs', () => {
    expect(tasks).toEqual([]);
    expect(typeof playbookFor).toBe('function');
  });
});
