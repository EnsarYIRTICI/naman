import fs from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { bumpVersion, loadAll, loadSection, withTx } from "./data";
import { buildSnapshot } from "./docdiff";
import { SECTIONS, applyDiff, diffSection, normalizeImport, type Item } from "./sections";

/** İlk kurulumda (bir kez) seed/naman.json içindeki mevcut ürün/kanal/barkod/yemek kartı verisini yükler. */
export async function seedIfNeeded(pool: Pool): Promise<void> {
  if ((await pool.query("SELECT 1 FROM settings WHERE key = 'seeded'")).rowCount) return;
  const file = path.join(__dirname, "..", "seed", "naman.json");
  await withTx(pool, async (c) => {
    if (fs.existsSync(file)) {
      const parsed = normalizeImport(JSON.parse(fs.readFileSync(file, "utf8")));
      if (parsed.errors.length) throw new Error("seed/naman.json geçersiz: " + parsed.errors.slice(0, 5).join("; "));
      const counts: string[] = [];
      for (const cfg of SECTIONS) {
        const incoming = parsed.data[cfg.key];
        if (!incoming) continue;
        const existing = (await loadSection(c, cfg)).map((row) =>
          Object.fromEntries(cfg.props.map((p) => [p.prop, String(row[p.prop] ?? "")])) as Item,
        );
        await applyDiff(c, cfg, diffSection(cfg, existing, incoming, "replace"), incoming, "replace");
        counts.push(`${cfg.label}: ${incoming.length}`);
      }
      await bumpVersion(c, null, `İlk veri yüklemesi (eski naman verisi) — ${counts.join("; ")}`);
      console.log("İlk veri yüklendi: " + counts.join(", "));
    }
    await c.query("INSERT INTO settings (key, value) VALUES ('seeded', '1')");
  });
}

/** Döküman sürümleri için ilk kurulum (bir kez): eski PDF sürümleri (arşiv) + mevcut veriden ilk dijital sürüm. */
export async function seedDocsIfNeeded(pool: Pool): Promise<void> {
  if ((await pool.query("SELECT 1 FROM settings WHERE key = 'seeded_docs'")).rowCount) return;
  const dir = path.join(__dirname, "..", "seed", "docs");
  await withTx(pool, async (c) => {
    let sort = 0;
    const manifestFile = path.join(dir, "manifest.json");
    if (fs.existsSync(manifestFile)) {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as { label: string; file: string; note: string }[];
      for (const m of manifest) {
        const f = path.join(dir, m.file);
        if (!fs.existsSync(f)) continue;
        await c.query(
          `INSERT INTO doc_versions (label, kind, note, pdf_name, pdf, sort_key) VALUES ($1, 'pdf', $2, $3, $4, $5)`,
          [m.label, m.note, m.file, fs.readFileSync(f), ++sort],
        );
      }
    }
    const nums = (await c.query("SELECT label FROM doc_versions")).rows
      .map((r) => /^v(\d+)$/.exec(r.label as string)?.[1]).filter(Boolean).map(Number);
    const label = `v${(nums.length ? Math.max(...nums) : 0) + 1}`;
    await c.query(
      `INSERT INTO doc_versions (label, kind, note, published_at, snapshot, sort_key) VALUES ($1, 'snapshot', $2, now(), $3::jsonb, $4)`,
      [label, "İlk dijital sürüm: mevcut veriden üretildi, artık PDF yerine sayfa olarak gösteriliyor.", JSON.stringify(buildSnapshot(await loadAll(c))), ++sort],
    );
    await c.query(`INSERT INTO settings (key, value) VALUES ('doc_current', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [label]);
    await c.query("INSERT INTO settings (key, value) VALUES ('seeded_docs', '1')");
    console.log(`Döküman sürümleri hazırlandı (arşiv PDF: ${sort - 1}, güncel: ${label})`);
  });
}
