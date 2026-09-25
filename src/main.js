import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/800.css';
import './style.css';

import {
  W, H, makeCanvas, drawBase, drawOverlay, drawSafeGuide, drawEndCard, ensureFonts, loadBitmap,
} from './render.js';
import {
  defaultSettings, newClip, serializeProject, parseProject, isVideoFile, isImageFile, isAudioFile, formatTime,
} from './state.js';
import {
  exportVideo, cancelExport, probeFile, clipDuration, getFFmpeg, END_CARD_SEC, TRANSITION_SEC,
} from './exporter.js';
import { initSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// State

const project = { clips: [], settings: defaultSettings() };
const files = new Map(); // clip id -> File
const urls = new Map(); // clip id -> object URL
const thumbs = new Map(); // clip id -> data URL
const bitmaps = new Map(); // clip id -> ImageBitmap (images)
let selectedId = null; // clip id or 'end'
let musicFile = null;
let logoBitmap = null;

const END_ID = 'end';

// ---------------------------------------------------------------------------
// Toasts

function toast(msg, type = 'info', ms = 4000) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------------------------------------------------------------------------
// Adding files

async function readVideoMeta(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (ok) => {
      clearTimeout(timer);
      resolve(ok ? { duration: v.duration, width: v.videoWidth, height: v.videoHeight } : null);
      v.removeAttribute('src');
      v.load();
    };
    const timer = setTimeout(() => done(false), 15000);
    v.onloadedmetadata = () => done(isFinite(v.duration) && v.videoWidth > 0);
    v.onerror = () => done(false);
    v.src = url;
  });
}

async function makeVideoThumb(url, at) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    const timer = setTimeout(() => resolve(null), 10000);
    v.onloadeddata = () => {
      v.currentTime = at;
    };
    v.onseeked = () => {
      clearTimeout(timer);
      resolve(thumbFrom(v, v.videoWidth, v.videoHeight));
    };
    v.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    v.src = url;
  });
}

function thumbFrom(src, sw, sh) {
  const c = makeCanvas(90, 160);
  const ctx = c.getContext('2d');
  ctx.scale(90 / W, 160 / H);
  drawBase(ctx, src, sw, sh);
  return c.toDataURL('image/jpeg', 0.7);
}

async function addFiles(list) {
  const incoming = [...list];
  if (!incoming.length) return;

  // Re-link missing files from a loaded project first.
  const missing = project.clips.filter((c) => !files.has(c.id));
  const rest = [];
  for (const f of incoming) {
    const match =
      missing.find((c) => !files.has(c.id) && c.name === f.name && c.size === f.size) ||
      missing.find((c) => !files.has(c.id) && c.name === f.name);
    if (match) await attachFile(match, f);
    else rest.push(f);
  }
  const relinked = incoming.length - rest.length;
  if (relinked) toast(`Đã nối lại ${relinked} file.`, 'ok');

  for (const f of rest) {
    if (isVideoFile(f) || isImageFile(f)) {
      const clip = newClip(f, isVideoFile(f) ? 'video' : 'image');
      project.clips.push(clip);
      renderList();
      const ok = await attachFile(clip, f, true);
      if (!ok) {
        project.clips.splice(project.clips.indexOf(clip), 1);
        files.delete(clip.id);
      } else if (!selectedId) selectedId = clip.id;
    } else if (isAudioFile(f)) {
      setMusic(f);
    } else {
      toast(`Không hỗ trợ file "${f.name}". Hãy dùng MP4, MOV, JPG hoặc PNG.`, 'warn');
    }
  }
  renderAll();
}

