// Project model + save/load. Media files are never embedded in the project
// file (they stay on the user's computer); on load, staff re-select them and
// they are matched back by file name.

export const PROJECT_VERSION = 1;

let seq = 0;
export const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export function defaultSettings() {
  return {
    brandTag: true,
    transition: 'none', // none | fade | slide
    imageZoom: true,
    endCard: false,
    endCardDisclaimer: false,
    music: null, // { name, size, volume }
  };
}

export function newClip(file, kind) {
  return {
    id: newId(),
    kind, // 'video' | 'image'
    name: file.name,
    size: file.size,
    duration: kind === 'image' ? 0 : 0,
    width: 0,
    height: 0,
    hasAudio: null,
    trimStart: 0,
    trimEnd: 0,
    imageDuration: 3,
    headline: '',
    subtitle: '',
    pill: '',
    textPos: 'bottom', // top | middle | bottom
    disclaimer: false,
    muted: false,
    zoom: true,
  };
}

const CLIP_KEYS = Object.keys(newClip({ name: '', size: 0 }, 'video'));

export function serializeProject(project) {
  return JSON.stringify(
    {
      app: 'haipals-video-studio',
      version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      settings: project.settings,
      clips: project.clips.map((c) => Object.fromEntries(CLIP_KEYS.map((k) => [k, c[k]]))),
    },
    null,
    2,
  );
}

export function parseProject(text) {
  const data = JSON.parse(text);
  if (!data || data.app !== 'haipals-video-studio' || !Array.isArray(data.clips)) {
    throw new Error('File này không phải dự án Haipals Video Studio.');
  }
  const base = newClip({ name: '', size: 0 }, 'video');
  return {
    settings: { ...defaultSettings(), ...(data.settings || {}) },
    clips: data.clips.map((c) => ({ ...base, ...c, id: c.id || newId() })),
  };
}

export function isVideoFile(f) {
  return /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
}
export function isImageFile(f) {
  return /^image\/(jpeg|png|webp|gif|bmp)/.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);
}
export function isAudioFile(f) {
  return /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name);
}

export function formatTime(sec) {
  sec = Math.max(0, +sec || 0);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
