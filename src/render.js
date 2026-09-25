// Canvas drawing shared by the live preview and the exporter, so what staff
// see in the preview is exactly what ends up in the MP4.

export const W = 1080;
export const H = 1920;
export const FPS = 30;

// Instagram / TikTok safe zone: nothing important in the top 150px, bottom
// 450px or right 120px. We also keep a small left margin.
export const SAFE = { top: 150, bottom: 450, right: 120, left: 60 };
export const SAFE_BOX = {
  x: SAFE.left,
  y: SAFE.top,
  w: W - SAFE.left - SAFE.right,
  h: H - SAFE.top - SAFE.bottom,
};
const CX = SAFE_BOX.x + SAFE_BOX.w / 2;
const SAFE_BOTTOM = SAFE_BOX.y + SAFE_BOX.h; // 1470

export const COLORS = {
  navy: '#163052',
  coral: '#E2483A',
  teal: '#00808C',
  sky: '#8FD3F4',
  cream: '#FFF6E6',
  white: '#FFFFFF',
};

export const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
export const DISCLAIMER_TEXT =
  'Kết quả visa do Đại sứ quán quyết định. Quy định có thể thay đổi.';
export const BRAND_TAG = 'Haipals Đi Đâu';

const SAMPLE = 'Haipals Đi Đâu ắằẳẵặấầẩẫậđéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ';

/** Wait until all three bundled font weights (incl. Vietnamese subset) are ready. */
export async function ensureFonts() {
  await Promise.all(
    [400, 600, 800].map((w) => document.fonts.load(`${w} 40px "Be Vietnam Pro"`, SAMPLE)),
  );
}

