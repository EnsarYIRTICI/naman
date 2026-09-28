/**
 * Döküman yazdırma düzeni: yazı boyutu / sütun sayısı seçimi ve A4 sayfa sayısı tahmini.
 * Tahmin, yazdırılacak öğenin ekranda (görünmez) A4 genişliğinde ölçülmesiyle yapılır; tarayıcının sayfa bölme
 * kuralları (bölüm bölünmesin, sığmıyorsa yeni sayfa) burada taklit edilir. Sonuç yaklaşıktır (±1 sayfa).
 */

export type FitPages = 2 | 3 | 4;
export interface PrintSettings {
  /** fit: hedef sayfa sayısına sığan en büyük yazı; custom: elle yazı boyutu + sütun */
  mode: "fit" | "custom";
  pages: FitPages;
  font: number; // pt (custom)
  cols: 2 | 3 | 4; // uzun listelerin sütun sayısı (custom)
  info: boolean; // yemek kartı / kanal / açıklama kutuları
  breakGroups: boolean; // her bölüm yeni sayfadan
  stripPrefix: boolean; // ad başındaki "MNV." / "MN." önekini yazdırma (yer kazandırır)
}
export const DEFAULT_SETTINGS: PrintSettings = { mode: "fit", pages: 3, font: 9, cols: 3, info: true, breakGroups: false, stripPrefix: false };

export const FONT_MIN = 6;
export const FONT_MAX = 14;
export const FONTS: number[] = Array.from({ length: (FONT_MAX - FONT_MIN) * 2 + 1 }, (_, i) => FONT_MIN + i / 2);

/** A4 (210×297 mm), 10 mm kenar boşluğu → içerik 190×277 mm. CSS'te 1 mm = 96/25.4 px. */
export const MM = 96 / 25.4;
export const PAGE_W_MM = 190;
export const PAGE_H_PX = 277 * MM;

export interface Block {
  /** Bloğun alt boşluğu dahil yüksekliği (px) */
  h: number;
  /** Bu blok yeni sayfadan başlasın */
  breakBefore: boolean;
  /** Blok bölünmesin (sığmıyorsa bir sonraki sayfaya geçsin) */
  avoid: boolean;
}

/** Blokları sayfalara yerleştirip sayfa sayısını döndürür. */
export function simulatePages(blocks: Block[], pageH: number): number {
  let pages = 1;
  let used = 0;
  for (const b of blocks) {
    if (b.h <= 0) continue;
    if (b.breakBefore && used > 0) {
      pages++;
      used = 0;
    }
    if (used + b.h <= pageH) {
      used += b.h;
    } else if (b.avoid && b.h <= pageH && used > 0) {
      pages++;
      used = b.h;
    } else {
      // Bölünür: kalan yeri doldurup sonraki sayfalara taşar
      let rest = b.h - (pageH - used);
      pages++;
      while (rest > pageH) {
        rest -= pageH;
        pages++;
      }
      used = rest;
    }
  }
  return pages;
}

export interface Layout {
  font: number;
  cols: 2 | 3 | 4;
  pages: number;
}

/**
 * Hedef sayfa sayısına sığan en büyük yazı boyutunu bulur. measure(font, cols) → sayfa sayısı.
 * Her sütun sayısı için yazı boyutu ikili aramayla bulunur (yazı büyüdükçe sayfa artar); en büyük yazıyı veren
 * düzen seçilir, eşitlikte 3 → 2 → 4 sütun tercih edilir. En küçük yazıda da sığmıyorsa en az sayfalı düzen döner.
 */
export function fitToPages(target: number, measure: (font: number, cols: 2 | 3 | 4) => number): Layout & { fits: boolean } {
  let best: Layout | null = null;
  let fallback: Layout | null = null;
  for (const cols of [3, 2, 4] as const) {
    let lo = 0;
    let hi = FONTS.length - 1;
    let found = -1;
    let foundPages = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const pages = measure(FONTS[mid]!, cols);
      if (pages <= target) {
        found = mid;
        foundPages = pages;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found >= 0) {
      if (!best || FONTS[found]! > best.font) best = { font: FONTS[found]!, cols, pages: foundPages };
    } else {
      const pages = measure(FONT_MIN, cols);
      if (!fallback || pages < fallback.pages) fallback = { font: FONT_MIN, cols, pages };
    }
  }
  return best ? { ...best, fits: true } : { ...fallback!, fits: false };
}

/** "MNV.BIBER KG" → "BIBER KG", "MN. PATLICAN MOR KG" → "PATLICAN MOR KG" */
export const stripName = (name: string) => name.replace(/^\s*MNV?\s*\.\s*/i, "") || name;

export const shortCols = (cols: number) => (cols >= 4 ? 3 : 2);
export const fmtPt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export function loadSettings(raw: string | null): PrintSettings {
  try {
    const s = raw ? (JSON.parse(raw) as Partial<PrintSettings>) : {};
    const out = { ...DEFAULT_SETTINGS, ...s };
    if (!["fit", "custom"].includes(out.mode)) out.mode = DEFAULT_SETTINGS.mode;
    if (![2, 3, 4].includes(out.pages)) out.pages = DEFAULT_SETTINGS.pages;
    if (![2, 3, 4].includes(out.cols)) out.cols = DEFAULT_SETTINGS.cols;
    if (!FONTS.includes(out.font)) out.font = DEFAULT_SETTINGS.font;
    out.info = out.info !== false;
    out.breakGroups = out.breakGroups === true;
    out.stripPrefix = out.stripPrefix === true;
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
