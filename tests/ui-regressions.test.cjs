'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('story cover live crop updates the public card image in the studio preview', () => {
  const app = read('public/app.js');
  assert.match(app, /\.story-cover\[data-story="\$\{CSS\.escape\(event\.data\.storyId\)\}"\]/);
  assert.match(app, /if\(cardImage&&event\.data\.crop\)applyPhoto\(cardImage,event\.data\.crop\)/);
  assert.match(read('public/admin.js'), /storyId:editing\?\.id\|\|'studio-draft'/);
});

test('story list can switch between readable list and cover card views', () => {
  const html = read('public/admin.html');
  const js = read('public/admin.js');
  const css = read('public/style.css');
  assert.match(html, /data-story-view="list"/);
  assert.match(html, /data-story-view="cards"/);
  assert.match(js, /storyListView==='cards'/);
  assert.match(css, /\.content-list\.cards-view/);
});

test('mobile audio dock keeps an accessible stop control and compact layout', () => {
  assert.match(read('public/index.html'), /id="audioStop" aria-label="Тоглуулагч хаах"/);
  assert.match(read('public/audio-player.js'), /\$\('#audioStop'\)\.addEventListener\('click',stop\)/);
  assert.match(read('public/public.css'), /grid-template-rows:auto auto auto/);
  assert.match(read('public/public.css'), /\.public-site \.audio-close\{width:30px;min-width:30px;min-height:30px/);
});

test('editor cover and media thumbnails use responsive public card proportions', () => {
  const css = read('public/style.css');
  assert.match(css, /\.crop-preview\.tall\{aspect-ratio:1\.02/);
  assert.match(css, /\.crop-preview\.tall\[data-device="mobile"\]\{aspect-ratio:\.73\}/);
  assert.match(css, /\.asset-thumb\{height:auto;aspect-ratio:1\.02\}/);
  assert.match(css, /\.asset-thumb img\{object-fit:cover\}/);
});
