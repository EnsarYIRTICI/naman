import { decodeText, norm, parseRows } from "./importfile";
import { getCategory, type Cat } from "./text";
import { readXlsx } from "./xlsx";

/**
 * "Dosyadan ürün ekle": Excel (.xlsx), CSV/TXT ya da JSON dosyasından ürün listesini çıkarır.
 * Manav sipariş evrakı gibi dosyaları tanır:
 *   Stok Kodu | Stok Adı | Geçen Haftaki Sipariş | Geçen Haftaki Satış | Sipariş Miktarı
 *   Ürün Grubu: Adetli Ürünler            ← grup satırı
 *   2880003   | MNV.DEREOTU AD | 40 | 25 | 0
 * Başlıklar farklı adlandırılmış olabilir (Kod / Ürün Adı / Grup ...). Başlık yoksa sütunlar sırayla (kod, ad, grup) okunur.
 */

export interface FileItem {
  code: string;
  name: string;
  /** Dosyadaki grup (grup sütunu ya da "Ürün Grubu: ..." satırı); yoksa "" */
  fileGroup: string;
  /** Dosyadaki satır numarası (1 tabanlı) */
  row: number;
  /** Sipariş / satış sütunlarından biri 0'dan büyükse true; bu sütunlar yoksa null */
  active: boolean | null;
  /** Sipariş/satış sütunlarının kısa özeti (ör. "Sipariş Miktarı: 48") */
  activity: string;
}

export interface ParsedFile {
  sheet: string | null;
  items: FileItem[];
  /** Sipariş/satış miktarı sütun başlıkları (varsa) */
  activityCols: string[];
  /** Grup bilgisinin kaynağı: Grup sütunu, "Ürün Grubu: …" satırları ya da yok */
  groupSource: "column" | "rows" | "none";
  warnings: string[];
}

const H_CODE = ["stok kodu", "kod", "urun kodu", "code", "stok kod", "malzeme kodu", "urun kod"];
const H_NAME = ["stok adi", "ad", "adi", "urun adi", "urun", "name", "isim", "stok ismi", "urun ismi", "aciklama", "malzeme adi", "stok aciklamasi"];
const H_GROUP = ["grup", "group", "kategori", "urun grubu", "stok grubu", "grup adi"];
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const key = (s: string) => norm(clean(s)).replace(/[.:]+$/, "");
/** "Ürün Grubu: Adetli Ürünler" → "Adetli Ürünler" */
const GROUP_ROW = /^\s*(?:ürün|urun|stok)?\s*gru(?:bu|p)\s*[:\-]\s*(.+)$/i;

function toNumber(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  // 1.234,5 (TR) ve 1234.5 biçimleri
  const n = Number(/,\d+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("tr-TR", { maximumFractionDigits: 2 }));

interface Header {
  at: number;
  code: number;
  name: number;
  group: number;
  activity: number[];
}

function findHeader(rows: string[][]): Header | null {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const h = rows[i]!.map(key);
    const code = h.findIndex((x) => H_CODE.includes(x));
    const name = h.findIndex((x, j) => j !== code && H_NAME.includes(x));
    if (code === -1 || name === -1) continue;
    const group = h.findIndex((x, j) => j !== code && j !== name && H_GROUP.includes(x));
    const activity = h
      .map((x, j) => (j !== code && j !== name && j !== group && /siparis|satis|miktar|adet/.test(x) ? j : -1))
      .filter((j) => j !== -1);
    return { at: i, code, name, group, activity };
  }
  return null;
}

/** Metin tablosunu ürün listesine çevirir. */
export function parseProductTable(rows: string[][], sheet: string | null = null): ParsedFile {
  const warnings: string[] = [];
  const nonEmpty = rows.filter((r) => r.some((c) => (c ?? "").trim() !== ""));
  if (nonEmpty.length === 0) return { sheet, items: [], activityCols: [], groupSource: "none", warnings: ["Dosya boş."] };

  let h = findHeader(rows);
  if (!h) {
    // Başlık yok: ilk dolu satırın ilk hücresi kod gibi görünüyorsa kod;ad;grup sırası varsayılır
    const first = rows.findIndex((r) => r.some((c) => (c ?? "").trim() !== ""));
    const r0 = rows[first]!;
    if (r0.length < 2) {
      throw new Error("Kod ve ürün adı sütunları bulunamadı. İlk satırda \"Stok Kodu\" ve \"Stok Adı\" (ya da \"Kod\" / \"Ürün Adı\") başlıkları olmalı.");
    }
    h = { at: first - 1, code: 0, name: 1, group: r0.length >= 3 ? 2 : -1, activity: [] };
    warnings.push("Başlık satırı bulunamadı; sütunlar sırayla okundu (1: kod, 2: ürün adı" + (h.group !== -1 ? ", 3: grup" : "") + ").");
  }
  const headRow = h.at >= 0 ? rows[h.at]! : [];
  const activityCols = h.activity.map((j) => clean(headRow[j] ?? ""));

  const items: FileItem[] = [];
  const seen = new Map<string, number>();
  let curGroup = "";
  for (let i = h.at + 1; i < rows.length; i++) {
    const r = rows[i]!;
    const cell = (j: number) => (j >= 0 ? clean(r[j] ?? "") : "");
    const filled = r.map((c) => clean(c ?? "")).filter(Boolean);
    if (filled.length === 0) continue;
    const code = cell(h.code);
    const name = cell(h.name);

    // Grup satırı: "Ürün Grubu: X" ya da tek dolu hücreli, ürün adı olmayan satır
    const gm = GROUP_ROW.exec(filled[0]!);
    if (filled.length === 1 && (gm || (!name && !/^\d+$/.test(filled[0]!)))) {
      curGroup = clean(gm ? gm[1]! : filled[0]!);
      continue;
    }
    if (!code || !name) {
      warnings.push(`Satır ${i + 1}: ${!code ? "kod" : "ürün adı"} boş, atlandı (${filled.join(" | ").slice(0, 60)}).`);
      continue;
    }
    if (code.length > 40 || name.length > 200) {
      warnings.push(`Satır ${i + 1}: kod ya da ad çok uzun, atlandı.`);
      continue;
    }
    if (seen.has(code)) {
      warnings.push(`Satır ${i + 1}: ${code} kodu satır ${seen.get(code)} ile aynı, ikincisi atlandı.`);
      continue;
    }
    seen.set(code, i + 1);
    let active: boolean | null = null;
    const act: string[] = [];
    if (h.activity.length) {
      active = false;
      h.activity.forEach((j, k) => {
        const n = toNumber(r[j] ?? "");
        if (n !== null && n > 0) {
          active = true;
          act.push(`${activityCols[k]}: ${fmtNum(n)}`);
        }
      });
    }
    items.push({ code, name, fileGroup: cell(h.group) || curGroup, row: i + 1, active, activity: act.join(" · ") });
  }
  if (items.length === 0) warnings.unshift("Dosyada ürün satırı bulunamadı.");
  const groupSource = h.group !== -1 ? "column" : items.some((i) => i.fileGroup) ? "rows" : "none";
  return { sheet, items, activityCols, groupSource, warnings };
}

