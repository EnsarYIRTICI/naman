/**
 * Döküman yazdırma düzeni (v1 PDF tarzı): A4 sayfalar, sütunlar halinde akan tablolar, her ürün bir satır.
 * Kullanıcı sayfa sayısı değil TARZ ve YAZI BOYUTU seçer; sayfa sayısı içeriğe göre ne çıkarsa odur.
 * Sayfalama tarayıcıya bırakılmaz: satır yükseklikleri ölçülür ve sayfalar burada kurulur (paginate). Böylece
 * bölümler sütun sonunda düzgün bölünür, devam eden bölümün başlığı tekrarlanır ("Sebze (devam)"),
 * alt başlık sütun dibinde yalnız kalmaz, her sayfada başlık ve sayfa numarası olur.
 */

import { getCategory, getUnit, type Cat, type Unit } from "./text";

export type PrintStyle = "land2" | "port2" | "land3";
export type PrintSize = "s" | "m" | "l";

export interface PrintSettings {
  style: PrintStyle;
  size: PrintSize;
  info: boolean; // yemek kartı / kanal / "kod nasıl girilir" kutusu (ilk sütunda)
  stripPrefix: boolean; // ad başındaki "MNV." / "MN." önekini yazdırma
  /** Dökümana alınmayacak kategoriler (Sebze, Meyve, Kasap, Şarküteri, Diğer) */
  hideCats: Cat[];
  /** Dökümana alınmayacak satış birimleri (kg'lık / adetli) */
  hideUnits: Unit[];
}
export const DEFAULT_SETTINGS: PrintSettings = {
  style: "land2", size: "m", info: true, stripPrefix: false, hideCats: [], hideUnits: [],
};

export const CAT_LABEL: Record<Cat, string> = {
  sebze: "Sebze", meyve: "Meyve", kasap: "Kasap", sarkuteri: "Şarküteri", diger: "Diğer",
};
export const UNIT_LABEL: Record<Unit, string> = { kg: "Kilogramlık (KG)", adet: "Adetli / paketli" };

/** Yazdırma ayarındaki içerik filtresi (kategori + birim) bu ürünü dökümana alıyor mu */
export function keepProduct(p: { name: string; group: string }, s: Pick<PrintSettings, "hideCats" | "hideUnits">): boolean {
  if (s.hideCats.length && s.hideCats.includes(getCategory(p.group))) return false;
  if (s.hideUnits.length && s.hideUnits.includes(getUnit(p.name))) return false;
  return true;
}

/** Filtre açıksa sayfa başlığına eklenecek kısa not: "Kasap, Şarküteri hariç · adetliler hariç" */
export function filterNote(s: Pick<PrintSettings, "hideCats" | "hideUnits">): string {
  const parts: string[] = [];
  if (s.hideCats.length) parts.push(s.hideCats.map((c) => CAT_LABEL[c]).join(", ") + " hariç");
  if (s.hideUnits.includes("adet")) parts.push("adetliler hariç");
  if (s.hideUnits.includes("kg")) parts.push("KG'lıklar hariç");
  return parts.join(" · ");
}

export interface StyleCfg {
  label: string;
  desc: string;
  orient: "landscape" | "portrait";
  cols: number;
  /** Yazı boyutu (pt): küçük / normal / büyük */
  font: Record<PrintSize, number>;
}
export const STYLES: Record<PrintStyle, StyleCfg> = {
  land2: { label: "Yatay · 2 sütun", desc: "Eski v1 düzeni. Rahat okunur, satırlar geniş.", orient: "landscape", cols: 2, font: { s: 7.5, m: 8.5, l: 10 } },
  port2: { label: "Dikey · 2 sütun", desc: "Dikey kağıt, iki tablo yan yana.", orient: "portrait", cols: 2, font: { s: 7, m: 8, l: 9 } },
  land3: { label: "Yatay · 3 sütun", desc: "Daha sık; daha az sayfa, yazı biraz küçük.", orient: "landscape", cols: 3, font: { s: 6.5, m: 7.5, l: 8.5 } },
};
export const SIZE_LABEL: Record<PrintSize, string> = { s: "Küçük", m: "Normal", l: "Büyük" };

