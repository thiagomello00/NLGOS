import { describe, expect, test } from 'vitest';
import { headForDepartment } from '@/lib/personnel';

describe('headForDepartment', () => {
  test('returns null until a real human lead is hired into a department', () => {
    expect(headForDepartment('dept-sales')).toBeNull();
    expect(headForDepartment('dept-growth')).toBeNull();
    expect(headForDepartment('dept-leadership')).toBeNull();
  });
});
