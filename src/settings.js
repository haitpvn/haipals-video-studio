// "Cài đặt chung" panel: project-wide options (brand, end card + logo,
// transitions, background music).

import { isAudioFile } from './state.js';

const LOGO_KEY = 'haipals.logo.v1';

/** Downscale an uploaded logo and keep it as a PNG data URL in localStorage. */
async function storeLogo(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  let url = c.toDataURL('image/png');
  if (url.length > 3_500_000) url = c.toDataURL('image/jpeg', 0.9);
  localStorage.setItem(LOGO_KEY, url);
  return url;
}

async function bitmapFromDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob);
}

export function initSettings({ root, project, onChange, toast, getMusic, setMusic, setLogo, selectEndCard }) {
  root.innerHTML = `
    <h2><span class="step">3</span> Cài đặt chung</h2>
    <fieldset>
      <legend>🏷️ Thương hiệu</legend>
      <label class="check"><input type="checkbox" id="setBrandTag" /> Hiện nhãn “Haipals Đi Đâu” góc trên</label>
    </fieldset>

    <fieldset>
      <legend>🏁 Màn hình kết thúc</legend>
      <label class="check"><input type="checkbox" id="setEndCard" /> Thêm màn hình kết thúc (3 giây)</label>
      <label class="check"><input type="checkbox" id="setEndDisclaimer" /> Hiện câu lưu ý visa ở màn hình kết thúc</label>
      <div class="logo-row">
        <div class="logo-preview" id="logoPreview">Chưa có logo</div>
        <div class="logo-actions">
          <label class="btn btn-small">Tải logo / banner lên<input type="file" id="logoInput" accept="image/*" hidden /></label>
          <button class="btn btn-small" id="btnLogoRemove" type="button">Xoá logo</button>
          <button class="btn btn-small" id="btnEndPreview" type="button">Xem màn hình kết thúc</button>
        </div>
      </div>
      <p class="hint">Logo được lưu trong trình duyệt này, chỉ cần tải lên một lần.</p>
    </fieldset>

    <fieldset>
      <legend>✨ Hiệu ứng</legend>
      <div class="seg" role="radiogroup" aria-label="Chuyển cảnh">
        <span>Chuyển cảnh:</span>
        <label><input type="radio" name="setTransition" value="none" /> Không</label>
        <label><input type="radio" name="setTransition" value="fade" /> Mờ dần</label>
        <label><input type="radio" name="setTransition" value="slide" /> Trượt</label>
      </div>
      <label class="check"><input type="checkbox" id="setZoom" /> Zoom nhẹ cho ảnh tĩnh</label>
    </fieldset>

    <fieldset>
      <legend>🎵 Nhạc nền</legend>
      <p class="hint" id="musicName">Chưa có nhạc nền.</p>
      <div class="row">
        <label class="btn btn-small">Chọn nhạc (MP3, M4A, WAV)<input type="file" id="musicInput" accept="audio/*,.mp3,.m4a,.wav,.aac" hidden /></label>
        <button class="btn btn-small" id="btnMusicRemove" type="button">Bỏ nhạc</button>
      </div>
      <label id="volRow">Âm lượng nhạc: <span id="volLabel"></span><input type="range" id="setVolume" min="0" max="100" step="5" /></label>
      <audio id="musicPreview" controls hidden></audio>
      <p class="hint">Tiếng gốc của clip vẫn giữ. Muốn tắt tiếng clip nào thì tích “Tắt tiếng clip này”.</p>
    </fieldset>`;

  const q = (id) => root.querySelector(`#${id}`);
  const s = () => project.settings;
  let musicUrl = null;

  q('setBrandTag').addEventListener('change', () => {
    s().brandTag = q('setBrandTag').checked;
    onChange();
  });
  q('setEndCard').addEventListener('change', () => {
    s().endCard = q('setEndCard').checked;
    onChange();
    if (s().endCard) selectEndCard();
  });
  q('setEndDisclaimer').addEventListener('change', () => {
    s().endCardDisclaimer = q('setEndDisclaimer').checked;
    onChange();
  });
  q('btnEndPreview').addEventListener('click', () => {
    if (!s().endCard) {
      s().endCard = true;
      q('setEndCard').checked = true;
      onChange();
    }
    selectEndCard();
  });
  root.querySelectorAll('input[name=setTransition]').forEach((r) =>
    r.addEventListener('change', () => {
      s().transition = r.value;
      onChange();
    }),
  );
  q('setZoom').addEventListener('change', () => {
    s().imageZoom = q('setZoom').checked;
    onChange();
  });

  // Logo
  const showLogo = (url) => {
    q('logoPreview').innerHTML = url ? `<img src="${url}" alt="Logo">` : 'Chưa có logo';
    q('btnLogoRemove').disabled = !url;
  };
  q('logoInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const url = await storeLogo(f);
      showLogo(url);
      setLogo(await bitmapFromDataUrl(url));
      toast('Đã lưu logo. Lần sau mở lại vẫn còn.', 'ok');
      if (!s().endCard) {
        s().endCard = true;
        onChange();
      }
      refresh();
      selectEndCard();
    } catch (err) {
      console.error(err);
      toast('Không lưu được logo. Hãy thử ảnh PNG/JPG nhỏ hơn.', 'error');
    }
  });
  q('btnLogoRemove').addEventListener('click', () => {
    try {
      localStorage.removeItem(LOGO_KEY);
    } catch {
      /* ignore */
    }
    showLogo(null);
    setLogo(null);
  });
  let saved = null;
  try {
    saved = localStorage.getItem(LOGO_KEY);
  } catch {
    /* storage blocked */
  }
  showLogo(saved);
  if (saved) bitmapFromDataUrl(saved).then(setLogo).catch(() => {});

  // Music
  q('musicInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!isAudioFile(f)) return toast('Hãy chọn file nhạc (MP3, M4A, WAV).', 'warn');
    setMusic(f);
  });
  q('btnMusicRemove').addEventListener('click', () => setMusic(null));
  q('setVolume').addEventListener('input', () => {
    if (!s().music) return;
    s().music.volume = +q('setVolume').value;
    q('volLabel').textContent = `${s().music.volume}%`;
    q('musicPreview').volume = s().music.volume / 100;
  });

  function refresh() {
    const st = s();
    q('setBrandTag').checked = st.brandTag !== false;
    q('setEndCard').checked = !!st.endCard;
    q('setEndDisclaimer').checked = !!st.endCardDisclaimer;
    root.querySelectorAll('input[name=setTransition]').forEach((r) => (r.checked = r.value === (st.transition || 'none')));
    q('setZoom').checked = !!st.imageZoom;

    const mf = getMusic();
    const m = st.music;
    q('musicName').textContent = !m
      ? 'Chưa có nhạc nền.'
      : mf
        ? `🎵 ${m.name}`
        : `⚠️ Thiếu file nhạc “${m.name}” — hãy chọn lại.`;
    q('btnMusicRemove').disabled = !m;
    q('volRow').hidden = !m;
    q('setVolume').value = m?.volume ?? 30;
    q('volLabel').textContent = `${m?.volume ?? 30}%`;
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    musicUrl = mf ? URL.createObjectURL(mf) : null;
    q('musicPreview').hidden = !musicUrl;
    if (musicUrl) {
      q('musicPreview').src = musicUrl;
      q('musicPreview').volume = (m?.volume ?? 30) / 100;
    } else q('musicPreview').removeAttribute('src');
  }
  refresh();
  return { refresh };
}
