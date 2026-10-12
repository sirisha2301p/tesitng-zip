import { describe, expect, it } from 'vitest';
import { compactText, levenshtein, matchGuess, normalizeText } from '../src/words/normalize.js';

describe('normalizeText', () => {
  it('lower-cases, strips accents and punctuation, collapses spaces', () => {
    expect(normalizeText('  Ice-Cream!! ')).toBe('ice cream');
    expect(normalizeText('Café')).toBe('cafe');
  });

  it('keeps non-Latin scripts intact', () => {
    expect(normalizeText('हाथी')).toBe('हाथी');
    expect(normalizeText('ఏనుగు')).toBe('ఏనుగు');
  });

  it('compactText removes spaces', () => {
    expect(compactText('T-Shirt')).toBe('tshirt');
  });
});

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('elephant', 'elefant')).toBe(2);
    expect(levenshtein('cat', 'cat')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('matchGuess', () => {
  const elephant = ['elephant', 'haathi'];

  it('accepts the word regardless of case and spacing', () => {
    expect(matchGuess(elephant, 'Elephant')).toBe('correct');
    expect(matchGuess(elephant, '  ELEPHANT ')).toBe('correct');
    expect(matchGuess(['ice cream'], 'icecream')).toBe('correct');
    expect(matchGuess(['ice cream'], 'Ice-Cream')).toBe('correct');
  });

  it('accepts aliases', () => {
    expect(matchGuess(elephant, 'haathi')).toBe('correct');
  });

  it('accepts a simple plural or singular', () => {
    expect(matchGuess(['grapes'], 'grape')).toBe('correct');
    expect(matchGuess(['gloves'], 'glove')).toBe('correct');
    expect(matchGuess(['elephant'], 'elephants')).toBe('correct');
  });

  it('does not treat the s of octopus, cactus or tennis as a plural', () => {
    expect(matchGuess(['octopus'], 'octopu')).toBe('close');
    expect(matchGuess(['cactus'], 'cactu')).toBe('close');
    expect(matchGuess(['tennis'], 'tenni')).toBe('close');
    expect(matchGuess(['dress'], 'dres')).toBe('close');
    expect(matchGuess(['octopus'], 'octopus')).toBe('correct');
  });

  it('flags near misses as close', () => {
    expect(matchGuess(elephant, 'elefant')).toBe('close');
    expect(matchGuess(['tiger'], 'tigr')).toBe('close');
  });

  it('rejects wrong and empty guesses', () => {
    expect(matchGuess(elephant, 'horse')).toBe('wrong');
    expect(matchGuess(elephant, '!!!')).toBe('wrong');
  });
});
