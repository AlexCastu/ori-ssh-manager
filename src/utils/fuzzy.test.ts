import { describe, it, expect } from 'vitest';
import { fuzzyScore, fuzzyRank } from './fuzzy';

describe('fuzzyScore', () => {
  it('returns null when chars are not a subsequence', () => {
    expect(fuzzyScore('xyz', 'web prod')).toBeNull();
    expect(fuzzyScore('dw', 'web')).toBeNull(); // wrong order
  });

  it('matches subsequences and rewards word-starts/runs', () => {
    expect(fuzzyScore('wp', 'Web Prod')).not.toBeNull();
    // exact prefix scores higher than scattered match
    const prefix = fuzzyScore('web', 'web server')!;
    const scattered = fuzzyScore('web', 'w-e-b')!;
    expect(prefix).toBeGreaterThan(scattered);
  });

  it('empty query scores 0', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

describe('fuzzyRank', () => {
  const items = [
    { name: 'Web Prod', host: 'web.prod.example.com' },
    { name: 'DB Staging', host: 'db.staging.example.com' },
    { name: 'Web Dev', host: 'web.dev.example.com' },
  ];
  const hay = (i: { name: string; host: string }) => `${i.name} ${i.host}`;

  it('keeps original order for empty query', () => {
    expect(fuzzyRank('', items, hay)).toEqual(items);
  });

  it('ranks the best match first and drops non-matches', () => {
    const out = fuzzyRank('webprod', items, hay);
    expect(out[0].name).toBe('Web Prod');
    expect(out.some((i) => i.name === 'DB Staging')).toBe(false);
  });
});
