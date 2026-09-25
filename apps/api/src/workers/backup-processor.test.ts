import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { retainLatestDumps } from './backup-processor.js';

describe('468b backup retention', () => {
  it.each([0, 7, 9])('keeps newest seven of %i dumps and removes matching manifests only', async (count) => {
    const directory = await mkdtemp(join(tmpdir(), '468b-retention-'));
    const names = Array.from({ length: count }, (_, i) => `mediakit-2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z.dump`);
    try {
      for (const name of [...names].reverse()) {
        await writeFile(join(directory, name), 'synthetic dump');
        await writeFile(join(directory, `${name}.json`), '{}');
      }
      await writeFile(join(directory, '.partial-dump'), 'unfinished');
      await writeFile(join(directory, 'unrelated.dump'), 'preserve');
      await symlink('unrelated.dump', join(directory, 'mediakit-2000-01-01T00:00:00.000Z.dump'));
      expect(await retainLatestDumps(directory)).toEqual(names.slice(0, Math.max(0, count - 7)));
      const remaining = await readdir(directory);
      expect(remaining.sort()).toEqual([
        ...names.slice(-7).flatMap((name) => [name, `${name}.json`]),
        '.partial-dump', 'unrelated.dump', 'mediakit-2000-01-01T00:00:00.000Z.dump',
      ].sort());
      expect(await readFile(join(directory, 'unrelated.dump'), 'utf8')).toBe('preserve');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
