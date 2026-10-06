import { afterEach, describe, expect, test } from 'vitest';
import { openDb, type FounderDb } from '@/lib/db';
import { seedDatabase } from '@/lib/seed';
import { DEPARTMENT_HEADS, headForDepartment } from '@/lib/personnel';

let db: FounderDb;
afterEach(() => db?.close());

const seeded = (): FounderDb => {
  db = openDb(':memory:');
  seedDatabase(db);
  return db;
};

describe('the seeded roster is coherent', () => {
  test('no demo humans are seeded — co-founders live on the org chart', () => {
    expect(seeded().people.all()).toEqual([]);
  });

  test('department heads stay empty until real human leads are hired', () => {
    expect(Object.keys(DEPARTMENT_HEADS)).toEqual([]);
    expect(headForDepartment('dept-sales')).toBeNull();
    expect(headForDepartment('dept-nonexistent')).toBeNull();
  });
});
