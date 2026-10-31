export const CATEGORIES = [
  { id: 'tops', label: 'Tops', one: 'top' },
  { id: 'pants', label: 'Pants', one: 'pants' },
  { id: 'skirts', label: 'Skirts', one: 'skirt' },
  { id: 'dresses', label: 'Dresses', one: 'dress' },
  { id: 'jackets', label: 'Jackets', one: 'jacket' },
  { id: 'shoes', label: 'Shoes', one: 'shoes' },
  { id: 'hats', label: 'Hats', one: 'hat' },
  { id: 'bags', label: 'Bags', one: 'bag' },
  { id: 'accessories', label: 'Accessories', one: 'accessory' }
];

export const SEASONS = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' }
];

export const catById = (id) => CATEGORIES.find((c) => c.id === id);
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
  jackets: { x: 0.5, y: 0.35, w: 0.58 },
  dresses: { x: 0.5, y: 0.45, w: 0.5 },
  pants: { x: 0.5, y: 0.64, w: 0.42 },
  skirts: { x: 0.5, y: 0.6, w: 0.44 },
  shoes: { x: 0.5, y: 0.88, w: 0.26 },
  bags: { x: 0.8, y: 0.56, w: 0.28 },
  accessories: { x: 0.22, y: 0.3, w: 0.22 }
};
