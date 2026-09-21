/** Yüklenen dosyayı metne çevirir: önce UTF-8, bozuksa Windows-1254 (Excel'in eski Türkçe CSV'leri). */
export function decodeText(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1254").decode(buf);
  }
  return text.replace(/^\uFEFF/, "");
}

function parseRows(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
const H_CODE = ["kod", "code", "urun kodu", "stok kodu"];
const H_NAME = ["ad", "urun", "urun adi", "name", "isim"];
const H_GROUP = ["grup", "group", "kategori"];

/** CSV -> { products }. Ayraç ; , veya sekme otomatik bulunur. Başlık satırı (kod;ad;grup) varsa sütunlar ada göre eşlenir, yoksa sırayla. */
export function parseProductsCsv(text: string): { products: { code: string; name: string; group: string }[] } {
  const first = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== "") ?? "";
  const delim = [";", "\t", ","].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows = parseRows(text, delim);
  if (rows.length === 0) throw new Error("CSV boş.");
  let ci = 0, ni = 1, gi = 2, start = 0;
  const head = rows[0]!.map(norm);
  const hc = head.findIndex((h) => H_CODE.includes(h));
  if (hc !== -1) {
    ci = hc;
    ni = head.findIndex((h) => H_NAME.includes(h));
    gi = head.findIndex((h) => H_GROUP.includes(h));
    if (ni === -1 || gi === -1) throw new Error("CSV başlığında kod, ad ve grup sütunları olmalı.");
    start = 1;
  } else if (rows[0]!.length < 3) {
    throw new Error("CSV'de en az 3 sütun olmalı: kod;ad;grup");
  }
  const products = rows.slice(start).map((r) => ({ code: (r[ci] ?? "").trim(), name: (r[ni] ?? "").trim(), group: (r[gi] ?? "").trim() }));
  return { products };
}
