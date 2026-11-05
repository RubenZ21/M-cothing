export const CATEGORIES = [
  { id: 'tops', label: 'Tops', one: 'top' },
  { id: 'blouses', label: 'Blouses', one: 'blouse' },
  { id: 'pants', label: 'Pants', one: 'pants' },
  { id: 'skirts', label: 'Skirts', one: 'skirt' },
  { id: 'dresses', label: 'Dresses', one: 'dress' },
  { id: 'jackets', label: 'Jackets', one: 'jacket' },
  { id: 'blazers', label: 'Blazers', one: 'blazer' },
  { id: 'cardigans', label: 'Cardigans', one: 'cardigan' },
  { id: 'kimonos', label: 'Kimonos & Open Vests', one: 'kimono' },
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
 * Old category, replaced by the ones above in 1.08. Pieces saved in it keep it
 * until she picks a new category; it is shown only while it still has pieces.
 */
export const LEGACY_CATEGORIES = [
  { id: 'accessories', label: 'Accessories', one: 'accessory', legacy: true }
];

/** Categories to show for a set of pieces: all current ones, plus old ones still in use. */
export function categoriesFor(items) {
  return [...CATEGORIES, ...LEGACY_CATEGORIES.filter((c) => items.some((i) => i.category === c.id))];
}

export const SEASONS = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' }
];

export const catById = (id) => CATEGORIES.find((c) => c.id === id) || LEGACY_CATEGORIES.find((c) => c.id === id);
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
  kimonos: { x: 0.5, y: 0.37, w: 0.6 },
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
