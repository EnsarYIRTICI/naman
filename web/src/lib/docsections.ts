import { getCategory, type Cat } from "./text";
import type { DocSnapshot } from "./types";

export type P = DocSnapshot["products"][number];
export interface Section {
  key: string;
  title: string;
  cat: Cat;
  count: number;
  /** Kasap gibi alt gruplara ayrılan bölümlerde alt başlık, diğerlerinde null */
  parts: { sub: string | null; items: P[] }[];
  cols: number;
}

/**
 * Ürünleri v5 PDF'teki gibi bölümlere ayırır: "Kasap - Şen Piliç", "Kasap - Banvit" ... tek "Kasap"
 * bölümünde marka alt başlıklarıyla toplanır; diğer gruplar kendi bölümüdür.
 */
export function buildSections(products: P[]): Section[] {
  const out: Section[] = [];
  const byKey = new Map<string, Section>();
  for (const p of products) {
    const cat = getCategory(p.group);
    const dash = p.group.indexOf(" - ");
    const merged = cat === "kasap" && dash > 0;
    const key = merged ? "kasap" : "g:" + p.group;
    let s = byKey.get(key);
    if (!s) {
      s = { key, title: merged ? p.group.slice(0, dash) : p.group, cat, count: 0, parts: [], cols: 2 };
      byKey.set(key, s);
      out.push(s);
    }
    const sub = merged ? p.group.slice(dash + 3) : null;
    let part = s.parts.find((x) => x.sub === sub);
    if (!part) { part = { sub, items: [] }; s.parts.push(part); }
    part.items.push(p);
    s.count++;
  }
  // Uzun, alt başlıksız listeler 3 sütun (Sebze, Meyve); kısa olanlar ve alt başlıklılar 2 sütun
  for (const s of out) s.cols = s.parts.length === 1 && s.count >= 30 ? 3 : 2;
  return out;
}