/** Attach a File to a clip and read its metadata. Returns false if unusable. */
async function attachFile(clip, file, isNew = false) {
  files.set(clip.id, file);
  if (urls.has(clip.id)) URL.revokeObjectURL(urls.get(clip.id));
  const url = URL.createObjectURL(file);
  urls.set(clip.id, url);

  if (clip.kind === 'image') {
    try {
      const bmp = await loadBitmap(file);
      bitmaps.set(clip.id, bmp);
      clip.width = bmp.width;
      clip.height = bmp.height;
      thumbs.set(clip.id, thumbFrom(bmp, bmp.width, bmp.height));
      return true;
    } catch {
      toast(`Không đọc được ảnh "${file.name}".`, 'error');
      return false;
    }
  }

  let meta = await readVideoMeta(url);
  clip.previewable = !!meta;
  if (!meta) {
    // Browser can't play it (e.g. some iPhone HEVC files) — ask ffmpeg.
    toast(`Đang đọc "${file.name}"…`, 'info', 6000);
    try {
      const info = await probeFile(file);
      if (!info.hasVideo || !info.duration) throw new Error('no video');
      meta = { duration: info.duration, width: info.width, height: info.height };
      clip.hasAudio = info.hasAudio;
      toast(`Trình duyệt không xem trước được "${file.name}", nhưng vẫn xuất video bình thường.`, 'warn', 7000);
    } catch {
      toast(`Không đọc được video "${file.name}".`, 'error');
      return false;
    }
  }
  if (!isNew && clip.duration && Math.abs(clip.duration - meta.duration) > 0.5) {
    toast(`Lưu ý: "${file.name}" có độ dài khác với lúc lưu dự án.`, 'warn');
  }
  clip.duration = meta.duration;
  clip.width = meta.width;
  clip.height = meta.height;
  if (isNew || !clip.trimEnd || clip.trimEnd > meta.duration) clip.trimEnd = +meta.duration.toFixed(2);
  if (clip.trimStart >= clip.trimEnd) clip.trimStart = 0;
  if (clip.previewable) {
    const t = await makeVideoThumb(url, Math.min(0.5, meta.duration / 2));
    if (t) thumbs.set(clip.id, t);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Timeline list

function clipById(id) {
  return project.clips.find((c) => c.id === id);
}

function renderList() {
  const ol = $('clipList');
  ol.innerHTML = '';
  project.clips.forEach((clip, i) => {
    const li = document.createElement('li');
    li.className = 'clip';
    li.draggable = true;
    li.dataset.id = clip.id;
    if (clip.id === selectedId) li.classList.add('selected');
    const missing = !files.has(clip.id);
    if (missing) li.classList.add('missing');
    const thumb = thumbs.get(clip.id);
    const dur = clipDuration(clip);
    li.innerHTML = `
      <span class="grip" aria-hidden="true">⋮⋮</span>
      <span class="num">${i + 1}</span>
      <span class="thumb">${thumb ? `<img src="${thumb}" alt="">` : clip.kind === 'image' ? '🖼️' : '🎬'}</span>
      <span class="meta">
        <span class="name"></span>
        <span class="sub">${missing ? '⚠️ Thiếu file' : `${clip.kind === 'image' ? 'Ảnh' : 'Video'} · ${formatTime(dur)}`}${clip.headline ? ' · 🔤' : ''}</span>
      </span>
      <span class="ctrl">
        <button type="button" data-act="up" title="Lên trên" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" data-act="down" title="Xuống dưới" ${i === project.clips.length - 1 ? 'disabled' : ''}>▼</button>
        <button type="button" data-act="del" title="Xoá clip">✕</button>
      </span>`;
    li.querySelector('.name').textContent = clip.name;
    ol.append(li);
  });

  if (project.settings.endCard) {
    const li = document.createElement('li');
    li.className = 'clip endcard';
    li.dataset.id = END_ID;
    if (selectedId === END_ID) li.classList.add('selected');
    li.innerHTML = `<span class="grip"></span><span class="num">★</span><span class="thumb">🏁</span>
      <span class="meta"><span class="name">Màn hình kết thúc</span><span class="sub">${formatTime(END_CARD_SEC)} · Nhắn Haipals ngay</span></span>`;
    ol.append(li);
  }

  const n = project.clips.length;
  if (!n) $('totalTime').textContent = 'Chưa có clip nào';
  else {
    const segs = project.clips.map(clipDuration);
    if (project.settings.endCard) segs.push(END_CARD_SEC);
    const trans = project.settings.transition !== 'none' ? TRANSITION_SEC * (segs.length - 1) : 0;
    const total = segs.reduce((a, b) => a + b, 0) - trans;
    $('totalTime').textContent = `${n} clip · Tổng thời lượng ${formatTime(total)}`;
  }
  renderMissing();
}

function renderMissing() {
  const missing = project.clips.filter((c) => !files.has(c.id));
  $('missingBanner').hidden = !missing.length;
  if (missing.length) {
    $('missingText').textContent =
      `Dự án cần ${missing.length} file gốc: ${missing.map((c) => c.name).join(', ')}. ` +
      'Bấm "Chọn lại file" hoặc kéo thả các file đó vào.';
  }
}

function moveClip(id, delta) {
  const i = project.clips.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= project.clips.length) return;
  const [c] = project.clips.splice(i, 1);
  project.clips.splice(j, 0, c);
  renderList();
}

function deleteClip(id) {
  const clip = clipById(id);
  if (!clip) return;
  if (!confirm(`Xoá clip "${clip.name}" khỏi dự án?`)) return;
  project.clips.splice(project.clips.indexOf(clip), 1);
  files.delete(id);
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  thumbs.delete(id);
  bitmaps.get(id)?.close?.();
  bitmaps.delete(id);
  if (selectedId === id) selectedId = project.clips[0]?.id || null;
  renderAll();
}

function initList() {
  const ol = $('clipList');
  ol.addEventListener('click', (e) => {
    const li = e.target.closest('li.clip');
    if (!li) return;
    const act = e.target.closest('button')?.dataset.act;
    const id = li.dataset.id;
    if (act === 'up') moveClip(id, -1);
    else if (act === 'down') moveClip(id, 1);
    else if (act === 'del') deleteClip(id);
    else select(id);
  });

  // Drag to reorder.
  let dragId = null;
  ol.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li.clip');
    if (!li || li.dataset.id === END_ID) return;
    dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  ol.addEventListener('dragend', () => {
    dragId = null;
    ol.querySelectorAll('.drop-before,.drop-after,.dragging').forEach((el) =>
      el.classList.remove('drop-before', 'drop-after', 'dragging'),
    );
  });
  ol.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const li = e.target.closest('li.clip');
    ol.querySelectorAll('.drop-before,.drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    if (!li || li.dataset.id === dragId || li.dataset.id === END_ID) return;
    const r = li.getBoundingClientRect();
    li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  ol.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    const li = e.target.closest('li.clip');
    if (!li || li.dataset.id === dragId || li.dataset.id === END_ID) return;
    const r = li.getBoundingClientRect();
    const after = e.clientY >= r.top + r.height / 2;
    const from = project.clips.findIndex((c) => c.id === dragId);
    const [c] = project.clips.splice(from, 1);
    let to = project.clips.findIndex((x) => x.id === li.dataset.id);
    if (after) to++;
    project.clips.splice(to, 0, c);
    renderList();
  });
}

