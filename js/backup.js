// Backup as a .zip: the pictures as normal image files in folders, plus data.json
// with everything else. Restore also reads the older .json backups (pictures inside).
import { zipSync, unzipSync, strToU8, strFromU8 } from '../vendor/fflate.js';
import { dataUrlToBlob } from './images.js';
import { VERSION } from './version.js';

const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const TYPE = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** "Rose blouse" -> safe file name part, keeping letters like č, ć, š, ž, đ. */
function safeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50) || 'picture';
}

export function backupFileName(date = new Date()) {
  const d = date.toISOString().slice(0, 10);
  return `wardrobe-backup-${d}.zip`;
}

/** Builds the backup zip as a File. */
export async function buildBackupZip(state) {
  const files = {};
  const used = new Set();
  // Adds one picture and returns its path inside the zip.
  const add = async (folder, name, id, blob) => {
    if (!blob) return null;
    const ext = EXT[blob.type] || 'webp';
    let path = `${folder}/${safeName(name)}.${ext}`;
    if (used.has(path.toLowerCase())) path = `${folder}/${safeName(name)} (${String(id).slice(0, 6)}).${ext}`;
    used.add(path.toLowerCase());
    files[path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]; // pictures are already compressed
    return path;
  };

  const items = [];
  for (const i of state.items) {
    items.push({ ...i, image: await add('clothes', i.name, i.id, i.image), thumb: await add('_thumbnails/clothes', i.name, i.id, i.thumb) });
  }
  const outfits = [];
  for (const o of state.outfits) {
    outfits.push({ ...o, thumb: await add('outfits', o.name, o.id, o.thumb) });
  }
  const wishes = [];
  for (const w of state.wishes) {
    wishes.push({ ...w, image: await add('wishlist', w.name, w.id, w.image), thumb: await add('_thumbnails/wishlist', w.name, w.id, w.thumb) });
  }
  let palette = null;
  if (state.palette) {
    const photos = [];
    for (const [k, p] of (state.palette.photos || []).entries()) {
      photos.push({ ...p, image: await add('palette', `Analysis photo ${k + 1}`, p.id, p.image), thumb: await add('_thumbnails/palette', `Analysis photo ${k + 1}`, p.id, p.thumb) });
    }
    palette = { ...state.palette, photos };
  }
  const data = { app: 'wardrobe', version: 2, appVersion: VERSION, exported: new Date().toISOString(), items, outfits, wishes, palette, categories: state.categories || null };
  files['data.json'] = [strToU8(JSON.stringify(data, null, 1)), { level: 6 }];
  files['README.txt'] = [strToU8(
    `Minja's Wardrobe backup (app version ${VERSION}, ${new Date().toLocaleString()})\r\n\r\n`
    + 'To restore: open the app, Settings > Restore from a backup, and choose this .zip file.\r\n'
    + 'The folders hold the pictures (clothes, outfits, wishlist, palette); data.json holds the rest.\r\n'
  ), { level: 6 }];

  const zipped = zipSync(files);
  return new File([zipped], backupFileName(), { type: 'application/zip' });
}

/** Reads a backup (.zip, or an older .json) into { items, outfits, wishes, palette } with Blobs. */
export async function readBackup(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (!isZip) return readJsonBackup(JSON.parse(strFromU8(bytes)));

  const files = unzipSync(bytes);
  const dataFile = files['data.json'] || Object.entries(files).find(([k]) => k.endsWith('/data.json'))?.[1];
  if (!dataFile) throw new Error('No data.json in this zip');
  const data = JSON.parse(strFromU8(dataFile));
  if (data.app !== 'wardrobe') throw new Error('Not a wardrobe backup');
  // Folder prefix, in case the zip was re-packed inside a folder.
  const prefix = files['data.json'] ? '' : Object.keys(files).find((k) => k.endsWith('/data.json')).slice(0, -'data.json'.length);
  const pic = (path) => {
    if (!path) return null;
    const raw = files[prefix + path];
    if (!raw) throw new Error(`Missing picture ${path}`);
    return new Blob([raw], { type: TYPE[path.split('.').pop().toLowerCase()] || 'image/webp' });
  };
  return {
    items: (data.items || []).map((i) => ({ ...i, image: pic(i.image), thumb: pic(i.thumb) })),
    outfits: (data.outfits || []).map((o) => ({ ...o, thumb: pic(o.thumb) })),
    wishes: (data.wishes || []).map((w) => ({ ...w, image: pic(w.image), thumb: pic(w.thumb) })),
    palette: data.palette ? { ...data.palette, photos: (data.palette.photos || []).map((p) => ({ ...p, image: pic(p.image), thumb: pic(p.thumb) })) } : null,
    categories: Array.isArray(data.categories) ? data.categories : null
  };
}

/** Older backups (up to 1.08): one .json file with the pictures inside as text. */
async function readJsonBackup(data) {
  if (data.app !== 'wardrobe' || !Array.isArray(data.items)) throw new Error('Not a wardrobe backup');
  const blob = (u) => (u ? dataUrlToBlob(u) : null);
  return {
    items: await Promise.all(data.items.map(async (i) => ({ ...i, image: await blob(i.image), thumb: await blob(i.thumb) }))),
    outfits: await Promise.all((data.outfits || []).map(async (o) => ({ ...o, thumb: await blob(o.thumb) }))),
    wishes: await Promise.all((data.wishes || []).map(async (w) => ({ ...w, image: await blob(w.image), thumb: await blob(w.thumb) })))
  };
}
