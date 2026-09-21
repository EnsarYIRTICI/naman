import fs from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import { bumpVersion, loadSection, withTx } from "./data";
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
