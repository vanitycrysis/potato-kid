// `npm run audio:build`: encodes Codex's WAV masters (art/audio, ASSETS.md "Audio") into
// the runtime formats, Ogg Vorbis and AAC (M4A), in assets/audio/. Claude owns this build
// (ART_AUDIO_PLAN); the masters stay ChatGPT's. Needs ffmpeg on PATH. The outputs are
// committed, so CI and the game never need ffmpeg.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const SRC = 'art/audio';
const OUT = 'assets/audio';
mkdirSync(OUT, { recursive: true });

for (const file of readdirSync(SRC).filter((f) => f.endsWith('.wav'))) {
  const name = basename(file, '.wav');
  const music = name.startsWith('music_');
  const input = join(SRC, file);
  // Short cues at a modest quality; the music a little higher. -bitexact keeps reruns
  // byte-stable where the encoder allows it.
  const ogg = ['-c:a', 'libvorbis', '-q:a', music ? '5' : '4'];
  const m4a = ['-c:a', 'aac', '-b:a', music ? '160k' : '96k', '-movflags', '+faststart'];
  for (const [ext, codec] of [
    ['ogg', ogg],
    ['m4a', m4a],
  ]) {
    const out = join(OUT, `${name}.${ext}`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, ...codec, '-map_metadata', '-1', '-fflags', '+bitexact', out]);
    console.log(out);
  }
}
