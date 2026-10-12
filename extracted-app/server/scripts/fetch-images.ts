/**
 * Downloads a picture for every word from Twemoji and links it in data/words.json.
 *
 *   npm run images            # download missing pictures, update words.json
 *   npm run images -- --force # download every picture again
 *
 * Which picture a word gets:
 *   1. assets/custom-images/<word-id>.svg if that file exists (hand-made art always wins), else
 *   2. the emoji set in data/word-images.json, else
 *   3. none (the app shows a pencil).
 * Pictures are saved in public/images/<word-id>.svg and served by the game server,
 * so the game does not depend on a third-party CDN while people play.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WordBank, type WordBankFile } from '../src/words/wordBank.js';

const TWEMOJI_VERSION = '15.1.0';
const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const WORDS_PATH = root('data/words.json');
const MAPPING_PATH = root('data/word-images.json');
const IMAGES_DIR = root('public/images');
const CUSTOM_DIR = root('assets/custom-images');
const force = process.argv.includes('--force');

/** Twemoji file name: code points in hex, joined by "-"; FE0F is dropped unless the emoji is a ZWJ sequence. */
function twemojiName(emoji: string): string {
  const points = [...emoji].map((c) => c.codePointAt(0)!.toString(16));
  return (points.includes('200d') ? points : points.filter((p) => p !== 'fe0f')).join('-');
}

async function download(emoji: string): Promise<string> {
  const url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/svg/${twemojiName(emoji)}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${emoji} (${url})`);
  const svg = await res.text();
  if (!svg.trimStart().startsWith('<svg')) throw new Error(`Not an SVG: ${url}`);
  return svg;
}

/** words.json with one word per line and a blank line between categories, like the hand-written file. */
function formatWordBank(data: WordBankFile): string {
  const line = (v: unknown) => JSON.stringify(v).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }');
  const words: string[] = [];
  data.words.forEach((w, i) => {
    if (i > 0 && data.words[i - 1]!.category !== w.category) words.push('');
    words.push(`    ${line(w)}${i < data.words.length - 1 ? ',' : ''}`);
  });
  return [
    '{',
    `  "version": ${data.version},`,
    '  "categories": [',
    data.categories.map((c) => `    ${line(c)}`).join(',\n'),
    '  ],',
    '  "words": [',
    ...words,
    '  ]',
    '}',
    '',
  ].join('\n');
}

async function main() {
  const raw = JSON.parse(readFileSync(WORDS_PATH, 'utf8')) as WordBankFile;
  const { images } = JSON.parse(readFileSync(MAPPING_PATH, 'utf8')) as { images: Record<string, string | null> };
  const ids = new WordBank(raw).list().map((w) => w.id);

  const missing = ids.filter((id) => !(id in images));
  const unknown = Object.keys(images).filter((id) => !ids.includes(id));
  if (missing.length || unknown.length) {
    if (missing.length) console.error(`No entry in word-images.json for: ${missing.join(', ')}`);
    if (unknown.length) console.error(`word-images.json has entries for words that don't exist: ${unknown.join(', ')}`);
    process.exit(1);
  }

  mkdirSync(IMAGES_DIR, { recursive: true });
  const custom = new Set(existsSync(CUSTOM_DIR) ? readdirSync(CUSTOM_DIR).map((f) => f.replace(/\.svg$/, '')) : []);
  const unknownCustom = [...custom].filter((id) => !ids.includes(id));
  if (unknownCustom.length) console.warn(`assets/custom-images has files for words that don't exist: ${unknownCustom.join(', ')}`);
  const hasPicture = (id: string) => custom.has(id) || !!images[id];

  let downloaded = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const emoji = images[id];
    const file = `${IMAGES_DIR}/${id}.svg`;
    if (custom.has(id)) {
      copyFileSync(`${CUSTOM_DIR}/${id}.svg`, file);
      continue;
    }
    if (!emoji) continue;
    if (existsSync(file) && !force) continue;
    try {
      writeFileSync(file, await download(emoji));
      downloaded++;
    } catch (err) {
      failed.push(`${id}: ${(err as Error).message}`);
    }
  }

  // Remove pictures for words that no longer have one.
  for (const file of readdirSync(IMAGES_DIR)) {
    const id = file.replace(/\.svg$/, '');
    if (file.endsWith('.svg') && !hasPicture(id)) rmSync(`${IMAGES_DIR}/${file}`);
  }

  raw.words = raw.words.map((w, i) => {
    const id = ids[i]!;
    const has = hasPicture(id) && existsSync(`${IMAGES_DIR}/${id}.svg`);
    const { imageUrl: _old, ...rest } = w;
    return has ? { ...rest, imageUrl: `/images/${id}.svg` } : rest;
  });
  writeFileSync(WORDS_PATH, formatWordBank(raw));

  const withImage = raw.words.filter((w) => w.imageUrl).length;
  console.log(`Downloaded ${downloaded} pictures, ${custom.size} custom. ${withImage} of ${raw.words.length} words now have a picture.`);
  const without = ids.filter((id) => !hasPicture(id));
  if (without.length) console.log(`No picture yet (${without.length}): ${without.join(', ')}`);
  if (failed.length) {
    console.error(`Failed:\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }
}

await main();
