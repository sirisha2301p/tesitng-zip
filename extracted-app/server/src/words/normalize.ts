/**
 * Guess checking. A guess is compared to the word and its aliases after
 * normalising case, accents, punctuation and spaces, so "Ice-Cream",
 * "ice cream" and "icecream" all match. A simple plural/singular difference
 * ("grape" vs "grapes") also counts as correct.
 */

/** Lower-case, strip Latin accents and punctuation, collapse spaces. Keeps non-Latin scripts (e.g. Hindi, Telugu). */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalised text with all spaces removed: "ice cream" -> "icecream". */
export function compactText(input: string): string {
  return normalizeText(input).replace(/ /g, '');
}

/**
 * The text plus its singular when it looks like a plural ("grapes" -> "grape").
 * Words ending in -us, -is or -ss are not plurals (octopus, tennis, dress), so "octopu" never counts.
 */
function forms(compact: string): string[] {
  const plural = compact.length > 3 && compact.endsWith('s') && !/[usi]s$/.test(compact);
  return plural ? [compact, compact.slice(0, -1)] : [compact];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = curr;
  }
  return prev[b.length]!;
}

export type MatchResult = 'correct' | 'close' | 'wrong';

/** @param answers the word followed by its aliases */
export function matchGuess(answers: readonly string[], guess: string): MatchResult {
  const g = compactText(guess);
  if (!g) return 'wrong';
  const guessForms = forms(g);
  const targets = answers.map(compactText).filter(Boolean);

  for (const target of targets) {
    const targetForms = forms(target);
    if (guessForms.some((f) => targetForms.includes(f))) return 'correct';
  }
  for (const target of targets) {
    const allowed = target.length <= 5 ? 1 : 2;
    if (levenshtein(g, target) <= allowed) return 'close';
  }
  return 'wrong';
}