// ---------------------------------------------------------------------------
// Inspector

function select(id) {
  selectedId = id;
  pause();
  renderAll();
}

function renderInspector() {
  const clip = clipById(selectedId);
  const has = !!clip;
  $('inspector').hidden = !has;
  $('inspectorEmpty').hidden = has;
  $('inspectorEmpty').textContent =
    selectedId === END_ID
      ? 'Màn hình kết thúc dùng logo và cài đặt ở phần "Cài đặt chung" bên dưới.'
      : 'Chọn một clip bên trái để chỉnh.';
  if (!has) return;

  $('insName').textContent = clip.name;
  const isVideo = clip.kind === 'video';
  $('trimBox').hidden = !isVideo;
  $('imageBox').hidden = isVideo;
  $('muteRow').hidden = !isVideo;
  $('zoomRow').hidden = isVideo || !project.settings.imageZoom;

  if (isVideo) {
    $('trimStart').value = (+clip.trimStart).toFixed(1);
    $('trimEnd').value = (+clip.trimEnd).toFixed(1);
    $('trimStart').max = $('trimEnd').max = clip.duration.toFixed(1);
    $('trimInfo').textContent = `Độ dài gốc ${formatTime(clip.duration)} → sau khi cắt ${formatTime(clipDuration(clip))}`;
    const noAudio = clip.hasAudio === false;
    $('muted').disabled = noAudio;
    $('muted').checked = clip.muted || noAudio;
  } else {
    $('imageDuration').value = clip.imageDuration;
  }
  for (const k of ['headline', 'subtitle', 'pill']) if (document.activeElement !== $(k)) $(k).value = clip[k] || '';
  document.querySelectorAll('input[name=textPos]').forEach((r) => (r.checked = r.value === clip.textPos));
  $('disclaimer').checked = !!clip.disclaimer;
  $('zoom').checked = clip.zoom !== false;
}

