// Generates WebVTT subtitle files from the single narration source of truth.
// No audio track is synthesized; 8 condensed cues per demo match videoShowcase timings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vttTime, VIDEO_DEMOS, VIDEO_LANGUAGES } from '../src/data/videoShowcase';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const outputDir = path.join(rootDir, 'public', 'video', 'subtitles');

let written = 0;
fs.mkdirSync(outputDir, { recursive: true });

for (const demo of VIDEO_DEMOS) {
  for (const language of VIDEO_LANGUAGES) {
    const lines = demo.narration[language.code];
    if (!Array.isArray(lines) || lines.length !== demo.timings.length) {
      throw new Error(`Narration timing mismatch: ${demo.id}/${language.code}`);
    }
    const body = lines
      .map((line, index) => {
        const timing = demo.timings[index];
        return `${index + 1}\n${vttTime(timing.startSec)} --> ${vttTime(timing.endSec)}\n${line.trim()}\n`;
      })
      .join('\n');
    const content = [
      'WEBVTT',
      '',
      `NOTE ${demo.id} / ${language.code} — translated narration for a storyboard; no voice-over track is provided.`,
      'NOTE Illustrative AI scenes are labelled in the video. No real payment, payout, testimonial, or guarantee is shown.',
      '',
      body.trim(),
      '',
    ].join('\n');
    const fileName = `${demo.id}.${language.code}.vtt`;
    fs.writeFileSync(path.join(outputDir, fileName), content, 'utf8');
    written += 1;
  }
}

console.log(`Generated ${written} WebVTT subtitle files in public/video/subtitles.`);
