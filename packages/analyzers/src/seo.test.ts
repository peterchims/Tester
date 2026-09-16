import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractKeywords,
  fieldCheck,
  isDisallowed,
  isHeadingOrderValid,
  normalizeUrl,
  parseStructuredData,
  socialCheck,
} from './seo.js';

test('extractKeywords finds the real repeated phrase and where it appears', () => {
  const visibleText =
    'Artisan coffee roasting is our craft. We roast artisan coffee daily and ship artisan coffee nationwide. Artisan coffee, done right.';
  const keywords = extractKeywords(visibleText, {
    title: 'Artisan Coffee Roasters',
    h1: 'Fresh artisan coffee',
    metaDescription: 'Buy fresh coffee online',
    url: '/artisan-coffee',
  });

  const top = keywords[0];
  assert.equal(top.phrase, 'artisan coffee');
  assert.equal(top.occurrences, 4);
  assert.equal(top.inTitle, true);
  assert.equal(top.inH1, true);
  assert.equal(top.inUrl, true);
  // "Buy fresh coffee online" does not contain the two-word phrase "artisan coffee".
  assert.equal(top.inMetaDescription, false);
});

test('extractKeywords density reflects real word count, not a guess', () => {
  // 10 total words, "widget" appears twice as a standalone unigram -> 20% density.
  const keywords = extractKeywords('widget widget one two three four five six seven eight', {
    title: '',
    h1: '',
    metaDescription: '',
    url: '',
  });
  const widget = keywords.find((k) => k.phrase === 'widget');
  assert.ok(widget);
  assert.equal(widget!.densityPct, 20);
});

test('extractKeywords ignores stopwords and short/numeric tokens', () => {
  const keywords = extractKeywords('the the the and and and 22 22 22 to to to', {
    title: '',
    h1: '',
    metaDescription: '',
    url: '',
  });
  assert.deepEqual(keywords, []);
});

test('extractKeywords never joins phrases across a stopword (true adjacency only)', () => {
  // "alpha" and "beta" are never adjacent in the source text — "for the" always
  // sits between them — so "alpha beta" must never be reported as a bigram.
  const keywords = extractKeywords('alpha for the beta alpha for the beta alpha for the beta', {
    title: '',
    h1: '',
    metaDescription: '',
    url: '',
  });
  assert.equal(keywords.some((k) => k.phrase === 'alpha beta'), false);
});

test('isHeadingOrderValid accepts sequential nesting and rejects skipped levels', () => {
  assert.equal(isHeadingOrderValid([{ level: 1 }, { level: 2 }, { level: 3 }, { level: 2 }]), true);
  assert.equal(isHeadingOrderValid([{ level: 1 }, { level: 3 }]), false, 'h1 -> h3 skips h2');
  assert.equal(isHeadingOrderValid([{ level: 2 }, { level: 3 }]), false, 'page must start at h1');
  assert.equal(isHeadingOrderValid([]), true, 'no headings is not an ordering violation');
});

test('parseStructuredData extracts @type from valid JSON-LD and reports parse errors', () => {
  const blocks = parseStructuredData([
    '{"@context":"https://schema.org","@type":"Organization","name":"Acme"}',
    '{"@type": ["Product", "Thing"]}',
    '{not valid json',
  ]);
  assert.deepEqual(blocks[0], { types: ['Organization'], valid: true, error: null });
  assert.deepEqual(blocks[1].types, ['Product', 'Thing']);
  assert.equal(blocks[2].valid, false);
  assert.ok(blocks[2].error);
});

test('fieldCheck flags missing, too-short, too-long, and well-sized fields', () => {
  assert.equal(fieldCheck(null, 30, 60).present, false);
  assert.equal(fieldCheck('  ', 30, 60).present, false);
  assert.equal(fieldCheck('short', 30, 60).withinRecommendedLength, false);
  assert.equal(fieldCheck('x'.repeat(80), 30, 60).withinRecommendedLength, false);
  assert.equal(fieldCheck('A perfectly reasonable forty character title', 30, 60).withinRecommendedLength, true);
});

test('socialCheck reports every required key as missing when no tags are present', () => {
  const result = socialCheck({}, ['title', 'description', 'image']);
  assert.equal(result.present, false);
  assert.deepEqual(result.missing, ['title', 'description', 'image']);
});

test('socialCheck reports only the tags that are actually absent', () => {
  const result = socialCheck({ title: 'Hi', description: 'There' }, ['title', 'description', 'image']);
  assert.equal(result.present, true);
  assert.deepEqual(result.missing, ['image']);
});

test('isDisallowed matches a full-site block and a specific prefix', () => {
  assert.equal(isDisallowed(['/'], '/anything'), true);
  assert.equal(isDisallowed(['/admin'], '/admin/settings'), true);
  assert.equal(isDisallowed(['/admin'], '/public'), false);
  assert.equal(isDisallowed([], '/public'), false);
});

test('normalizeUrl strips a trailing slash and the hash so sitemap matching is stable', () => {
  assert.equal(normalizeUrl('https://example.com/page/'), normalizeUrl('https://example.com/page'));
  assert.equal(normalizeUrl('https://example.com/page#section'), normalizeUrl('https://example.com/page'));
});