// ── Sayfalama ──

export type FlowItem = { kind: "row"; h: number; ref: number } | { kind: "sub"; h: number; ref: number };
export interface FlowSection {
  items: FlowItem[];
}
export type Block =
  | { kind: "info" }
  | { kind: "section"; sec: number; cont: boolean; items: FlowItem[] };
export interface Page {
  columns: Block[][];
}
export interface Dims {
  cols: number;
  /** Bir sütunun kullanılabilir yüksekliği (px) */
  colH: number;
  /** Bölüm başlık çubuğunun yüksekliği (px) */
  headH: number;
  /** Bölümler arası boşluk (px) */
  gap: number;
  /** İlk sütundaki bilgi kutusunun yüksekliği (yoksa 0 / null) */
  infoH: number | null;
}

/** Bölüm başında en az bu kadar satır aynı sütunda olmalı (yoksa bölüm sonraki sütundan başlar). */
const MIN_ROWS = 3;

export function paginate(sections: FlowSection[], d: Dims): Page[] {
  const pages: Page[] = [];
  let col = -1;
  let used = 0;
  const cur = () => pages[pages.length - 1]!.columns[col]!;
  const nextCol = () => {
    col++;
    if (pages.length === 0 || col >= d.cols) {
      pages.push({ columns: Array.from({ length: d.cols }, () => []) });
      col = 0;
    }
    used = 0;
  };
  nextCol();
  if (d.infoH !== null && d.infoH > 0) {
    cur().push({ kind: "info" });
    used = d.infoH + d.gap;
  }
  sections.forEach((s, si) => {
    let i = 0;
    let first = true;
    if (s.items.length === 0) return;
    while (i < s.items.length) {
      // Başlık + ilk birkaç satır bu sütuna sığmıyorsa sonraki sütuna geç
      let need = d.headH;
      for (let k = i, rows = 0; k < s.items.length && rows < MIN_ROWS; k++) {
        need += s.items[k]!.h;
        if (s.items[k]!.kind === "row") rows++;
      }
      if (used > 0 && used + need > d.colH) nextCol();
      const block: Block = { kind: "section", sec: si, cont: !first, items: [] };
      cur().push(block);
      used += d.headH;
      while (i < s.items.length) {
        const it = s.items[i]!;
        // Alt başlık, altındaki ilk satırla birlikte taşınır (sütun dibinde yalnız kalmaz)
        const h = it.kind === "sub" ? it.h + (s.items[i + 1]?.h ?? 0) : it.h;
        if (used + h > d.colH && block.items.some((x) => x.kind === "row")) break;
        block.items.push(it);
        used += it.h;
        i++;
      }
      first = false;
      if (i < s.items.length) nextCol();
    }
    used += d.gap;
  });
  return pages;
}

/** "MNV.BIBER KG" → "BIBER KG", "MN. PATLICAN MOR KG" → "PATLICAN MOR KG" */
export const stripName = (name: string) => name.replace(/^\s*MNV?\s*\.\s*/i, "") || name;
export const fmtPt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export function loadSettings(raw: string | null): PrintSettings {
  try {
    const s = raw ? (JSON.parse(raw) as Partial<PrintSettings>) : {};
    const out = { ...DEFAULT_SETTINGS, ...s };
    if (!(out.style in STYLES)) out.style = DEFAULT_SETTINGS.style;
    if (!(out.size in SIZE_LABEL)) out.size = DEFAULT_SETTINGS.size;
    out.info = out.info !== false;
    out.stripPrefix = out.stripPrefix === true;
    const hideCats = Array.isArray(out.hideCats) ? out.hideCats.filter((c): c is Cat => c in CAT_LABEL) : [];
    const hideUnits = Array.isArray(out.hideUnits) ? out.hideUnits.filter((u): u is Unit => u in UNIT_LABEL) : [];
    return {
      style: out.style, size: out.size, info: out.info, stripPrefix: out.stripPrefix,
      hideCats: [...new Set(hideCats)], hideUnits: [...new Set(hideUnits)],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
