// ============================================================================
// VIDEO SHOWCASE REGRESSIONS
// Validates production metadata, generated VTTs, official-site integration,
// accessible controls, language coverage, and honest preparation status.
// No video is generated or played, and no external provider is contacted.
// ============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_LANGUAGES } from '../src/data/content';
import {
  getDemoById,
  getSubtitlePath,
  getSubtitleTrack,
  getVoiceOverLabel,
  vttTime,
  VIDEO_DEMOS,
  VIDEO_LANGUAGES,
  VIDEO_PRIMARY_LANGUAGE,
} from '../src/data/videoShowcase';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`PASS ${passed.toString().padStart(2, '0')} — ${name}`);
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

await test('exactly three demos are declared for customer, owner and rider', () => {
  assert.deepEqual(
    VIDEO_DEMOS.map((demo) => demo.id),
    ['customer', 'shop-owner', 'delivery-partner']
  );
});

await test('shared lookup helper returns the matching demo for every id', () => {
  for (const demo of VIDEO_DEMOS) assert.equal(getDemoById(demo.id), demo);
});

await test('video language list exactly matches the website language selector', () => {
  assert.deepEqual(
    VIDEO_LANGUAGES.map((language) => language.code),
    SUPPORTED_LANGUAGES.map((language) => language.code)
  );
  assert.equal(VIDEO_LANGUAGES.length, 12);
  assert.equal(VIDEO_PRIMARY_LANGUAGE, 'te');
});

await test('every language has complete narration, titles and matching timings', () => {
  for (const demo of VIDEO_DEMOS) {
    for (const language of VIDEO_LANGUAGES) {
      const lines = demo.narration[language.code];
      assert.ok(Array.isArray(lines), `missing ${demo.id}/${language.code} narration`);
      assert.equal(lines.length, demo.timings.length, `${demo.id}/${language.code} cue count`);
      assert.ok(demo.title[language.code]?.trim(), `missing ${demo.id}/${language.code} title`);
      for (const line of lines) assert.ok(line.trim().length > 8, `${demo.id}/${language.code} empty line`);
    }
  }
});

await test('cue timings are ordered and inside the declared duration', () => {
  for (const demo of VIDEO_DEMOS) {
    let previousEnd = 0;
    for (const timing of demo.timings) {
      assert.ok(timing.startSec >= previousEnd, `${demo.id} overlapping cues`);
      assert.ok(timing.endSec > timing.startSec, `${demo.id} empty cue`);
      assert.ok(timing.endSec <= demo.durationSec, `${demo.id} cue after duration`);
      previousEnd = timing.endSec;
    }
  }
});

await test('each demo has eight cues and a duration equal to its last cue end', () => {
  assert.deepEqual(
    VIDEO_DEMOS.map((demo) => demo.durationSec),
    [100, 100, 102]
  );
  for (const demo of VIDEO_DEMOS) {
    assert.equal(demo.timings.length, 8, `${demo.id} cue count`);
    assert.equal(demo.durationSec, demo.timings[demo.timings.length - 1]?.endSec, `${demo.id} duration`);
    for (const lines of Object.values(demo.narration)) {
      assert.equal(lines.length, 8, `${demo.id} narration cue count`);
    }
  }
});

await test('one shared WebVTT formatter is used; local declarations and negative times are handled', () => {
  const localDeclaration = 'function' + ' vttTime';
  for (const file of ['scripts/generate-video-subtitles.ts', 'scripts/test-video-showcase.ts']) {
    assert.ok(!read(file).includes(localDeclaration), `${file} redeclares the formatter`);
  }
  const generator = read('scripts/generate-video-subtitles.ts');
  assert.match(generator, /import \{[^}]*\bvttTime\b[^}]*\} from '\.\.\/src\/data\/videoShowcase'/);
  assert.equal(read('src/data/videoShowcase.ts').match(/export\s+function\s+vttTime\(/g)?.length, 1);
  assert.equal(vttTime(-5), '00:00:00.000');
  assert.equal(vttTime(95), '00:01:35.000');
});

