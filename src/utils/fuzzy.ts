// Tiny fuzzy matcher for the command palette. No dependency: a subsequence
// scorer good enough to rank sessions as you type ("wp" → "Web Prod").

// Characters that mark the start of a "word" inside a haystack (host parts,
// user@host, paths…). Matches right after one of these score higher.
const WORD_BOUNDARY = /[\s@:._/-]/;

/**
 * Score how well `query` fuzzy-matches `text`. Returns null when not all query
 * characters appear in order; otherwise a number where higher is better
 * (consecutive runs and word-start matches are rewarded).
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  let qi = 0;
  let score = 0;
  let streak = 0;
  let prevIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let pts = 1;
    if (prevIdx === ti - 1) {
      streak += 1;
      pts += streak * 2; // reward consecutive matches
    } else {
      streak = 0;
    }
    if (ti === 0 || WORD_BOUNDARY.test(t[ti - 1])) {
      pts += 3; // reward matches at the start of a word
    }
    score += pts;
    prevIdx = ti;
    qi += 1;
  }

  return qi === q.length ? score : null;
}

export interface RankedItem<T> {
  item: T;
  score: number;
}

/**
 * Rank items by fuzzy-matching `query` against the string returned by
 * `haystack`. An empty query keeps the original order (score 0 for all).
 */
export function fuzzyRank<T>(
  query: string,
  items: T[],
  haystack: (item: T) => string
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [...items];

  const ranked: (RankedItem<T> & { idx: number })[] = [];
  items.forEach((item, idx) => {
    const score = fuzzyScore(trimmed, haystack(item));
    if (score !== null) ranked.push({ item, score, idx });
  });

  // Highest score first; stable tie-break by original position.
  ranked.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return ranked.map((r) => r.item);
}
