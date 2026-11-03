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
  assert.match(read('public/public.css'), /grid-template-areas:"track extras" "controls controls" "timeline timeline"/);
  assert.match(read('public/public.css'), /\.public-site \.audio-close\{width:29px;min-width:29px;height:29px;min-height:29px/);
});

test('audio artwork sits behind a subdued player and listen actions use soft pill styling', () => {
  assert.match(read('public/audio-player.js'), /root\.style\.setProperty\('--audio-art'/);
  const css = read('public/public.css');
  assert.match(css, /var\(--audio-art,none\)/);
  assert.match(css, /\.public-site \.story-actions \.plain-btn\.audio\{[^}]*border-radius:99px[^}]*background:linear-gradient\(110deg,#251b25e8,#211820e8\)/);
  assert.match(css, /\.public-site #readerAudio\{border-radius:99px/);
});

test('story editor can choose and crop independent audio artwork and saves it with the story', () => {
  const html = read('public/admin.html');
  const admin = read('public/admin.js');
  const app = read('public/app.js');
  const player = read('public/audio-player.js');
  assert.match(html, /id="storyAudioArtAsset"/);
  assert.match(html, /id="storyAudioArtSearch"/);
  assert.match(html, /id="storyAudioArtX"/);
  assert.match(html, /id="storyAudioArtY"/);
  assert.match(html, /id="storyAudioArtZoom"/);
  assert.match(html, /id="storyAudioArtShade"/);
  assert.match(html, /data-audio-art-device="desktop"/);
  assert.match(html, /data-audio-art-device="mobile"/);
  assert.match(html, /audio-art-preview-controls/);
  assert.match(html, /audio-art-preview-extras/);
  assert.match(admin, /storyOverlay\.audio_player=config/);
  assert.match(admin, /toLocaleLowerCase\(\)\.includes\(query\)/);
  assert.match(admin, /audio_player\?\.asset_id/);
  assert.match(admin, /config\[audioArtDevice\]/);
  assert.match(app, /artAsset=asset\(design\.asset_id\)/);
  assert.match(player, /--audio-art-position/);
  assert.match(player, /--audio-art-scale/);
  assert.match(player, /activeArtwork\[matchMedia\('\(max-width:520px\)'\)\.matches\?'mobile':'desktop'\]/);
  assert.match(read('public/style.css'), /\.audio-art-preview\[data-device=mobile\]\{grid-template-columns/);
});

test('editor cover and media thumbnails use responsive public card proportions', () => {
  const css = read('public/style.css');
  assert.match(css, /\.crop-preview\.tall\{aspect-ratio:1\.02/);
  assert.match(css, /\.crop-preview\.tall\[data-device="mobile"\]\{aspect-ratio:\.73\}/);
  assert.match(css, /\.asset-thumb\{height:auto;aspect-ratio:1\.02\}/);
  assert.match(css, /\.asset-thumb img\{object-fit:cover\}/);
});


test('editor supports transparent preset and custom read-count display values', () => {
  const html = read('public/admin.html');
  const admin = read('public/admin.js');
  const app = read('public/app.js');
  assert.match(html, /id="storyIndexReadsCustom" type="number"/);
  assert.match(html, /Өөр тоо оруулах/);
  assert.match(html, /редакторын сонголт гэж ил тод тэмдэглэнэ/);
  assert.match(admin, /readsMode==='custom'\?customReads:readsMode/);
  assert.match(admin, /storyIndexReadsCustom/);
  assert.match(app, /count===10000\?'10k\+':count===5000\?'5k\+':count===1000\?'1k\+'/);
  assert.match(app, /Гараар тохируулсан тоо · бодит үзэлт биш/);
});
