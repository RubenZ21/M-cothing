// Background removal on the phone itself (no upload). The model is downloaded
// once from IMG.LY's CDN on first use and then cached by the browser.

const MODEL_KEY = 'wardrobe.bgModel';
export const MODELS = {
  isnet_quint8: { label: 'Fast', size: 'about 40 MB' },
  isnet_fp16: { label: 'Best quality', size: 'about 80 MB' }
};

export function getModel() {
  try {
    const m = localStorage.getItem(MODEL_KEY);
    if (m && MODELS[m]) return m;
  } catch { /* storage unavailable */ }
  return 'isnet_fp16'; // the quantized 'Fast' model erases too much of the clothes too often
}

export function setModel(m) {
  try { localStorage.setItem(MODEL_KEY, m); } catch { /* ignore */ }
}

let lib;
async function load() {
  if (!lib) lib = import('../vendor/bg-removal.js').catch((e) => { lib = null; throw e; });
  return lib;
}

function config(onProgress) {
  const parts = new Map(); // one entry per downloaded file
  return {
    model: getModel(),
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      if (!onProgress || !String(key).startsWith('fetch:') || !total) return;
      parts.set(key, [current, total]);
      let c = 0, t = 0;
      for (const [a, b] of parts.values()) { c += a; t += b; }
      onProgress(c / t);
    }
  };
}

/** Returns a PNG blob of the same size as the input, with the background transparent. */
export async function removeBackground(blob, onProgress) {
  const { removeBackground: run } = await load();
  return run(blob, config(onProgress));
}

export async function preloadModel(onProgress) {
  const { preload } = await load();
  return preload(config(onProgress));
}
