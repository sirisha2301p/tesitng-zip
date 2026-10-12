import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { MIXED_CATEGORY, type Difficulty } from '../protocol.js';
import { matchGuess, normalizeText, type MatchResult } from './normalize.js';

export interface Word {
  /** Stable id: "<category>-<slug>", e.g. "food-ice-cream". */
  id: string;
  word: string;
  category: string;
  difficulty: Difficulty;
  aliases: string[];
  imageUrl: string | null;
}

export interface CategoryInfo {
  id: string;
  name: string;
  wordCount: number;
}

const fileSchema = z.object({
  version: z.literal(1),
  categories: z
    .array(z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), name: z.string().min(1) }))
    .min(1),
  words: z
    .array(
      z.object({
        word: z.string().trim().min(1).max(40),
        category: z.string(),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        aliases: z.array(z.string().trim().min(1)).default([]),
        /** A full URL, or a picture served by this server: "/images/<file>". */
        imageUrl: z
          .union([z.string().url(), z.string().regex(/^\/images\/[a-z0-9-]+\.(svg|png|webp)$/)])
          .nullable()
          .default(null),
      }),
    )
    .min(1),
});
export type WordBankFile = z.input<typeof fileSchema>;

export const DEFAULT_WORDS_PATH = fileURLToPath(new URL('../../data/words.json', import.meta.url));

function slug(text: string): string {
  return normalizeText(text).replace(/ /g, '-');
}

export class WordBank {
  private readonly all: Word[];
  private readonly byId = new Map<string, Word>();
  private readonly byCategory = new Map<string, Word[]>();
  private readonly categoryNames = new Map<string, string>();

  constructor(data: WordBankFile) {
    const parsed = fileSchema.parse(data);
    for (const c of parsed.categories) {
      if (c.id === MIXED_CATEGORY) throw new Error(`"${MIXED_CATEGORY}" is reserved and cannot be a category id`);
      if (this.categoryNames.has(c.id)) throw new Error(`Duplicate category id "${c.id}"`);
      this.categoryNames.set(c.id, c.name);
      this.byCategory.set(c.id, []);
    }
    this.all = parsed.words.map((w) => {
      const list = this.byCategory.get(w.category);
      if (!list) throw new Error(`Word "${w.word}" has unknown category "${w.category}"`);
      const word: Word = {
        id: `${w.category}-${slug(w.word)}`,
        word: w.word,
        category: w.category,
        difficulty: w.difficulty,
        aliases: w.aliases,
        imageUrl: w.imageUrl,
      };
      if (this.byId.has(word.id)) throw new Error(`Duplicate word "${w.word}" in category "${w.category}"`);
      this.byId.set(word.id, word);
      list.push(word);
      return word;
    });
  }

  static fromFile(path: string = DEFAULT_WORDS_PATH): WordBank {
    return new WordBank(JSON.parse(readFileSync(path, 'utf8')) as WordBankFile);
  }

  get size(): number {
    return this.all.length;
  }

  list(): readonly Word[] {
    return this.all;
  }

  /** Categories offered in the app, with "Mixed" first. */
  categories(): CategoryInfo[] {
    return [
      { id: MIXED_CATEGORY, name: 'Mixed', wordCount: this.all.length },
      ...[...this.categoryNames].map(([id, name]) => ({
        id,
        name,
        wordCount: this.byCategory.get(id)!.length,
      })),
    ];
  }

  hasCategory(id: string): boolean {
    return id === MIXED_CATEGORY || this.categoryNames.has(id);
  }

  get(id: string): Word | undefined {
    return this.byId.get(id);
  }

  /** A random word from the category that is not in `exclude`, or null if none are left. */
  pick(category: string, exclude: ReadonlySet<string>, rng: () => number = Math.random): Word | null {
    const pool = category === MIXED_CATEGORY ? this.all : this.byCategory.get(category);
    if (!pool) return null;
    const candidates = pool.filter((w) => !exclude.has(w.id));
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)] ?? null;
  }

  static check(word: Word, guess: string): MatchResult {
    return matchGuess([word.word, ...word.aliases], guess);
  }
}
