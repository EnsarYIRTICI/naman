import type { AllData } from "./data";
import { SECTIONS, diffSection, type Item } from "./sections";

/** Yayınlanan dökümanın içeriği: yayın anındaki verinin kopyası. */
export interface Snapshot {
  generatedAt: string;
  products: Item[];
  channels: Item[];
  mealCards: Item[];
}
export const SNAPSHOT_KEYS = ["products", "channels", "mealCards"] as const;

const strip = (rows: AllData[keyof AllData], props: string[]): Item[] =>
  rows.map((r) => Object.fromEntries(props.map((p) => [p, String(r[p] ?? "")])) as Item);

export function buildSnapshot(all: AllData): Snapshot {
  return {
    generatedAt: new Date().toISOString(),
    products: strip(all.products, ["code", "name", "group"]),
    channels: strip(all.channels, ["name", "code"]),
    mealCards: strip(all.mealCards, ["name", "posName"]),
  };
}

export interface SectionChange { key: string; label: string; added: number; updated: number; removed: number }
export interface ChangeSummary { changes: SectionChange[]; hasChanges: boolean; note: string }

/** İki sürüm arasındaki farkı sayar ve sürüm notu için okunur bir metin önerir. */
export function describeChanges(prev: Snapshot | null, cur: Snapshot): ChangeSummary {
  if (!prev) {
    return {
      changes: [],
      hasChanges: true,
      note: `İlk sürüm: ${cur.products.length} ürün, ${cur.channels.length} kanal kodu, ${cur.mealCards.length} yemek kartı.`,
    };
  }
  const changes: SectionChange[] = [];
  const parts: string[] = [];
  for (const key of SNAPSHOT_KEYS) {
    const cfg = SECTIONS.find((s) => s.key === key)!;
    const d = diffSection(cfg, prev[key] ?? [], cur[key], "replace");
    const c = { key, label: cfg.label, added: d.added.length, updated: d.updated.length, removed: d.removed.length };
    changes.push(c);
    if (c.added + c.updated + c.removed === 0) continue;
    const names = (items: Item[]) => {
      const n = items.slice(0, 4).map((i) => (key === "products" ? i.name! : i[cfg.keyProp]!));
      return n.join(", ") + (items.length > n.length ? ` +${items.length - n.length}` : "");
    };
    const seg: string[] = [];
    if (d.added.length) seg.push(`${d.added.length} eklendi (${names(d.added)})`);
    if (d.removed.length) seg.push(`${d.removed.length} silindi (${names(d.removed)})`);
    if (d.updated.length) seg.push(`${d.updated.length} güncellendi (${names(d.updated.map((u) => u.after))})`);
    parts.push(`${cfg.label}: ${seg.join(", ")}`);
  }
  return {
    changes,
    hasChanges: changes.some((c) => c.added + c.updated + c.removed > 0),
    note: parts.join(" · ").slice(0, 2000),
  };
}
