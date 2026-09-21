import type { PoolClient } from "pg";

/** Veri bölümleri (tablolar) ve içe aktarma / farklılık hesabı. Saf mantık: veritabanına bağımlı değil (applyDiff hariç). */

export type SectionKey = "products" | "channels" | "barcodes" | "mealCards";
export type Item = Record<string, string>;
export type Mode = "merge" | "replace";

export interface PropCfg {
  prop: string;
  col: string;
  label: string;
  max: number;
}
export interface SectionCfg {
  key: SectionKey;
  route: string;
  table: string;
  label: string;
  single: string;
  keyProp: string;
  props: PropCfg[];
}

export const SECTIONS: SectionCfg[] = [
  {
    key: "products", route: "products", table: "products", label: "Ürünler", single: "Ürün", keyProp: "code",
    props: [
      { prop: "code", col: "code", label: "Kod", max: 40 },
      { prop: "name", col: "name", label: "Ürün adı", max: 200 },
      { prop: "group", col: "group_name", label: "Grup", max: 100 },
    ],
  },
  {
    key: "channels", route: "channels", table: "channels", label: "Sipariş kanalları", single: "Kanal", keyProp: "name",
    props: [
      { prop: "name", col: "name", label: "Kanal", max: 100 },
      { prop: "code", col: "code", label: "Kod", max: 60 },
    ],
  },
  {
    key: "barcodes", route: "barcodes", table: "barcodes", label: "Barkodlar", single: "Barkod", keyProp: "code",
    props: [
      { prop: "name", col: "name", label: "Ad", max: 200 },
      { prop: "code", col: "code", label: "Kod", max: 60 },
    ],
  },
  {
    key: "mealCards", route: "meal-cards", table: "meal_cards", label: "Yemek kartları", single: "Yemek kartı", keyProp: "name",
    props: [
      { prop: "name", col: "name", label: "Kart", max: 100 },
      { prop: "posName", col: "pos_name", label: "Kasada seçilecek", max: 100 },
    ],
  },
];

// Eski naman products.json biçimi (c/n/g, kanal/kod, actions, ad/kod) ve yeni biçim birlikte kabul edilir.
const ALIASES: Record<SectionKey, { arrayKeys: string[]; props: Record<string, string[]> }> = {
  products: { arrayKeys: ["products"], props: { code: ["code", "c", "kod"], name: ["name", "n", "ad"], group: ["group", "g", "grup"] } },
  channels: { arrayKeys: ["channels"], props: { name: ["name", "kanal", "ad"], code: ["code", "kod"] } },
  barcodes: { arrayKeys: ["barcodes", "actions"], props: { name: ["name", "ad"], code: ["code", "kod"] } },
  mealCards: { arrayKeys: ["mealCards", "meal_cards"], props: { name: ["name", "ad"], posName: ["posName", "pos", "pos_name"] } },
};

export const keyCol = (cfg: SectionCfg): string => cfg.props.find((p) => p.prop === cfg.keyProp)!.col;
export const labelOf = (cfg: SectionCfg, it: Item): string => cfg.props.map((p) => it[p.prop] ?? "").join(" · ");

/** Tek kaydı doğrular/normalize eder. Hata varsa item yok, errors dolu. */
export function normalizeItem(cfg: SectionCfg, raw: unknown): { item?: Item; errors: string[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { errors: ["kayıt bir nesne olmalı"] };
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];
  const item: Item = {};
  for (const p of cfg.props) {
    let v: unknown;
    for (const k of ALIASES[cfg.key].props[p.prop] ?? [p.prop]) {
      if (r[k] !== undefined && r[k] !== null) {
        v = r[k];
        break;
      }
    }
    const s = v === undefined ? "" : String(v).trim();
    if (!s) errors.push(`"${p.label}" boş olamaz`);
    else if (s.length > p.max) errors.push(`"${p.label}" en fazla ${p.max} karakter olmalı`);
    item[p.prop] = s;
  }
  if (cfg.key === "barcodes" && item.code && !/^[\x20-\x7E]+$/.test(item.code)) {
    errors.push("Barkod kodu sadece ASCII karakter içermeli");
  }
  return errors.length ? { errors } : { item, errors };
}

export interface ImportParse {
  data: Partial<Record<SectionKey, Item[]>>;
  errors: string[];
  notes: string[];
}

