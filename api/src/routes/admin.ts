import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { bumpVersion, getVersion, loadAll, loadSection, withTx, type Row } from "../data";
import type { Deps } from "../deps";
import {
  SECTIONS, applyDiff, diffCount, diffSection, keyCol, labelOf, normalizeImport, normalizeItem,
  type Diff, type Item, type SectionCfg,
} from "../sections";

const importBody = z.object({
  mode: z.enum(["merge", "replace"]),
  dry: z.boolean().default(true),
  data: z.unknown(),
});

const toItem = (cfg: SectionCfg, row: Row): Item =>
  Object.fromEntries(cfg.props.map((p) => [p.prop, String(row[p.prop] ?? "")]));

const byRoute = new Map(SECTIONS.map((s) => [s.route, s]));

function summarize(cfg: SectionCfg, d: Diff) {
  return {
    key: cfg.key,
    label: cfg.label,
    added: d.added.length,
    updated: d.updated.length,
    removed: d.removed.length,
    unchanged: d.unchanged,
    samples: {
      added: d.added.slice(0, 8).map((i) => labelOf(cfg, i)),
      removed: d.removed.slice(0, 8).map((i) => labelOf(cfg, i)),
      updated: d.updated.slice(0, 8).map((u) => ({
        label: labelOf(cfg, u.before),
        changes: cfg.props
          .filter((p) => u.before[p.prop] !== u.after[p.prop])
          .map((p) => ({ label: p.label, from: u.before[p.prop] ?? "", to: u.after[p.prop] ?? "" })),
      })),
    },
  };
}