function parseJson(text: string): ParsedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error("JSON okunamadı: " + (e as Error).message);
  }
  const arr = Array.isArray(raw) ? raw : (raw as Record<string, unknown> | null)?.products;
  if (!Array.isArray(arr)) throw new Error("JSON içinde ürün listesi (products) bulunamadı.");
  const rows: string[][] = [["kod", "ad", "grup"]];
  for (const x of arr as Record<string, unknown>[]) {
    const pick = (...k: string[]) => String(k.map((kk) => x?.[kk]).find((v) => v !== undefined && v !== null) ?? "");
    rows.push([pick("code", "c", "kod"), pick("name", "n", "ad"), pick("group", "g", "grup")]);
  }
  return parseProductTable(rows);
}

/** Yüklenen dosyayı türüne göre okur. */
export async function readProductFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const lower = file.name.toLowerCase();
  const head = new Uint8Array(buf.slice(0, 4));
  const zipOrOle = (head[0] === 0x50 && head[1] === 0x4b) || (head[0] === 0xd0 && head[1] === 0xcf);
  if (/\.(xlsx|xlsm|xls)$/.test(lower) || zipOrOle) {
    if (/\.(ods)$/.test(lower)) throw new Error("OpenDocument (.ods) desteklenmiyor; .xlsx ya da .csv olarak kaydedin.");
    const sheets = readXlsx(buf);
    // Ürün başlığı olan ilk sayfa; yoksa ilk dolu sayfa
    const withHeader = sheets.find((s) => findHeader(s.rows));
    const sh = withHeader ?? sheets.find((s) => s.rows.some((r) => r.some((c) => c.trim()))) ?? sheets[0]!;
    const out = parseProductTable(sh.rows, sheets.length > 1 ? sh.name : null);
    if (sheets.length > 1) out.warnings.unshift(`Dosyada ${sheets.length} sayfa var; "${sh.name}" sayfası okundu.`);
    return out;
  }
  if (/\.pdf$/.test(lower)) throw new Error("PDF'ten ürün okunamıyor. Aynı listeyi Excel (.xlsx) ya da CSV olarak yükleyin.");
  const text = decodeText(buf);
  if (/\.json$/.test(lower) || /^\s*[[{]/.test(text)) return parseJson(text);
  const first = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== "") ?? "";
  const delim = [";", "\t", ","].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  return parseProductTable(parseRows(text, delim));
}

/** "Meyve Siparişi" → "Meyve" (grup önerisi için) */
export const cleanGroupName = (g: string) => clean(g.replace(/\s*sipari[sş]i\s*$/i, "")) || g;

/**
 * Dosyadaki grup için sistemde kullanılacak grubu önerir:
 * 1) Dosyadaki bu gruptan sistemde zaten olan ürünler varsa, onların çoğunlukla bulunduğu grup
 * 2) Aynı adlı (Türkçe karakter/büyük-küçük farkı gözetmeden) mevcut grup
 * 3) Aynı kategoriye (sebze/meyve ...) düşen tek mevcut grup
 * 4) Dosyadaki adın temizlenmiş hali (yeni grup)
 */
export function suggestGroup(fileGroup: string, items: FileItem[], existing: { code: string; group: string }[]): string {
  const byCode = new Map(existing.map((p) => [p.code, p.group]));
  const counts = new Map<string, number>();
  for (const it of items) {
    const g = byCode.get(it.code);
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  if (counts.size) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const groups = [...new Set(existing.map((p) => p.group))];
  const cleaned = cleanGroupName(fileGroup || "Diğer");
  const same = groups.find((g) => key(g) === key(cleaned));
  if (same) return same;
  const cat: Cat = getCategory(cleaned);
  if (cat !== "diger") {
    const sameCat = groups.filter((g) => getCategory(g) === cat);
    if (sameCat.length === 1) return sameCat[0]!;
  }
  return cleaned;
}