/** Yüklenen JSON'u bölümlere ayırır. Hata varsa içe aktarma yapılmaz (kısmi yükleme yok). */
export function normalizeImport(raw: unknown): ImportParse {
  const out: ImportParse = { data: {}, errors: [], notes: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    out.errors.push("Dosya içeriği bir JSON nesnesi olmalı ({ \"products\": [...] } biçiminde).");
    return out;
  }
  const obj = raw as Record<string, unknown>;
  for (const cfg of SECTIONS) {
    const arrKey = ALIASES[cfg.key].arrayKeys.find((k) => Array.isArray(obj[k]));
    if (!arrKey) continue;
    const arr = obj[arrKey] as unknown[];
    if (arr.length === 0) {
      out.notes.push(`${cfg.label}: liste boş, atlandı.`);
      continue;
    }
    if (arr.length > 5000) {
      out.errors.push(`${cfg.label}: en fazla 5000 kayıt yüklenebilir.`);
      continue;
    }
    const seen = new Map<string, number>();
    const items: Item[] = [];
    arr.forEach((rawItem, i) => {
      const { item, errors } = normalizeItem(cfg, rawItem);
      if (!item) {
        for (const m of errors) out.errors.push(`${cfg.label} #${i + 1}: ${m}`);
        return;
      }
      const k = item[cfg.keyProp]!;
      if (seen.has(k)) {
        out.errors.push(`${cfg.label}: "${k}" tekrar ediyor (#${seen.get(k)} ve #${i + 1})`);
        return;
      }
      seen.set(k, i + 1);
      items.push(item);
    });
    out.data[cfg.key] = items;
  }
  if (Object.keys(out.data).length === 0 && out.errors.length === 0 && out.notes.length === 0) {
    out.errors.push("Dosyada içe aktarılacak bölüm bulunamadı (products, channels, barcodes/actions, mealCards).");
  }
  return out;
}

export interface Diff {
  added: Item[];
  updated: { before: Item; after: Item }[];
  removed: Item[];
  unchanged: number;
}

/** Mevcut kayıtlar ile yüklenenleri anahtara göre karşılaştırır. replace modunda yüklenmeyenler silinir. */
export function diffSection(cfg: SectionCfg, existing: Item[], incoming: Item[], mode: Mode): Diff {
  const byKey = new Map(existing.map((e) => [e[cfg.keyProp]!, e]));
  const inKeys = new Set<string>();
  const diff: Diff = { added: [], updated: [], removed: [], unchanged: 0 };
  for (const it of incoming) {
    const k = it[cfg.keyProp]!;
    inKeys.add(k);
    const cur = byKey.get(k);
    if (!cur) diff.added.push(it);
    else if (cfg.props.some((p) => cur[p.prop] !== it[p.prop])) diff.updated.push({ before: cur, after: it });
    else diff.unchanged++;
  }
  if (mode === "replace") diff.removed = existing.filter((e) => !inKeys.has(e[cfg.keyProp]!));
  return diff;
}

export const diffCount = (d: Diff): number => d.added.length + d.updated.length + d.removed.length;

/** Farkı veritabanına uygular (çağıran transaction içinde olmalı). */
export async function applyDiff(client: PoolClient, cfg: SectionCfg, diff: Diff, incoming: Item[], mode: Mode): Promise<void> {
  const kc = keyCol(cfg);
  const cols = cfg.props.map((p) => p.col);
  if (diff.removed.length) {
    await client.query(`DELETE FROM ${cfg.table} WHERE ${kc} = ANY($1::text[])`, [diff.removed.map((r) => r[cfg.keyProp])]);
  }
  for (const { after } of diff.updated) {
    const sets = cfg.props.map((p, i) => `${p.col} = $${i + 1}`).join(", ");
    await client.query(`UPDATE ${cfg.table} SET ${sets} WHERE ${kc} = $${cols.length + 1}`, [
      ...cfg.props.map((p) => after[p.prop]),
      after[cfg.keyProp],
    ]);
  }
  for (const it of diff.added) {
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    await client.query(
      `INSERT INTO ${cfg.table} (${cols.join(", ")}, sort_order)
       VALUES (${ph}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ${cfg.table}))`,
      cfg.props.map((p) => it[p.prop]),
    );
  }
  if (mode === "replace" && incoming.length) {
    // Yüklenen dosyadaki sıra korunur
    await client.query(
      `UPDATE ${cfg.table} t SET sort_order = v.ord
         FROM unnest($1::text[], $2::int[]) AS v(k, ord) WHERE t.${kc} = v.k`,
      [incoming.map((i) => i[cfg.keyProp]), incoming.map((_, idx) => idx + 1)],
    );
  }
}
