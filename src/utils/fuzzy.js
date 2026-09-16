function levenshtein(a, b) {
  a = String(a).toLowerCase();
  b = String(b).toLowerCase();
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  const maxLen = Math.max(String(a).length, String(b).length);
  if (maxLen === 0) return 1;
  return 1 - distance / maxLen;
}

/**
 * Findet die beste Übereinstimmung für `input` aus `candidates`, tolerant
 * gegenüber Tippfehlern. Gibt null zurück, wenn nichts über dem Schwellwert liegt.
 */
function findBestMatch(input, candidates, threshold = 0.6) {
  if (!input || !candidates || candidates.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = similarity(input, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (best !== null && bestScore >= threshold) {
    return { match: best, score: bestScore };
  }
  return null;
}

module.exports = { levenshtein, similarity, findBestMatch };
