// Image helpers: loading, resizing, trimming, colour detection, encoding.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Decode an image file (EXIF orientation applied by the browser) into a canvas no larger than `max`. */
export async function fileToCanvas(file, max = 1600) {
  const img = await blobToImage(file);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = makeCanvas(img.naturalWidth * s, img.naturalHeight * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Decoded images keep their pixels after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function blobToCanvas(blob, w, h) {
  const img = await blobToImage(blob);
  const c = makeCanvas(w ?? img.naturalWidth, h ?? img.naturalHeight);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function fitCanvas(src, max) {
  const s = Math.min(1, max / Math.max(src.width, src.height));
  if (s === 1) return src;
  const c = makeCanvas(src.width * s, src.height * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Crop away fully transparent borders, keeping `pad` px around the piece. */
export function trimAlpha(src, pad = 6) {
  const { width: w, height: h } = src;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return src; // nothing visible: keep as is
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const c = makeCanvas(maxX - minX + 1, maxY - minY + 1);
  c.getContext('2d').drawImage(src, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), type, quality);
  });
}

/** WebP keeps transparency and is small; browsers that can't encode it fall back to PNG. */
export async function encodeTransparent(canvas) {
  const b = await canvasToBlob(canvas, 'image/webp', 0.9);
  return b.type === 'image/webp' ? b : canvasToBlob(canvas, 'image/png');
}

/** True when a real part of the picture is see-through (e.g. already cut out in the Gallery). */
export function hasTransparency(src) {
  const small = fitCanvas(src, 96);
  const { data } = small.getContext('2d').getImageData(0, 0, small.width, small.height);
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) clear++;
  const share = clear / (data.length / 4);
  return share > 0.03 && share < 0.97;
}

/**
 * Main colour of a picture of one item. Cut-outs: the visible pixels. Screenshots
 * and photos with a background: the middle part, so the page or wall around the
 * item doesn't count.
 */
export function pieceColour(src) {
  if (hasTransparency(src)) return dominantColor(src);
  const w = src.width * 0.5, h = src.height * 0.5;
  const c = makeCanvas(w, h);
  c.getContext('2d').drawImage(src, src.width * 0.25, src.height * 0.25, w, h, 0, 0, c.width, c.height);
  return dominantColor(c);
}

/** Most common colour of the visible pixels. */
export function dominantColor(src) {
  const small = fitCanvas(src, 72);
  const { data } = small.getContext('2d').getImageData(0, 0, small.width, small.height);
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const key = (data[i] >> 5) * 64 + (data[i + 1] >> 5) * 8 + (data[i + 2] >> 5);
    const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
    bins.set(key, b);
  }
  let best = null;
  for (const b of bins.values()) if (!best || b.n > best.n) best = b;
  if (!best) return '#cccccc';
  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, '0');
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

const NAMED = [
  ['Black', '#1f1f1f'], ['Charcoal', '#46464a'], ['Grey', '#8e8e90'], ['Light grey', '#c9c9c9'], ['White', '#f6f6f3'],
  ['Cream', '#efe6d2'], ['Beige', '#d8c3a5'], ['Camel', '#b88a5a'], ['Brown', '#6e4a32'], ['Chocolate', '#3f2a1f'],
  ['Navy', '#1f2a48'], ['Blue', '#3461a8'], ['Denim', '#5a7598'], ['Light blue', '#a8c4e0'], ['Teal', '#2e7d7a'],
  ['Green', '#3f7a45'], ['Sage', '#a9b8a0'], ['Olive', '#6f7240'], ['Khaki', '#b7ac7c'], ['Pistachio', '#93c572'],
  ['Yellow', '#e9c93f'], ['Mustard', '#c99a2e'], ['Orange', '#e07b39'], ['Rust', '#a4502c'], ['Red', '#c0392b'],
  ['Burgundy', '#6e2338'], ['Pink', '#f0a6b8'], ['Rose', '#d29b98'], ['Coral', '#ee7f6d'], ['Purple', '#6b3f86'],
  ['Lilac', '#c3a6d4'], ['Gold', '#c8a24b'], ['Silver', '#b8bcc2']
];

export function colorName(hex) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = p(hex);
  let best = NAMED[0][0], bestD = Infinity;
  for (const [name, h] of NAMED) {
    const [r2, g2, b2] = p(h);
    const rm = (r + r2) / 2;
    const d = (2 + rm / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - rm) / 256) * (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}
