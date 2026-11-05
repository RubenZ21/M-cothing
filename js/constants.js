/** The categories the app starts with. She can rename, add, remove and reorder them (Edit categories). */
export const DEFAULT_CATEGORIES = [
  { id: 'tops', label: 'Tops', one: 'top' },
  { id: 'blouses', label: 'Blouses', one: 'blouse' },
  { id: 'pants', label: 'Pants', one: 'pants' },
  { id: 'skirts', label: 'Skirts', one: 'skirt' },
  { id: 'dresses', label: 'Dresses', one: 'dress' },
  { id: 'jackets', label: 'Jackets', one: 'jacket' },
  { id: 'blazers', label: 'Blazers', one: 'blazer' },
  { id: 'cardigans', label: 'Cardigans', one: 'cardigan' },
  { id: 'openfront', label: 'Open-front Cardigans', one: 'open-front cardigan' },
  { id: 'kimonos', label: 'Kimonos', one: 'kimono' },
  { id: 'vests', label: 'Open Vests', one: 'open vest' },
  { id: 'shoes', label: 'Shoes', one: 'shoes' },
  { id: 'hats', label: 'Hats', one: 'hat' },
  { id: 'bags', label: 'Bags', one: 'bag' },
  { id: 'scarves', label: 'Scarves', one: 'scarf' },
  { id: 'belts', label: 'Belts', one: 'belt' },
  { id: 'gloves', label: 'Gloves', one: 'gloves' },
  { id: 'jewellery', label: 'Jewellery', one: 'jewellery' },
  { id: 'watches', label: 'Watches', one: 'watch' },
  { id: 'brooches', label: 'Brooches', one: 'brooch' },
  { id: 'eyewear', label: 'Eyewear', one: 'eyewear' }
];

/**
 * The categories in use: her own list once she has edited it, else the defaults.
 * Changed in place (setCategories) so every module that imported it sees the change.
 */
export const CATEGORIES = DEFAULT_CATEGORIES.map((c) => ({ ...c }));

export function setCategories(list) {
  const clean = (list || []).filter((c) => c && c.id && c.label);
  CATEGORIES.splice(0, CATEGORIES.length, ...(clean.length ? clean : DEFAULT_CATEGORIES).map((c) => ({ ...c })));
}

/** "Jumpsuits" -> "jumpsuit", "Dresses" -> "dress": the word used in automatic names. */
export function singular(label) {
  const w = String(label).trim().toLowerCase();
  if (/sses$/.test(w)) return w.slice(0, -2);
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/[^s]s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

/**
 * Old category, replaced by the ones above in 1.08. Pieces saved in it keep it
 * until she picks a new category; it is shown only while it still has pieces.
 */
export const LEGACY_CATEGORIES = [
  { id: 'accessories', label: 'Accessories', one: 'accessory', legacy: true }
];

/** A category id that isn't in the list (e.g. from a backup of another phone). */
function unknownCategory(id) {
  const label = String(id || 'Other').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return { id, label, one: singular(label), legacy: true };
}

/** Categories to show for a set of pieces: all current ones, plus old/unknown ones still in use. */
export function categoriesFor(items) {
  const extra = [];
  for (const i of items) {
    if (!i.category || CATEGORIES.some((c) => c.id === i.category) || extra.some((c) => c.id === i.category)) continue;
    extra.push(catById(i.category));
  }
  return [...CATEGORIES, ...extra];
}

export const SEASONS = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' }
];

export const catById = (id) => (id ? CATEGORIES.find((c) => c.id === id) || LEGACY_CATEGORIES.find((c) => c.id === id) || unknownCategory(id) : undefined);
export const seasonById = (id) => SEASONS.find((s) => s.id === id);

/** Northern-hemisphere season for today. */
export function currentSeason(date = new Date()) {
  const m = date.getMonth(); // 0 = January
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

/** Seasons ordered starting from the current one. */
export function seasonsFromNow() {
  const i = SEASONS.findIndex((s) => s.id === currentSeason());
  return [...SEASONS.slice(i), ...SEASONS.slice(0, i)];
}

/** Where a piece lands on the outfit board when added (fractions of the board). */
export const PLACEMENT = {
  hats: { x: 0.5, y: 0.13, w: 0.34 },
  tops: { x: 0.5, y: 0.33, w: 0.52 },
  blouses: { x: 0.5, y: 0.33, w: 0.52 },
  jackets: { x: 0.5, y: 0.35, w: 0.58 },
  blazers: { x: 0.5, y: 0.35, w: 0.58 },
  cardigans: { x: 0.5, y: 0.35, w: 0.58 },
  openfront: { x: 0.5, y: 0.36, w: 0.6 },
  kimonos: { x: 0.5, y: 0.37, w: 0.6 },
  vests: { x: 0.5, y: 0.36, w: 0.56 },
  dresses: { x: 0.5, y: 0.45, w: 0.5 },
  pants: { x: 0.5, y: 0.64, w: 0.42 },
  skirts: { x: 0.5, y: 0.6, w: 0.44 },
  shoes: { x: 0.5, y: 0.88, w: 0.26 },
  bags: { x: 0.8, y: 0.56, w: 0.28 },
  scarves: { x: 0.5, y: 0.24, w: 0.34 },
  belts: { x: 0.5, y: 0.5, w: 0.4 },
  gloves: { x: 0.18, y: 0.56, w: 0.18 },
  jewellery: { x: 0.24, y: 0.24, w: 0.16 },
  watches: { x: 0.2, y: 0.48, w: 0.13 },
  brooches: { x: 0.38, y: 0.3, w: 0.1 },
  eyewear: { x: 0.5, y: 0.08, w: 0.26 },
  accessories: { x: 0.22, y: 0.3, w: 0.22 }
};

/** Scrolls a horizontal chip row so its selected chip is in view (centred). */
export function revealSelected(row, smooth = false, selector = '[aria-pressed=true], [aria-selected=true]') {
  const on = row?.querySelector(selector);
  if (!on) return;
  const r = row.getBoundingClientRect(), c = on.getBoundingClientRect();
  const left = row.scrollLeft + (c.left + c.width / 2) - (r.left + r.width / 2);
  row.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
}
