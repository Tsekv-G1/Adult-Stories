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
  assert.match(read('public/audio-player.js'), /\$\('#audioStop'\)\.addEventListener\('click',\(\)=>stop\(\)\)/);
  assert.match(read('public/public.css'), /grid-template-areas:"track extras" "controls controls" "timeline timeline"/);
  assert.match(read('public/public.css'), /\.public-site \.audio-close\{width:29px;min-width:29px;height:29px;min-height:29px/);
});

test('audio artwork sits behind a subdued player and listen actions use soft pill styling', () => {
  assert.match(read('public/audio-player.js'), /root\.style\.setProperty\('--audio-art'/);
  const css = read('public/public.css');
  assert.match(css, /var\(--audio-art,none\)/);
  assert.match(css, /\.public-site \.story-actions \.plain-btn\.audio\{[^}]*border-radius:99px[^}]*background:linear-gradient\(110deg,#251b25e8,#211820e8\)/);
  assert.match(css, /\.public-site #readerAudioPreview,\.public-site #readerAudioFull\{border-radius:99px/);
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
  assert.match(player, /--audio-art-zoom/);
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
  assert.doesNotMatch(app, /class="story-activity"|Гараар тохируулсан тоо · бодит үзэлт биш/);
  assert.doesNotMatch(read('public/index.html'), /сүүлийн 30 хоногийн бодит уншилт/);
});


test('audio preview IN and OUT accept clock time and validate the selected range', async () => {
  const {parseClockTime} = await import('../public/studio.js');
  assert.equal(parseClockTime('6:30'), 390);
  assert.equal(parseClockTime('1:02:03'), 3723);
  assert.equal(parseClockTime('90'), 90);
  assert.ok(Number.isNaN(parseClockTime('2:75')));
  assert.match(read('public/admin.html'), /id="storyPreviewStart" type="text"/);
  assert.ok(read('public/admin.js').includes("parseClockTime($('#storyPreviewStart').value)"));
});

test('reader offers preview and a full-listen purchase path before access, then plays the protected audio', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  assert.match(html, /id="readerAudioPreview">▶ Сонсож үзэх/);
  assert.match(html, /id="readerAudioFull" hidden>▶ Бүтэн сонсох/);
  assert.match(app, /previewTarget=audioAvailable\(s\)/);
  assert.match(app, /fullTarget=adultConfirmed\(\)&&access&&safeUrl\(body\.full_audio_url\)/);
  assert.match(app, /readerAudioFull'\)\.hidden=!adultConfirmed\(\)\|\|!!bodyError\|\|!\(audioSeconds\(s\)\|\|fullTarget\)/);
  assert.match(app, /readerAudioTarget\?\.preview/);
  assert.match(app, /if\(target\?\.full\)\{playAudio\(s,target\.full\);return\}/);
  assert.match(app, /membershipOptions\(\)\}\);\$\('#readerSave'/);
  assert.match(app, /if\(changed&&state\.reader\)renderReader\(\)/);
});

test('audio player has previous and next story controls alongside ten-second seek', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  assert.match(html, /id="audioPrevious" aria-label="Өмнөх аудио эхлэл"/);
  assert.match(html, /id="audioNext" aria-label="Дараагийн аудио эхлэл"/);
  assert.match(app, /function previousAudio\(\)/);
  assert.match(app, /\$\('#audioPrevious'\)\.addEventListener\('click',playPreviousAudio\)/);
  assert.match(app, /\$\('#audioPrevious'\)\.disabled=!previousAudio\(\)/);
});

test('audio player opens an artwork led full screen view and supports M4A MIME type', () => {
  const player = read('public/audio-player.js');
  const css = read('public/public.css');
  assert.match(player, /root\.classList\.add\('is-expanded'\)/);
  assert.doesNotMatch(player, /MP3 холбоос ашиглана уу/);
  assert.match(css, /\.audio-player\.is-expanded/);
  assert.match(read('server/r2.cjs'), /ResponseContentType:'audio\/mp4'/);
});

test('expanded player keeps one monochrome artwork layer and browser back dismisses it', () => {
  const player = read('public/audio-player.js');
  const css = read('public/public.css');
  assert.match(player, /adultAudioOverlay:true/);
  assert.match(player, /addEventListener\('popstate'/);
  assert.match(css, /background-size:cover,cover;background-repeat:no-repeat/);
  assert.match(css, /\.audio-player\.is-expanded::before\{inset:-2px[^}]*filter:grayscale\(1\)/);
  assert.match(css, /\.audio-art img\{filter:grayscale\(1\);opacity:1\}/);
  assert.match(css, /\.audio-title:active\{color:#fff;text-decoration:none/);
});

test('private full audio cannot be presented as a public preview', () => {
  const app = read('public/app.js');
  const admin = read('public/admin.js');
  const editor = read('public/admin.html');
  assert.match(app, /!isPrivateAudio\(s\.audio_preview_url\)/);
  assert.match(admin, /isPrivateAudio\(previewUrl\)\|\|previewUrl===fullUrl/);
  assert.match(editor, /id="storyAudioPreview" type="url"/);
  assert.doesNotMatch(editor, /id="storyAudioPreview"[^>]*readonly/);
});
