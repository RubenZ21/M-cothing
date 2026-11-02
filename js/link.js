// Links for the wishlist: reading one from a screenshot's metadata, from
// pasted/shared text, and making it safe to open.

// Namespace URLs that appear inside image metadata but are not web pages.
const IGNORE_HOSTS = /(^|\.)(adobe\.com|w3\.org|purl\.org|iptc\.org|apple\.com|cipa\.jp|exif\.org|xmp\.org|aiim\.org|npes\.org|microsoft\.com|ns\.google\.com|schemas\.android\.com)$/i;
const URL_RE = /https?:\/\/[^\s"'<>\\^`{|}\x00-\x1f\x7f]+/gi;

/** Returns a cleaned http(s) URL, or '' when the text isn't a usable link. */
export function normalizeUrl(text) {
  let s = String(text || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) {
    if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) s = `https://${s}`;
    else return '';
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.href;
  } catch {
    return '';
  }
}

/** First web link found in a piece of text (e.g. "Nice dress https://shop.com/x"). */
export function findUrl(text) {
  for (const m of String(text || '').matchAll(URL_RE)) {
    const url = normalizeUrl(m[0].replace(/[.,;:!?)\]]+$/, ''));
    if (url && !IGNORE_HOSTS.test(new URL(url).hostname)) return url;
  }
  return normalizeUrl(text);
}

/** "www.zara.com" -> "zara.com" */
export function siteName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes);
const utf8 = (bytes) => new TextDecoder('utf-8').decode(bytes);

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return '';
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return utf8(new Uint8Array(await new Response(stream).arrayBuffer()));
  } catch {
    return '';
  }
}

/** Text stored in PNG tEXt / zTXt / iTXt chunks. */
async function pngText(buf) {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const out = [];
  let p = 8;
  while (p + 12 <= bytes.length) {
    const len = v.getUint32(p);
    const type = latin1(bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, p + 8 + len);
    if (type === 'IDAT' || type === 'IEND') break;
    const nul = data.indexOf(0);
    if (type === 'tEXt') out.push(latin1(data.subarray(nul + 1)));
    else if (type === 'zTXt') out.push(await inflate(data.subarray(nul + 2)));
    else if (type === 'iTXt') {
      const compressed = data[nul + 1] === 1;
      let q = nul + 3;
      q = data.indexOf(0, q) + 1; // language tag
      q = data.indexOf(0, q) + 1; // translated keyword
      const rest = data.subarray(q);
      out.push(compressed ? await inflate(rest) : utf8(rest));
    }
    p += 12 + len;
  }
  return out.join('\n');
}

/**
 * Samsung phones append a block after the image data ("SEF" trailer) with an
 * entry "Captured_App_Info": base64 JSON like
 * {"comp":"com.sec.android.app.sbrowser/...","capurl":"https://..."}.
 * The gallery's "go to source" button uses this link.
 * Returns null when the block is missing, else the decoded data ({} if unreadable).
 */
async function samsungCaptureInfo(file) {
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 128 * 1024)).arrayBuffer());
  const text = latin1(tail);
  const at = text.lastIndexOf('Captured_App_Info');
  if (at < 0) return null;
  const b64 = (text.slice(at + 'Captured_App_Info'.length).match(/^[A-Za-z0-9+/=]+/) || [''])[0];
  // The base64 runs straight into the next marker ("SEFH…"), so trim until it decodes.
  for (let cut = 0; cut <= 12 && cut < b64.length; cut++) {
    const s = b64.slice(0, b64.length - cut);
    if (s.length % 4) continue;
    try {
      const json = utf8(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
      const data = JSON.parse(json);
      const url = normalizeUrl(data.capurl || data.url || '') || findUrl(json);
      return { ...data, url };
    } catch { /* try a shorter slice */ }
  }
  return {};
}

/**
 * Everything the app can tell about a picture's origin, for filling in the link
 * and for explaining why none was found.
 */
export async function inspectImage(file) {
  const info = { name: file.name || '', type: file.type || '', size: file.size, url: '', samsung: null };
  try {
    info.samsung = await samsungCaptureInfo(file);
    if (info.samsung?.url) { info.url = info.samsung.url; return info; }
  } catch (err) {
    console.warn('Could not read Samsung screenshot info', err);
  }
  info.url = await otherMetadataUrl(file);
  return info;
}

/** Just the link (or ''). */
export async function urlFromImageMetadata(file) {
  return (await inspectImage(file)).url;
}

/** A link in PNG text chunks, EXIF or XMP. */
async function otherMetadataUrl(file) {
  try {
    const buf = await file.slice(0, 4 * 1024 * 1024).arrayBuffer();
    const head = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    // Metadata sits at the start of JPEG/WebP/HEIC files.
    const text = isPng ? await pngText(buf) : latin1(new Uint8Array(buf, 0, Math.min(buf.byteLength, 256 * 1024)));
    for (const m of text.matchAll(URL_RE)) {
      const url = normalizeUrl(m[0].replace(/[.,;:!?)\]]+$/, ''));
      if (!url) continue;
      const host = new URL(url).hostname;
      if (IGNORE_HOSTS.test(host) || /^ns\./.test(host)) continue;
      return url;
    }
  } catch (err) {
    console.warn('Could not read image metadata', err);
  }
  return '';
}
