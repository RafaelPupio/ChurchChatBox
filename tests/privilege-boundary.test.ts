import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Church-facing code must never import the owner-only cross-church repo.
 *  This is the only thing enforcing that boundary — the repo has no linter. */
const CHURCH_FACING_ROOTS = [
  join(process.cwd(), 'src/app/admin'),
  join(process.cwd(), 'src/app/api'),
  join(process.cwd(), 'src/lib/repo'),
];

const ALLOWED = new Set([join(process.cwd(), 'src/lib/repo/platform.ts')]);

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.tsx?$/.test(full) && !ALLOWED.has(full)) out.push(full);
  }
  return out;
}

describe('privilege boundary', () => {
  it('no church-facing file imports the owner-only platform repo', () => {
    const files = CHURCH_FACING_ROOTS.flatMap((d) => walk(d));
    // Guard against a bad glob silently passing by scanning nothing.
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((f) => /from ['"][^'"]*repo\/platform['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