function initInspector() {
  const upd = (fn, full = false) => () => {
    const clip = clipById(selectedId);
    if (!clip) return;
    fn(clip);
    overlayDirty = true;
    if (full) renderAll();
    else {
      renderList();
      drawPreview();
    }
  };
  for (const k of ['headline', 'subtitle', 'pill']) $(k).addEventListener('input', upd((c) => (c[k] = $(k).value)));
  document.querySelectorAll('input[name=textPos]').forEach((r) =>
    r.addEventListener('change', upd((c) => (c.textPos = r.value))),
  );
  $('disclaimer').addEventListener('change', upd((c) => (c.disclaimer = $('disclaimer').checked)));
  $('muted').addEventListener('change', upd((c) => (c.muted = $('muted').checked)));
  $('zoom').addEventListener('change', upd((c) => (c.zoom = $('zoom').checked)));
  $('imageDuration').addEventListener('change', upd((c) => {
    c.imageDuration = Math.min(30, Math.max(0.5, +$('imageDuration').value || 3));
  }, true));

  const setTrim = (start, end) => {
    const clip = clipById(selectedId);
    if (!clip) return;
    const d = clip.duration;
    start = Math.max(0, Math.min(+start || 0, d - 0.2));
    end = Math.max(start + 0.2, Math.min(+end || d, d));
    clip.trimStart = +start.toFixed(2);
    clip.trimEnd = +end.toFixed(2);
    renderAll();
  };
  $('trimStart').addEventListener('change', () => setTrim($('trimStart').value, clipById(selectedId)?.trimEnd));
  $('trimEnd').addEventListener('change', () => setTrim(clipById(selectedId)?.trimStart, $('trimEnd').value));
  $('btnSetStart').addEventListener('click', () => {
    const c = clipById(selectedId);
    if (c) setTrim(+$('scrub').value, c.trimEnd);
  });
  $('btnSetEnd').addEventListener('click', () => {
    const c = clipById(selectedId);
    if (c) setTrim(c.trimStart, +$('scrub').value);
  });

  $('btnApplyAll').addEventListener('click', () => {
    const c = clipById(selectedId);
    if (!c) return;
    for (const o of project.clips) {
      o.textPos = c.textPos;
      o.disclaimer = c.disclaimer;
      if (o.kind === 'image') o.zoom = c.zoom;
    }
    toast('Đã áp dụng cho tất cả clip.', 'ok');
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Preview

const pv = $('preview');
const pctx = pv.getContext('2d');
const video = document.createElement('video');
video.playsInline = true;
video.preload = 'auto';
let overlayCanvas = makeCanvas();
let overlayDirty = true;
let overlayFor = null;
let playing = false;
let rafId = 0;
let loadedVideoId = null;

function currentSource() {
  const clip = clipById(selectedId);
  if (!clip || !files.has(clip.id)) return null;
  if (clip.kind === 'image') {
    const b = bitmaps.get(clip.id);
    return b ? { src: b, w: b.width, h: b.height } : null;
  }
  if (!clip.previewable || loadedVideoId !== clip.id || video.readyState < 2) return null;
  return { src: video, w: video.videoWidth, h: video.videoHeight };
}

function drawPreview() {
  const clip = clipById(selectedId);
  const isEnd = selectedId === END_ID;
  $('previewEmpty').hidden = !!clip || isEnd;
  if (clip && !files.has(clip.id)) {
    $('previewEmpty').hidden = false;
    $('previewEmpty').textContent = 'Thiếu file gốc — hãy chọn lại file';
  } else if (clip && clip.kind === 'video' && !clip.previewable) {
    $('previewEmpty').hidden = false;
    $('previewEmpty').textContent = 'Trình duyệt không xem trước được video này (vẫn xuất được)';
  } else $('previewEmpty').textContent = 'Thêm clip để xem trước';

  pctx.setTransform(pv.width / W, 0, 0, pv.height / H, 0, 0);
  if (isEnd) {
    drawEndCard(pctx, logoBitmap, {
      brandTag: project.settings.brandTag,
      disclaimer: project.settings.endCardDisclaimer,
    });
  } else {
    const s = currentSource();
    drawBase(pctx, s?.src, s?.w, s?.h);
    if (clip) {
      if (overlayDirty || overlayFor !== clip.id) {
        const octx = overlayCanvas.getContext('2d');
        octx.clearRect(0, 0, W, H);
        drawOverlay(octx, clip, { brandTag: project.settings.brandTag });
        overlayDirty = false;
        overlayFor = clip.id;
      }
      pctx.drawImage(overlayCanvas, 0, 0);
    }
  }
  if ($('chkSafe').checked) drawSafeGuide(pctx);
}

function loadPreviewVideo() {
  const clip = clipById(selectedId);
  const isVideo = clip && clip.kind === 'video' && files.has(clip.id) && clip.previewable;
  $('player').classList.toggle('disabled', !isVideo);
  if (!isVideo) {
    loadedVideoId = null;
    video.removeAttribute('src');
    video.load();
    $('scrub').max = 1;
    $('scrub').value = 0;
    $('timeLabel').textContent = clip?.kind === 'image' ? `Ảnh · ${clip.imageDuration}s` : '';
    return;
  }
  $('scrub').max = clip.duration;
  if (loadedVideoId === clip.id) return;
  loadedVideoId = clip.id;
  video.src = urls.get(clip.id);
  video.currentTime = clip.trimStart || 0;
}

video.addEventListener('loadeddata', drawPreview);
video.addEventListener('seeked', () => {
  syncScrub();
  drawPreview();
});

function syncScrub() {
  $('scrub').value = video.currentTime;
  $('timeLabel').textContent = formatTime(video.currentTime);
}

function tick() {
  const clip = clipById(selectedId);
  if (!playing || !clip) return;
  if (video.currentTime >= clip.trimEnd - 0.03 || video.ended) {
    video.currentTime = clip.trimStart;
  }
  syncScrub();
  drawPreview();
  rafId = requestAnimationFrame(tick);
}

function play() {
  const clip = clipById(selectedId);
  if (!clip || clip.kind !== 'video' || loadedVideoId !== clip.id) return;
  if (video.currentTime < clip.trimStart || video.currentTime >= clip.trimEnd - 0.05) video.currentTime = clip.trimStart;
  video.muted = clip.muted;
  video.play().catch(() => {});
  playing = true;
  $('btnPlay').textContent = '❚❚';
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

function pause() {
  playing = false;
  video.pause();
  $('btnPlay').textContent = '▶';
  cancelAnimationFrame(rafId);
}

function initPreview() {
  $('btnPlay').addEventListener('click', () => (playing ? pause() : play()));
  $('scrub').addEventListener('input', () => {
    if (loadedVideoId) {
      pause();
      video.currentTime = +$('scrub').value;
      $('timeLabel').textContent = formatTime(+$('scrub').value);
    }
  });
  $('chkSafe').addEventListener('change', drawPreview);
}

// ---------------------------------------------------------------------------
// Save / load project

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function saveProject() {
  if (!project.clips.length) return toast('Chưa có gì để lưu.', 'warn');
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  download(blob, `du-an-haipals-${stamp()}.json`);
  toast('Đã lưu dự án. Giữ file .json cùng các file video/ảnh gốc để làm tiếp.', 'ok', 6000);
}

async function openProject(file) {
  try {
    const data = parseProject(await file.text());
    if (project.clips.length && !confirm('Mở dự án mới sẽ thay thế dự án đang làm. Tiếp tục?')) return;
    pause();
    for (const u of urls.values()) URL.revokeObjectURL(u);
    files.clear();
    urls.clear();
    thumbs.clear();
    bitmaps.clear();
    project.clips = data.clips;
    project.settings = data.settings;
    selectedId = project.clips[0]?.id || null;
    overlayDirty = true;
    musicFile = null;
    renderAll();
    settingsUI?.refresh();
    toast('Đã mở dự án. Hãy chọn lại các file video/ảnh gốc.', 'ok', 6000);
  } catch (e) {
    toast(e.message || 'Không mở được file dự án.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Export

let exporting = false;
let cancelled = false;

async function runExport() {
  if (exporting) return;
  if (!project.clips.length) return toast('Hãy thêm ít nhất một clip.', 'warn');
  const missing = project.clips.filter((c) => !files.has(c.id));
  if (missing.length) return toast('Còn thiếu file gốc. Hãy chọn lại file trước khi xuất.', 'warn');
  if (project.settings.music && !musicFile) {
    return toast('Thiếu file nhạc nền. Hãy chọn lại nhạc hoặc bỏ nhạc nền.', 'warn');
  }

  pause();
  exporting = true;
  cancelled = false;
  const dlg = $('exportDialog');
  $('exportRunning').hidden = false;
  $('exportDone').hidden = true;
  $('exportError').hidden = true;
  setProgress(0, 'Đang chuẩn bị…');
  dlg.showModal();
  const t0 = performance.now();
  try {
    const blob = await exportVideo({
      clips: project.clips,
      files,
      settings: project.settings,
      musicFile,
      logo: logoBitmap,
      onProgress: setProgress,
    });
    const url = URL.createObjectURL(blob);
    const old = $('resultVideo').src;
    if (old) URL.revokeObjectURL(old);
    $('resultVideo').src = url;
    $('btnDownload').href = url;
    $('btnDownload').download = `haipals-${stamp()}.mp4`;
    const secs = Math.round((performance.now() - t0) / 1000);
    $('resultInfo').textContent = `Video 1080×1920 · ${(blob.size / 1048576).toFixed(1)} MB · xuất trong ${secs} giây.`;
    $('exportRunning').hidden = true;
    $('exportDone').hidden = false;
  } catch (e) {
    if (cancelled) {
      dlg.close();
    } else {
      console.error(e);
      $('errorText').textContent = e?.message || String(e);
      $('exportRunning').hidden = true;
      $('exportError').hidden = false;
    }
  } finally {
    exporting = false;
  }
}

function setProgress(f, label) {
  const pct = Math.floor(f * 100);
  $('progressFill').style.width = `${pct}%`;
  $('progressPct').textContent = `${pct}%`;
  document.querySelector('.progress').setAttribute('aria-valuenow', pct);
  if (label) $('exportLabel').textContent = label;
}

function initExport() {
  $('btnExport').addEventListener('click', runExport);
  $('btnCancel').addEventListener('click', () => {
    if (!confirm('Huỷ xuất video?')) return;
    cancelled = true;
    cancelExport();
    $('exportDialog').close();
    toast('Đã huỷ xuất video.', 'info');
  });
  $('btnCloseExport').addEventListener('click', () => $('exportDialog').close());
  $('btnCloseError').addEventListener('click', () => $('exportDialog').close());
  $('exportDialog').addEventListener('cancel', (e) => exporting && e.preventDefault());
}

// ---------------------------------------------------------------------------
// Settings panel hooks (music, logo, transitions, end card)

let settingsUI = null;

function setMusic(f) {
  musicFile = f;
  if (f) {
    project.settings.music = { name: f.name, size: f.size, volume: project.settings.music?.volume ?? 30 };
    toast(`Đã chọn nhạc nền: ${f.name}`, 'ok');
  } else project.settings.music = null;
  settingsUI?.refresh();
}

// ---------------------------------------------------------------------------

function renderAll() {
  if (selectedId && selectedId !== END_ID && !clipById(selectedId)) selectedId = project.clips[0]?.id || null;
  if (selectedId === END_ID && !project.settings.endCard) selectedId = project.clips[0]?.id || null;
  renderList();
  renderInspector();
  loadPreviewVideo();
  overlayDirty = true;
  drawPreview();
}

function initDrop() {
  $('fileInput').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });
  let depth = 0;
  const isFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!isFiles(e)) return;
    depth++;
    document.body.classList.add('dragging-files');
  });
  window.addEventListener('dragleave', (e) => {
    if (!isFiles(e)) return;
    if (--depth <= 0) {
      depth = 0;
      document.body.classList.remove('dragging-files');
    }
  });
  window.addEventListener('dragover', (e) => {
    if (isFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!isFiles(e)) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging-files');
    addFiles(e.dataTransfer.files);
  });
}

function init() {
  initDrop();
  initList();
  initInspector();
  initPreview();
  initExport();

  $('btnSave').addEventListener('click', saveProject);
  $('btnOpen').addEventListener('click', () => $('projectInput').click());
  $('projectInput').addEventListener('change', (e) => {
    if (e.target.files[0]) openProject(e.target.files[0]);
    e.target.value = '';
  });
  $('btnRelink').addEventListener('click', () => $('relinkInput').click());
  $('relinkInput').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });

  window.addEventListener('beforeunload', (e) => {
    if (project.clips.length || exporting) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  settingsUI = initSettings({
    root: $('settingsPanel'),
    project,
    toast,
    getMusic: () => musicFile,
    setMusic,
    setLogo: (bmp) => {
      logoBitmap = bmp;
      drawPreview();
    },
    onChange: () => {
      overlayDirty = true;
      renderAll();
    },
    selectEndCard: () => select(END_ID),
  });

  ensureFonts().then(() => {
    overlayDirty = true;
    drawPreview();
  });
  renderAll();
}

init();

// Handy for debugging / automated checks.
window.__haipals = { project, files, addFiles, runExport, getFFmpeg };
