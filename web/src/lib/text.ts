/** Türkçe karakterlerden bağımsız arama için: büyük harfe çevirip ASCII'ye indirger. */
export function normalize(s: string): string {
  return s
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G")
    .replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C");
}

export type Cat = "sebze" | "meyve" | "kasap" | "sarkuteri" | "diger";

export const CATEGORIES: { key: "tumu" | Cat; label: string }[] = [
  { key: "tumu", label: "Tümü" },
  { key: "sebze", label: "🥬 Sebze" },
  { key: "meyve", label: "🍎 Meyve" },
  { key: "kasap", label: "🥩 Kasap" },
  { key: "sarkuteri", label: "🧀 Şarküteri" },
];

/** Grup adından kategori anahtarı üretir (eski naman ile aynı kural). */
export function getCategory(group: string): Cat {
  const g = normalize(group || "");
  if (g.startsWith("KASAP")) return "kasap";
  if (g.startsWith("SARKUTERI")) return "sarkuteri";
  if (g.includes("MEYVE")) return "meyve";
  if (g.includes("SEBZE")) return "sebze";
  return "diger";
}

/** Arama eşleşmesini [önce, eşleşen, sonra] olarak böler; eşleşme yoksa null. */
export function splitMatch(text: string, q: string): [string, string, string] | null {
  if (!q) return null;
  const i = normalize(text).indexOf(q);
  if (i === -1) return null;
  return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
}
