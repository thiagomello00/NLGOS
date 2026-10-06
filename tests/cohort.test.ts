import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * The FounderOS cohort invite (welcome pop-up + footer CTA) is gone.
 * NLG OS is a private internal OS — these tests lock that the promo
 * surface cannot be dragged back in by a later port.
 */
describe('FounderOS promotional invite is removed', () => {
  test('the invite module and UI placements no longer exist', () => {
    expect(existsSync(join(root, 'lib/cohort.ts'))).toBe(false);
    expect(existsSync(join(root, 'components/CohortBanner.tsx'))).toBe(false);
    expect(existsSync(join(root, 'components/CohortModal.tsx'))).toBe(false);
  });

  test('the shared layout does not mount a banner or welcome pop-up', () => {
    const layout = read('app/layout.tsx');
    expect(layout).not.toContain('CohortBanner');
    expect(layout).not.toContain('CohortModal');
    expect(layout).not.toContain('lib/cohort');
    expect(layout).not.toContain('founderos.example.com');
  });

  test('the command palette has no Skool Community jump', () => {
    const palette = read('lib/palette.ts');
    expect(palette).not.toContain('ext-skool');
    expect(palette).not.toContain('skool.com');
    expect(palette).not.toContain('Skool Community');
  });
});