export function makeCanvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function font(weight, size) {
  return `${weight} ${size}px ${FONT}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Greedy word wrap. */
export function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Pick the largest size (down to min) that fits in maxLines. */
function fitText(ctx, text, weight, size, minSize, maxWidth, maxLines) {
  let s = size;
  let lines;
  for (; s >= minSize; s -= 4) {
    ctx.font = font(weight, s);
    lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) break;
  }
  s = Math.max(s, minSize);
  ctx.font = font(weight, s);
  return { size: s, lines: balancedLines(ctx, text, maxWidth) };
}

/** Wrap into the same number of lines but with evenly long lines (no orphans). */
function balancedLines(ctx, text, maxWidth) {
  const lines = wrapLines(ctx, text, maxWidth);
  if (lines.length < 2 || text.includes('\n')) return lines;
  let lo = maxWidth / 3;
  let hi = maxWidth;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(ctx, text, mid).length > lines.length) lo = mid;
    else hi = mid;
  }
  return wrapLines(ctx, text, hi);
}

// ---------------------------------------------------------------------------
// Base frame: blurred "cover" background + "contain" foreground.

/**
 * Draw a media source (video/img/bitmap) into a 1080x1920 space:
 * blurred cover fill behind, un-stretched fit in front.
 */
export function drawBase(ctx, src, sw, sh) {
  ctx.save();
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, W, H);
  if (!src || !sw || !sh) {
    ctx.restore();
    return;
  }
  // Background: cover, heavily blurred and slightly darkened. Drawing through a
  // tiny canvas first keeps the blur cheap enough for live preview.
  const tiny = drawBase.tiny || (drawBase.tiny = makeCanvas(108, 192));
  const tctx = tiny.getContext('2d');
  const cover = Math.max(108 / sw, 192 / sh);
  tctx.drawImage(src, (108 - sw * cover) / 2, (192 - sh * cover) / 2, sw * cover, sh * cover);
  ctx.filter = 'blur(24px) brightness(0.8)';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tiny, -60, -60, W + 120, H + 120);
  ctx.filter = 'none';

  // Foreground: contain (landscape => fit to width).
  const fit = Math.min(W / sw, H / sh);
  const fw = sw * fit;
  const fh = sh * fit;
  ctx.drawImage(src, (W - fw) / 2, (H - fh) / 2, fw, fh);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Overlay: brand tag, headline, subtitle, pill button, disclaimer.

function drawBrandTag(ctx) {
  ctx.save();
  ctx.font = font(600, 34);
  const padX = 26;
  const h = 62;
  const tw = ctx.measureText(BRAND_TAG).width;
  const x = SAFE_BOX.x;
  const y = SAFE_BOX.y + 20;
  const dot = 14;
  const w = tw + padX * 2 + dot + 12;
  ctx.fillStyle = 'rgba(22, 48, 82, 0.82)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = COLORS.coral;
  ctx.beginPath();
  ctx.arc(x + padX + dot / 2, y + h / 2, dot / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.textBaseline = 'middle';
  ctx.fillText(BRAND_TAG, x + padX + dot + 12, y + h / 2 + 1);
  ctx.restore();
}

/** Returns the top y of the disclaimer block (so text can stack above it). */
function drawDisclaimer(ctx, bottom = SAFE_BOTTOM - 10) {
  ctx.save();
  ctx.font = font(400, 26);
  const lines = wrapLines(ctx, DISCLAIMER_TEXT, SAFE_BOX.w - 48);
  const lh = 36;
  const h = lines.length * lh + 20;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 40;
  const y = bottom - h;
  ctx.fillStyle = 'rgba(22, 48, 82, 0.6)';
  roundRect(ctx, CX - w / 2, y, w, h, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, CX, y + 10 + lh * i + lh / 2));
  ctx.restore();
  return y;
}

function strokedLines(ctx, lines, size, weight, strokeW, startY, lh) {
  ctx.font = font(weight, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  lines.forEach((l, i) => {
    const y = startY + lh * i + lh / 2;
    ctx.strokeStyle = COLORS.navy;
    ctx.lineWidth = strokeW;
    ctx.strokeText(l, CX, y);
    ctx.fillStyle = COLORS.white;
    ctx.fillText(l, CX, y);
  });
}

/** Measure + draw the headline/subtitle/pill stack. */
function layoutTextBlock(ctx, clip) {
  const maxW = SAFE_BOX.w - 20;
  const items = [];
  if (clip.headline?.trim()) {
    const { size, lines } = fitText(ctx, clip.headline.trim(), 800, 88, 56, maxW, 3);
    const lh = Math.round(size * 1.18);
    items.push({ kind: 'headline', size, lines, lh, h: lines.length * lh });
  }
  if (clip.subtitle?.trim()) {
    const { size, lines } = fitText(ctx, clip.subtitle.trim(), 600, 50, 36, maxW, 3);
    const lh = Math.round(size * 1.25);
    items.push({ kind: 'subtitle', size, lines, lh, h: lines.length * lh });
  }
  if (clip.pill?.trim()) {
    const { size, lines } = fitText(ctx, clip.pill.trim(), 600, 44, 30, maxW - 80, 1);
    ctx.font = font(600, size);
    const w = Math.min(maxW, ctx.measureText(lines[0] || '').width + 80);
    items.push({ kind: 'pill', size, text: lines[0] || '', w, h: size + 44 });
  }
  const gap = 22;
  const total = items.reduce((s, it) => s + it.h, 0) + gap * Math.max(0, items.length - 1);
  return { items, total, gap };
}

function drawTextBlock(ctx, block, top) {
  let y = top;
  for (const it of block.items) {
    if (it.kind === 'headline') strokedLines(ctx, it.lines, it.size, 800, Math.round(it.size * 0.16), y, it.lh);
    else if (it.kind === 'subtitle') strokedLines(ctx, it.lines, it.size, 600, Math.round(it.size * 0.2), y, it.lh);
    else if (it.kind === 'pill') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = COLORS.coral;
      roundRect(ctx, CX - it.w / 2, y, it.w, it.h, it.h / 2);
      ctx.fill();
      ctx.restore();
      ctx.font = font(600, it.size);
      ctx.fillStyle = COLORS.white;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.text, CX, y + it.h / 2 + 1);
    }
    y += it.h + block.gap;
  }
}

/**
 * Transparent 1080x1920 overlay for one clip.
 * opts.brandTag (default true), clip.disclaimer, clip.textPos: top|middle|bottom
 */
export function drawOverlay(ctx, clip, opts = {}) {
  ctx.save();
  if (opts.brandTag !== false) drawBrandTag(ctx);
  let bottomLimit = SAFE_BOTTOM - 10;
  if (clip.disclaimer) bottomLimit = drawDisclaimer(ctx) - 24;

  const block = layoutTextBlock(ctx, clip);
  if (block.items.length) {
    const topLimit = SAFE_BOX.y + 120; // below brand tag
    let top;
    if (clip.textPos === 'top') top = topLimit;
    else if (clip.textPos === 'middle') top = (topLimit + bottomLimit) / 2 - block.total / 2;
    else top = bottomLimit - block.total;
    top = Math.max(topLimit, Math.min(top, bottomLimit - block.total));
    drawTextBlock(ctx, block, top);
  }
  ctx.restore();
}

/** Dashed guide showing the safe zone (preview only, never exported). */
export function drawSafeGuide(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(226, 72, 58, 0.18)';
  ctx.fillRect(0, 0, W, SAFE.top);
  ctx.fillRect(0, H - SAFE.bottom, W, SAFE.bottom);
  ctx.fillRect(W - SAFE.right, SAFE.top, SAFE.right, H - SAFE.top - SAFE.bottom);
  ctx.setLineDash([18, 12]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.strokeRect(SAFE_BOX.x, SAFE_BOX.y, SAFE_BOX.w, SAFE_BOX.h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// End card.

export const END_CTA = 'Nhắn Haipals ngay';
export const END_URL = 'haipals.co.uk';

export function drawEndCard(ctx, logo, opts = {}) {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLORS.sky);
  g.addColorStop(0.62, COLORS.cream);
  g.addColorStop(1, COLORS.cream);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Logo / banner, fitted inside the upper part of the safe zone.
  const box = { x: SAFE_BOX.x + 30, y: SAFE_BOX.y + 140, w: SAFE_BOX.w - 60, h: 620 };
  if (logo && logo.width) {
    const s = Math.min(box.w / logo.width, box.h / logo.height);
    const lw = logo.width * s;
    const lh = logo.height * s;
    ctx.drawImage(logo, CX - lw / 2, box.y + (box.h - lh) / 2, lw, lh);
  } else {
    ctx.fillStyle = COLORS.navy;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(800, 120);
    ctx.fillText('Hai & Pals', CX, box.y + box.h / 2 - 50);
    ctx.font = font(600, 44);
    ctx.fillStyle = COLORS.teal;
    ctx.fillText('Travel & Visa', CX, box.y + box.h / 2 + 60);
  }

  // CTA pill.
  ctx.font = font(800, 64);
  const tw = ctx.measureText(END_CTA).width;
  const pw = Math.min(SAFE_BOX.w - 20, tw + 120);
  const ph = 130;
  const py = box.y + box.h + 70;
  ctx.save();
  ctx.shadowColor = 'rgba(22,48,82,0.3)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = COLORS.coral;
  roundRect(ctx, CX - pw / 2, py, pw, ph, ph / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(END_CTA, CX, py + ph / 2 + 2);

  ctx.font = font(600, 56);
  ctx.fillStyle = COLORS.navy;
  ctx.fillText(END_URL, CX, py + ph + 90);
  ctx.restore();

  if (opts.brandTag !== false) drawBrandTag(ctx);
  if (opts.disclaimer) drawDisclaimer(ctx);
}

// ---------------------------------------------------------------------------

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
  );
}

/** Load a File/Blob/URL as an ImageBitmap (EXIF orientation respected). */
export async function loadBitmap(fileOrUrl) {
  if (typeof fileOrUrl === 'string') {
    const res = await fetch(fileOrUrl);
    return createImageBitmap(await res.blob(), { imageOrientation: 'from-image' });
  }
  return createImageBitmap(fileOrUrl, { imageOrientation: 'from-image' });
}
