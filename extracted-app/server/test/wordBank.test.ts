import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WordBank } from '../src/words/wordBank.js';

describe('the bundled word bank (data/words.json)', () => {
  const bank = WordBank.fromFile();

  it('loads without errors and has a healthy number of words', () => {
    expect(bank.size).toBeGreaterThanOrEqual(250);
  });

  it('lists Mixed first, then every category with at least 20 words', () => {
    const categories = bank.categories();
    expect(categories[0]).toMatchObject({ id: 'mixed', wordCount: bank.size });
    for (const c of categories.slice(1)) {
      expect(c.wordCount, c.id).toBeGreaterThanOrEqual(20);
    }
  });

  it('every picture a word points to exists in public/images', () => {
    const local = bank.list().filter((w) => w.imageUrl?.startsWith('/images/'));
    expect(local.length).toBeGreaterThanOrEqual(290);
    for (const w of local) {
      const file = fileURLToPath(new URL(`../public${w.imageUrl}`, import.meta.url));
      expect(existsSync(file), `${w.id} -> ${w.imageUrl}`).toBe(true);
    }
  });

  it('every word is guessable by its own spelling', () => {
    for (const c of bank.categories().slice(1)) {
      const exclude = new Set<string>();
      for (let w = bank.pick(c.id, exclude); w; w = bank.pick(c.id, exclude)) {
        exclude.add(w.id);
        expect(WordBank.check(w, w.word), w.id).toBe('correct');
        for (const alias of w.aliases) expect(WordBank.check(w, alias), `${w.id} / ${alias}`).toBe('correct');
      }
    }
  });
});

describe('WordBank', () => {
  const bank = new WordBank({
    version: 1,
    categories: [
      { id: 'animals', name: 'Animals' },
      { id: 'food', name: 'Food' },
    ],
    words: [
      { word: 'cat', category: 'animals', difficulty: 'easy' },
      { word: 'dog', category: 'animals', difficulty: 'easy' },
      { word: 'ice cream', category: 'food', difficulty: 'easy' },
    ],
  });

  it('builds stable ids from category and word', () => {
    expect(bank.get('food-ice-cream')?.word).toBe('ice cream');
  });

  it('picks only from the requested category and skips excluded words', () => {
    expect(bank.pick('food', new Set())?.word).toBe('ice cream');
    expect(bank.pick('animals', new Set(['animals-cat']))?.word).toBe('dog');
    expect(bank.pick('animals', new Set(['animals-cat', 'animals-dog']))).toBeNull();
  });

  it('mixed picks from every category', () => {
    const seen = new Set<string>();
    const exclude = new Set<string>();
    for (let w = bank.pick('mixed', exclude); w; w = bank.pick('mixed', exclude)) {
      exclude.add(w.id);
      seen.add(w.category);
    }
    expect(seen).toEqual(new Set(['animals', 'food']));
  });

  it('rejects bad data', () => {
    expect(
      () =>
        new WordBank({
          version: 1,
          categories: [{ id: 'animals', name: 'Animals' }],
          words: [{ word: 'cat', category: 'pets', difficulty: 'easy' }],
        }),
    ).toThrow(/unknown category/);
    expect(
      () =>
        new WordBank({
          version: 1,
          categories: [{ id: 'animals', name: 'Animals' }],
          words: [
            { word: 'cat', category: 'animals', difficulty: 'easy' },
            { word: 'Cat', category: 'animals', difficulty: 'easy' },
          ],
        }),
    ).toThrow(/Duplicate word/);
  });
});