await test('all 36 generated VTT files contain matching language narration and timing', () => {
  let fileCount = 0;
  for (const demo of VIDEO_DEMOS) {
    for (const language of VIDEO_LANGUAGES) {
      const relativePath = getSubtitlePath(demo, language.code).replace(/^\//, '');
      const vtt = read(`public/${relativePath}`);
      assert.ok(vtt.startsWith('WEBVTT'), `${relativePath} missing WEBVTT header`);
      assert.match(vtt, /no voice-over track is provided/i);
      demo.narration[language.code].forEach((line, index) => {
        const timing = demo.timings[index];
        const cue = `${index + 1}\n${vttTime(timing.startSec)} --> ${vttTime(timing.endSec)}\n${line.trim()}`;
        assert.ok(vtt.includes(cue), `${relativePath} cue ${index + 1} mismatch`);
      });
      fileCount += 1;
    }
  }
  assert.equal(fileCount, 36);
});

await test('no generated MP4 is declared or present in public assets', () => {
  for (const demo of VIDEO_DEMOS) {
    assert.equal(demo.videoSrc, null);
    assert.equal(demo.status, 'preparing');
  }
  const videoDir = path.join(root, 'public', 'video');
  const walk = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
  if (fs.existsSync(videoDir)) {
    assert.equal(
      walk(videoDir).filter((file) => /\.(mp4|webm|mov)$/i.test(file)).length,
      0
    );
  }
});

await test('status matches MP4 availability for every demo', () => {
  for (const demo of VIDEO_DEMOS) {
    assert.equal(demo.status === 'ready', Boolean(demo.videoSrc), `${demo.id} status/source mismatch`);
    if (demo.status === 'preparing') assert.equal(demo.videoSrc, null);
    else assert.ok(demo.videoSrc && demo.videoSrc.length > 0);
  }
  assert.match(read('src/data/videoShowcase.ts'), /status: 'preparing' \| 'ready'/);
});

await test('all subtitle files are non-empty, BOM-free, valid UTF-8 text', () => {
  let checked = 0;
  for (const demo of VIDEO_DEMOS) {
    for (const language of VIDEO_LANGUAGES) {
      const relativePath = `public${getSubtitlePath(demo, language.code)}`;
      const buffer = fs.readFileSync(path.join(root, relativePath));
      assert.ok(buffer.length > 200, `${relativePath} is empty`);
      assert.notEqual(buffer[0], 0xef, `${relativePath} has a UTF-8 BOM`);
      const text = buffer.toString('utf8');
      assert.ok(Buffer.from(text, 'utf8').equals(buffer), `${relativePath} is not valid UTF-8`);
      assert.doesNotMatch(text, /\uFFFD/, `${relativePath} contains replacement characters`);
      checked += 1;
    }
  }
  assert.equal(checked, 36);
});

await test('storyboards contain no known mixed-script translation artifacts', () => {
  for (const file of ['customer-demo.md', 'shop-owner-demo.md', 'delivery-partner-demo.md']) {
    const source = read(`docs/video/${file}`);
    for (const artifact of ['ऑर्डर-swयतः', 'पात्र 및', 'अmutable', 'listener', 'زير']) {
      assert.doesNotMatch(source, new RegExp(artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${file} still has ${artifact}`);
    }
  }
});

await test('subtitles are provided where voice-over is unavailable', () => {
  const label = getVoiceOverLabel();
  assert.match(label, /Voice-over unavailable/i);
  assert.match(label, /translated subtitles/i);
});

await test('unsupported/unlisted language codes fall back to verified English captions', () => {
  const demo = VIDEO_DEMOS[0];
  const hit = getSubtitleTrack(demo, 'te');
  assert.equal(hit.src, '/video/subtitles/customer.te.vtt');
  assert.equal(hit.fellBackToEnglish, false);
  const fallback = getSubtitleTrack(demo, 'xx' as any);
  assert.equal(fallback.src, '/video/subtitles/customer.en.vtt');
  assert.equal(fallback.srcLang, 'en');
  assert.equal(fallback.fellBackToEnglish, true);
  assert.ok(fs.existsSync(path.join(root, 'public', fallback.src)));
  const source = read('src/components/VideoShowcaseSection.tsx');
  assert.match(source, /subtitleTrack\.fellBackToEnglish/);
  assert.match(source, /showing verified English captions instead/);
  assert.match(read('docs/video/README.md'), /unsupported or unlisted language code/);
});

await test('official website uses the showcase section in the studio route only', () => {
  const source = read('src/components/StudioLanding.tsx');
  assert.match(source, /import \{ VideoShowcaseSection \} from '\.\/VideoShowcaseSection'/);
  assert.match(source, /<VideoShowcaseSection lang=\{lang\} onChangeLang=\{onChangeLang\} onNavigate=\{onNavigate\} \/>/);
  const storefront = read('src/components/StorefrontView.tsx');
  assert.doesNotMatch(storefront, /VideoShowcaseSection/);
  const dashboard = read('src/components/DashboardsHub.tsx');
  assert.doesNotMatch(dashboard, /VideoShowcaseSection/);
});

await test('player exposes play/pause, volume, captions, full screen, poster and language selector', () => {
  const source = read('src/components/VideoShowcaseSection.tsx');
  assert.match(source, /id="watch-how-it-works"/);
  assert.match(source, /VIJAY VISUALS — WATCH HOW IT WORKS/);
  assert.match(source, /aria-label="Select demo subtitle language"/);
  assert.match(source, /aria-label=\{isPlaying \? 'Pause demo video — Play \/ Pause' : 'Play demo video — Play \/ Pause'\}/);
  assert.match(source, /aria-label=\{muted \? 'Unmute demo video — Volume' : 'Mute demo video — Volume'\}/);
  assert.match(source, /Toggle demo video captions — Captions/);
  assert.match(source, /aria-label="Play demo video in full screen — Full screen"/);
  assert.match(source, /kind="captions"/);
  assert.match(source, /poster=\{demo\.posterImage\}/);
  assert.match(source, /requestFullscreen\(\)/);
  assert.match(source, /disabled=\{!videoReady\}/);
  assert.match(source, /getDemoById\(selectedId\)/);
  assert.match(source, /demo\.status === 'preparing'/);
  assert.match(source, /Video being prepared/);
  assert.match(source, /Video source not published/);
  assert.match(source, /\{demo\.status === 'preparing' && \([\s\S]{0,300}No MP4 has been generated\./);
});

await test('showcase is mobile responsive and keeps touch targets accessible', () => {
  const source = read('src/components/VideoShowcaseSection.tsx');
  assert.match(source, /grid grid-cols-1 lg:grid-cols-/);
  assert.match(source, /px-4 sm:px-6/);
  assert.match(source, /min-h-11/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-pressed=/);
  assert.match(source, /aria-expanded=/);
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-\[#D4AF37\]/);
});

await test('poster uses the existing official logo asset', () => {
  for (const demo of VIDEO_DEMOS) {
    assert.equal(demo.posterImage, '/official_logo.png');
  }
  assert.ok(fs.existsSync(path.join(root, 'public', 'official_logo.png')));
});

await test('no empty demo button is shown and every CTA has a real destination', () => {
  const source = read('src/components/VideoShowcaseSection.tsx');
  assert.match(source, /onNavigate\(cta\.view\)/);
  assert.doesNotMatch(source, /onClick=\{\(\) => \{\}\}/);
  assert.match(source, /Read written script/);
  assert.match(source, /narration\.join\(' '\)/);
});

await test('scripts and player do not promise payments, payouts, ratings or earnings', () => {
  const sources = [
    read('src/data/videoShowcase.ts'),
    read('src/components/VideoShowcaseSection.tsx'),
    ...VIDEO_DEMOS.flatMap((demo) =>
      VIDEO_LANGUAGES.map((language) => read(`public${getSubtitlePath(demo, language.code)}`))
    ),
  ].join('\n');
  assert.doesNotMatch(sources, /Razorpay/i);
  assert.doesNotMatch(sources, /₹80,000/i);
  assert.doesNotMatch(sources, /guaranteed income/i);
  assert.doesNotMatch(sources, /fake rating/i);
  assert.doesNotMatch(sources, /customer count is/i);
});

await test('production documentation marks generation as blocked', () => {
  const doc = read('docs/video/README.md');
  assert.match(doc, /VIDEO GENERATION BLOCKED/);
  assert.match(doc, /No MP4 was generated/);
  assert.match(doc, /Do not substitute a slideshow or blank\/fake MP4/);
});

await test('documentation aligns storyboard length with condensed subtitle metadata', () => {
  const readme = read('docs/video/README.md');
  assert.match(readme, /8 condensed narration cues/);
  assert.match(readme, /100s \(customer\), 100s \(shop owner\) and 102s \(delivery partner\)/);
  assert.match(readme, /customer storyboard ends at 95s/);
  const storyboard = read('docs/video/customer-demo.md');
  assert.match(storyboard, /Target length: 95 seconds/);
  assert.match(storyboard, /8 condensed narration cues/);
  assert.doesNotMatch(storyboard, /Target length: 90 seconds/);
});

console.log(`\n${passed}/${passed} video showcase checks passed.`);
