// Export pipeline built on ffmpeg.wasm (single-thread core, so it runs on
// GitHub Pages without COOP/COEP headers). Everything happens in the browser;
// files are read straight from disk via WORKERFS and never uploaded.
//
// Strategy: render each clip to a normalised 1080x1920/30fps segment (text is
// drawn with <canvas> and overlaid as a PNG so Vietnamese diacritics render
// perfectly), then join the segments: stream copy when possible, a final
// re-encode only when transitions are used.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import {
  W, H, FPS, makeCanvas, drawBase, drawOverlay, drawEndCard, canvasToBlob, loadBitmap, ensureFonts,
} from './render.js';

export const TRANSITION_SEC = 0.4;
export const END_CARD_SEC = 3;

let ffmpeg = null;
let loading = null;
let logSink = null;
let mountSeq = 0;

export function isFFmpegLoaded() {
  return !!ffmpeg;
}

export async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (!loading) {
    loading = (async () => {
      const f = new FFmpeg();
      f.on('log', ({ message }) => logSink && logSink(message));
      const base = new URL('ffmpeg/', document.baseURI).href;
      await f.load({ coreURL: `${base}ffmpeg-core.js`, wasmURL: `${base}ffmpeg-core.wasm` });
      ffmpeg = f;
      return f;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/** Stop a running export by killing the worker; it is reloaded next time. */
export function cancelExport() {
  if (ffmpeg) {
    ffmpeg.terminate();
    ffmpeg = null;
    loading = null;
  }
}

async function run(ff, args, onLog) {
  const logs = [];
  logSink = (m) => {
    logs.push(m);
    onLog && onLog(m);
  };
  try {
    const code = await ff.exec(args);
    return { code, logs };
  } finally {
    logSink = null;
  }
}

/** Make a File readable inside ffmpeg without copying it into memory. */
async function mountFile(ff, file) {
  const dir = `/in${++mountSeq}`;
  await ff.createDir(dir);
  try {
    await ff.mount('WORKERFS', { files: [file] }, dir);
    return { path: `${dir}/${file.name}`, dir, mounted: true };
  } catch {
    // Fallback: copy into memory.
    const path = `${dir}/input${extOf(file.name)}`;
    await ff.writeFile(path, new Uint8Array(await file.arrayBuffer()));
    return { path, dir, mounted: false };
  }
}

async function unmountFile(ff, m) {
  try {
    if (m.mounted) await ff.unmount(m.dir);
    else await ff.deleteFile(m.path);
    await ff.deleteDir(m.dir);
  } catch {
    /* ignore */
  }
}

function extOf(name) {
  const m = /\.[a-z0-9]+$/i.exec(name || '');
  return m ? m[0].toLowerCase() : '';
}

function parseTime(s) {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

/** Read duration / size / audio presence of a media file with ffmpeg. */
export async function probeFile(file) {
  const ff = await getFFmpeg();
  const m = await mountFile(ff, file);
  try {
    const { logs } = await run(ff, ['-hide_banner', '-i', m.path]);
    return parseProbe(logs.join('\n'));
  } finally {
    await unmountFile(ff, m);
  }
}

export function parseProbe(text) {
  const info = { duration: 0, width: 0, height: 0, hasAudio: false, hasVideo: false };
  const d = /Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(text);
  if (d) info.duration = parseTime(d[1]) || 0;
  const v = /Stream #\d+:\d+.*?: Video: .*?(\d{2,5})x(\d{2,5})/.exec(text);
  if (v) {
    info.hasVideo = true;
    info.width = +v[1];
    info.height = +v[2];
    if (/rotation of -?90|rotate\s*:\s*(90|270)/.test(text)) [info.width, info.height] = [info.height, info.width];
  }
  info.hasAudio = /Stream #\d+:\d+.*?: Audio:/.test(text);
  return info;
}

const frames = (sec) => Math.max(1, Math.round(sec * FPS));
const fmt = (n) => n.toFixed(3);

async function writeCanvasPng(ff, canvas, path) {
  const blob = await canvasToBlob(canvas, 'image/png');
  await ff.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

/** Duration the clip will occupy in the final video (before transitions). */
export function clipDuration(clip) {
  if (clip.kind === 'image') return Math.max(0.5, +clip.imageDuration || 3);
  const start = Math.max(0, +clip.trimStart || 0);
  const end = Math.min(+clip.duration || 0, +clip.trimEnd || +clip.duration || 0);
  return Math.max(0.2, end - start);
}

const ENC_V = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
const ENC_A = ['-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2'];
const SILENCE = 'anullsrc=r=44100:cl=stereo';
const AFMT = 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo';

/**
 * Export the project.
 * @param {object} p
 * @param {Array} p.clips          clip objects (see state.js)
 * @param {Map}   p.files          clip id -> File
 * @param {object} p.settings      project settings
 * @param {File}  [p.musicFile]
 * @param {ImageBitmap} [p.logo]   end card logo
 * @param {(fraction:number, label:string)=>void} p.onProgress
 * @returns {Promise<Blob>} MP4
 */
export async function exportVideo({ clips, files, settings, musicFile, logo, onProgress }) {
  const report = (f, label) => onProgress && onProgress(Math.max(0, Math.min(1, f)), label);
  report(0, 'Đang tải bộ xử lý video… (lần đầu có thể mất 10–30 giây)');
  await ensureFonts();
  const ff = await getFFmpeg();

  // ---- plan segments
  const segs = clips.map((clip) => {
    const dur = frames(clipDuration(clip)) / FPS;
    return { clip, dur };
  });
  if (settings.endCard) segs.push({ endCard: true, dur: frames(END_CARD_SEC) / FPS });
  if (!segs.length) throw new Error('Chưa có clip nào.');

  const transition = segs.length > 1 && settings.transition && settings.transition !== 'none' ? settings.transition : null;
  const T = transition ? Math.min(TRANSITION_SEC, ...segs.map((s) => s.dur / 2 - 0.05)) : 0;
  const total = segs.reduce((s, x) => s + x.dur, 0) - T * (segs.length - 1);
  const music = musicFile && settings.music ? settings.music : null;

  const finalWeight = transition ? total : music ? total * 0.15 : total * 0.05;
  const totalWeight = segs.reduce((s, x) => s + x.dur, 0) + finalWeight;
  let doneWeight = 0;
  const stepLog = (weight, label) => (m) => {
    const t = /time=\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(m);
    if (t) {
      const sec = parseTime(t[1]) || 0;
      report((doneWeight + Math.min(1, sec / weight.dur) * weight.w) / totalWeight, label);
    }
  };

  const tmp = [];
  try {
    // ---- 1. render each segment
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const out = `seg${i}.mp4`;
      const label = seg.endCard
        ? 'Đang tạo màn hình kết thúc…'
        : `Đang xử lý clip ${i + 1}/${clips.length}…`;
      report(doneWeight / totalWeight, label);
      const dur = fmt(seg.dur);
      const nFrames = frames(seg.dur);
      let args;

      if (seg.endCard) {
        const c = makeCanvas();
        drawEndCard(c.getContext('2d'), logo, {
          brandTag: settings.brandTag !== false,
          disclaimer: !!settings.endCardDisclaimer,
        });
        await writeCanvasPng(ff, c, 'end.png');
        tmp.push('end.png');
        args = [
          '-loop', '1', '-framerate', String(FPS), '-t', dur, '-i', 'end.png',
          '-f', 'lavfi', '-t', dur, '-i', SILENCE,
          '-filter_complex', '[0:v]scale=1080:1920,setsar=1,format=yuv420p[v]',
          '-map', '[v]', '-map', '1:a', ...ENC_V, ...ENC_A, '-t', dur, out,
        ];
      } else {
        const clip = seg.clip;
        const file = files.get(clip.id);
        if (!file) throw new Error(`Thiếu file gốc của clip "${clip.name}". Hãy chọn lại file.`);

        const ov = makeCanvas();
        drawOverlay(ov.getContext('2d'), clip, { brandTag: settings.brandTag !== false });
        const ovPath = `ov${i}.png`;
        await writeCanvasPng(ff, ov, ovPath);
        tmp.push(ovPath);

        if (clip.kind === 'image') {
          const bmp = await loadBitmap(file);
          const base = makeCanvas();
          drawBase(base.getContext('2d'), bmp, bmp.width, bmp.height);
          bmp.close?.();
          const basePath = `base${i}.png`;
          await writeCanvasPng(ff, base, basePath);
          tmp.push(basePath);
          const zoom = settings.imageZoom && clip.zoom !== false;
          const input = zoom
            ? ['-i', basePath]
            : ['-loop', '1', '-framerate', String(FPS), '-t', dur, '-i', basePath];
          const vf = zoom
            ? `[0:v]scale=1620:2880,zoompan=z='min(1+0.08*on/${nFrames},1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${nFrames}:s=${W}x${H}:fps=${FPS},setsar=1[base]`
            : '[0:v]setsar=1[base]';
          args = [
            ...input, '-i', ovPath, '-f', 'lavfi', '-t', dur, '-i', SILENCE,
            '-filter_complex', `${vf};[base][1:v]overlay=0:0,format=yuv420p[v]`,
            '-map', '[v]', '-map', '2:a', ...ENC_V, ...ENC_A, '-t', dur, out,
          ];
        } else {
          const m = await mountFile(ff, file);
          seg.mount = m;
          if (clip.hasAudio == null) {
            const { logs } = await run(ff, ['-hide_banner', '-i', m.path]);
            clip.hasAudio = parseProbe(logs.join('\n')).hasAudio;
          }
          const useAudio = clip.hasAudio && !clip.muted;
          const vf =
            `[0:v]fps=${FPS},tpad=stop_mode=clone:stop_duration=2,split=2[a][b];` +
            '[a]scale=216:384:force_original_aspect_ratio=increase,crop=216:384,boxblur=10:2,eq=brightness=-0.08,scale=1080:1920,setsar=1[bg];' +
            '[b]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[fg];' +
            '[bg][fg]overlay=(W-w)/2:(H-h)/2[base];[base][1:v]overlay=0:0,format=yuv420p[v]';
          const af = useAudio ? `;[0:a]${AFMT},apad[aout]` : '';
          args = [
            '-ss', fmt(Math.max(0, +clip.trimStart || 0)), '-t', dur, '-i', m.path,
            '-i', ovPath, '-f', 'lavfi', '-t', dur, '-i', SILENCE,
            '-filter_complex', vf + af,
            '-map', '[v]', '-map', useAudio ? '[aout]' : '2:a',
            ...ENC_V, ...ENC_A, '-t', dur, out,
          ];
        }
      }

      const { code, logs } = await run(ff, ['-hide_banner', '-y', ...args], stepLog({ dur: seg.dur, w: seg.dur }, label));
      if (seg.mount) await unmountFile(ff, seg.mount);
      if (code !== 0) throw ffError(logs, label);
      tmp.push(out);
      doneWeight += seg.dur;
    }

    // ---- 2. join
    const label = 'Đang ghép video…';
    report(doneWeight / totalWeight, label);
    let musicMount = null;
    const args = ['-hide_banner', '-y'];
    if (music) musicMount = await mountFile(ff, musicFile);
    const vol = Math.max(0, Math.min(1, (+music?.volume || 0) / 100));
    const musicChain = (idx) =>
      `[${idx}:a]${AFMT},volume=${vol.toFixed(2)},atrim=0:${fmt(total)},afade=t=out:st=${fmt(Math.max(0, total - 1.5))}:d=1.5[m]`;

    if (!transition) {
      const list = segs.map((_, i) => `file 'seg${i}.mp4'`).join('\n');
      await ff.writeFile('list.txt', list);
      tmp.push('list.txt');
      args.push('-f', 'concat', '-safe', '0', '-i', 'list.txt');
      if (music) {
        args.push('-stream_loop', '-1', '-i', musicMount.path,
          '-filter_complex', `${musicChain(1)};[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,volume=2[aout]`,
          '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', ...ENC_A);
      } else {
        args.push('-c', 'copy');
      }
    } else {
      segs.forEach((_, i) => args.push('-i', `seg${i}.mp4`));
      const xf = transition === 'slide' ? 'slideleft' : 'fade';
      const parts = [];
      let vPrev = '[0:v]';
      let aPrev = '[0:a]';
      let offset = 0;
      for (let i = 1; i < segs.length; i++) {
        offset += segs[i - 1].dur - T;
        const vo = i === segs.length - 1 ? '[vout]' : `[v${i}]`;
        const ao = i === segs.length - 1 ? '[amain]' : `[a${i}]`;
        parts.push(`${vPrev}[${i}:v]xfade=transition=${xf}:duration=${fmt(T)}:offset=${fmt(offset)}${vo}`);
        parts.push(`${aPrev}[${i}:a]acrossfade=d=${fmt(T)}${ao}`);
        vPrev = vo;
        aPrev = ao;
      }
      if (music) {
        args.push('-stream_loop', '-1', '-i', musicMount.path);
        parts.push(musicChain(segs.length));
        parts.push('[amain][m]amix=inputs=2:duration=first:dropout_transition=0,volume=2[aout]');
      } else {
        parts.push('[amain]anull[aout]');
      }
      args.push('-filter_complex', parts.join(';'), '-map', '[vout]', '-map', '[aout]', ...ENC_V, ...ENC_A);
    }
    args.push('-t', fmt(total), '-movflags', '+faststart', 'out.mp4');

    const { code, logs } = await run(ff, args, stepLog({ dur: total, w: finalWeight }, label));
    if (musicMount) await unmountFile(ff, musicMount);
    if (code !== 0) throw ffError(logs, label);
    tmp.push('out.mp4');

    const data = await ff.readFile('out.mp4');
    report(1, 'Hoàn tất!');
    return new Blob([data.buffer], { type: 'video/mp4' });
  } finally {
    for (const f of tmp) {
      try {
        await ff.deleteFile(f);
      } catch {
        /* ignore */
      }
    }
  }
}

function ffError(logs, label) {
  const tail = logs.slice(-12).join('\n');
  console.error('[ffmpeg]', label, '\n', logs.join('\n'));
  const e = new Error(`Lỗi khi xử lý (${label.replace('…', '')}). Chi tiết kỹ thuật:\n${tail}`);
  e.logs = logs;
  return e;
}
