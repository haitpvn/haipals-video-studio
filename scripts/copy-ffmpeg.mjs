// Copies the single-thread ffmpeg.wasm core into public/ so it is served
// from our own GitHub Pages site (no CDN, no special COOP/COEP headers).
import { cpSync, mkdirSync } from 'node:fs';

const src = 'node_modules/@ffmpeg/core/dist/esm';
const dest = 'public/ffmpeg';
mkdirSync(dest, { recursive: true });
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) cpSync(`${src}/${f}`, `${dest}/${f}`);
console.log('ffmpeg core copied to', dest);