export function adminRoutes(d: Deps): Router {
  const r = Router();
  const who = (req: Request) => req.user?.username ?? null;

  r.get("/admin/data", async (_req, res) => {
    res.json({ version: await getVersion(d.pool), ...(await loadAll(d.pool)) });
  });

  r.get("/admin/changes", async (_req, res) => {
    const rows = (
      await d.pool.query(`SELECT id, at AS "at", username, summary, version FROM changes ORDER BY id DESC LIMIT 100`)
    ).rows;
    res.json(rows);
  });

  r.get("/admin/export", async (_req, res) => {
    const all = await loadAll(d.pool);
    const strip = (cfg: SectionCfg) => (all[cfg.key] as Row[]).map((row) => toItem(cfg, row));
    const out: Record<string, unknown> = {
      format: "naman-export",
      exportedAt: new Date().toISOString(),
      version: await getVersion(d.pool),
    };
    for (const cfg of SECTIONS) out[cfg.key] = strip(cfg);
    res.set("Content-Disposition", `attachment; filename="naman-yedek-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(out);
  });

  // Toplu içe aktarma: dry=true önizleme (hiçbir şey yazmaz), dry=false uygular. Hata varsa hiçbir şey yazılmaz.
  r.post("/admin/import", async (req, res) => {
    const body = importBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "Geçersiz istek: mode (merge|replace) ve data gerekli." });
      return;
    }
    const { mode, dry, data: raw } = body.data;
    const parsed = normalizeImport(raw);
    if (parsed.errors.length) {
      res.status(400).json({
        error: `Dosyada ${parsed.errors.length} hata var, hiçbir şey yüklenmedi.`,
        details: parsed.errors.slice(0, 20),
      });
      return;
    }

    const plan = async (q: Parameters<typeof loadSection>[0]) => {
      const out: { cfg: SectionCfg; incoming: Item[]; diff: Diff }[] = [];
      for (const cfg of SECTIONS) {
        const incoming = parsed.data[cfg.key];
        if (!incoming) continue;
        const existing = (await loadSection(q, cfg)).map((row) => toItem(cfg, row));
        out.push({ cfg, incoming, diff: diffSection(cfg, existing, incoming, mode) });
      }
      return out;
    };

    if (dry) {
      const p = await plan(d.pool);
      res.json({ dry: true, mode, notes: parsed.notes, sections: p.map((x) => summarize(x.cfg, x.diff)) });
      return;
    }

    const result = await withTx(d.pool, async (c) => {
      const p = await plan(c);
      const total = p.reduce((n, x) => n + diffCount(x.diff), 0);
      for (const x of p) await applyDiff(c, x.cfg, x.diff, x.incoming, mode);
      let version = await getVersion(c);
      if (total > 0) {
        const parts = p
          .filter((x) => diffCount(x.diff) > 0)
          .map((x) => `${x.cfg.label}: +${x.diff.added.length} ~${x.diff.updated.length} -${x.diff.removed.length}`);
        version = await bumpVersion(
          c, who(req), `İçe aktarma (${mode === "replace" ? "değiştir" : "birleştir"}) — ${parts.join("; ")}`,
        );
      }
      return { p, total, version };
    });
    res.json({ dry: false, mode, applied: result.total > 0, version: result.version, notes: parsed.notes,
      sections: result.p.map((x) => summarize(x.cfg, x.diff)) });
  });

  // ---- Bölüm bazında tek kayıt işlemleri ----
  const cfgOf = (req: Request, res: Response): SectionCfg | null => {
    const cfg = byRoute.get(String(req.params.section ?? ""));
    if (!cfg) res.status(404).json({ error: "Bulunamadı." });
    return cfg ?? null;
  };
  const idOf = (req: Request, res: Response): number | null => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "Geçersiz kimlik." });
      return null;
    }
    return id;
  };
  const dupMsg = (cfg: SectionCfg, key: string) => `Bu ${cfg.props.find((p) => p.prop === cfg.keyProp)!.label.toLowerCase()} zaten var: ${key}`;

  r.post("/admin/:section", async (req, res) => {
    const cfg = cfgOf(req, res);
    if (!cfg) return;
    const { item, errors } = normalizeItem(cfg, req.body);
    if (!item) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }
    try {
      const out = await withTx(d.pool, async (c) => {
        const cols = cfg.props.map((p) => p.col);
        const ins = await c.query(
          `INSERT INTO ${cfg.table} (${cols.join(", ")}, sort_order)
           VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ${cfg.table}))
           RETURNING id`,
          cfg.props.map((p) => item[p.prop]),
        );
        const version = await bumpVersion(c, who(req), `${cfg.single} eklendi: ${labelOf(cfg, item)}`);
        return { id: ins.rows[0].id as number, version };
      });
      res.status(201).json({ id: out.id, ...item, version: out.version });
    } catch (e: any) {
      if (e?.code === "23505") {
        res.status(409).json({ error: dupMsg(cfg, item[cfg.keyProp]!) });
        return;
      }
      throw e;
    }
  });

  r.put("/admin/:section/:id", async (req, res) => {
    const cfg = cfgOf(req, res);
    const id = cfg ? idOf(req, res) : null;
    if (!cfg || id === null) return;
    const { item, errors } = normalizeItem(cfg, req.body);
    if (!item) {
      res.status(400).json({ error: errors.join("; ") });
      return;
    }
    try {
      const out = await withTx(d.pool, async (c) => {
        const cur = (await c.query(`SELECT ${cfg.props.map((p) => `${p.col} AS "${p.prop}"`).join(", ")} FROM ${cfg.table} WHERE id = $1 FOR UPDATE`, [id])).rows[0] as Row | undefined;
        if (!cur) return null;
        const before = toItem(cfg, cur);
        const changed = cfg.props.filter((p) => before[p.prop] !== item[p.prop]);
        if (changed.length === 0) return { version: await getVersion(c) };
        await c.query(
          `UPDATE ${cfg.table} SET ${cfg.props.map((p, i) => `${p.col} = $${i + 1}`).join(", ")} WHERE id = $${cfg.props.length + 1}`,
          [...cfg.props.map((p) => item[p.prop]), id],
        );
        const what = changed.map((p) => `${p.label}: ${before[p.prop]} → ${item[p.prop]}`).join(", ");
        return { version: await bumpVersion(c, who(req), `${cfg.single} güncellendi (${labelOf(cfg, before)}): ${what}`) };
      });
      if (!out) {
        res.status(404).json({ error: "Kayıt bulunamadı." });
        return;
      }
      res.json({ id, ...item, version: out.version });
    } catch (e: any) {
      if (e?.code === "23505") {
        res.status(409).json({ error: dupMsg(cfg, item[cfg.keyProp]!) });
        return;
      }
      throw e;
    }
  });

  r.delete("/admin/:section/:id", async (req, res) => {
    const cfg = cfgOf(req, res);
    const id = cfg ? idOf(req, res) : null;
    if (!cfg || id === null) return;
    const out = await withTx(d.pool, async (c) => {
      const del = await c.query(
        `DELETE FROM ${cfg.table} WHERE id = $1 RETURNING ${cfg.props.map((p) => `${p.col} AS "${p.prop}"`).join(", ")}`,
        [id],
      );
      if (!del.rowCount) return null;
      return bumpVersion(c, who(req), `${cfg.single} silindi: ${labelOf(cfg, toItem(cfg, del.rows[0] as Row))}`);
    });
    if (out === null) {
      res.status(404).json({ error: "Kayıt bulunamadı." });
      return;
    }
    res.json({ ok: true, version: out });
  });

  return r;
}

export { keyCol };
