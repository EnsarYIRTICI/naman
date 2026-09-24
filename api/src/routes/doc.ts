import { Router } from "express";
import { z } from "zod";
import { buildSnapshot, describeChanges, type Snapshot } from "../docdiff";
import { lastChangeAt, loadAll, logChange, withTx } from "../data";
import type { Deps } from "../deps";

const getCurrent = async (q: {
  query: Deps["pool"]["query"];
}): Promise<string | null> => {
  const r = await q.query(
    "SELECT value FROM settings WHERE key = 'doc_current'",
  );
  return (r.rows[0]?.value as string | undefined) ?? null;
};

/** Kasiyerlerin gördüğü herkese açık döküman: sürüm listesi + seçilen sürüm (?v=v3). */
export function publicDocRoutes(d: Deps): Router {
  const r = Router();

  r.get("/public/doc", async (req, res) => {
    const versions = (
      await d.pool.query(
        `SELECT id, label, kind, note, published_at AS "publishedAt" FROM doc_versions ORDER BY sort_key DESC`,
      )
    ).rows as {
      id: number;
      label: string;
      kind: "snapshot" | "pdf";
      note: string;
      publishedAt: string | null;
    }[];
    const current = await getCurrent(d.pool);
    const want = typeof req.query.v === "string" ? req.query.v.trim() : "";
    res.set("Cache-Control", "no-cache");
    // Arama sayfasının adresi (namdoc alan adında "/" dökümanın kendisi olduğu için mutlak adres gerekir)
    const homeUrl = d.config.APP_ORIGIN
      ? new URL(d.config.APP_ORIGIN).origin + "/"
      : "/";
    const list = versions.map((v) => ({
      label: v.label,
      kind: v.kind,
      note: v.note,
      publishedAt: v.publishedAt,
      current: v.label === current,
    }));

    // Sürüm istenmediyse (ya da bilinmeyen bir sürüm istendiyse) canlı veri gösterilir:
    // yönetim panelinde yapılan her değişiklik dökümana anında yansır.
    const sel = want ? versions.find((v) => v.label === want) : undefined;
    if (!sel) {
      const [all, updatedAt] = await Promise.all([loadAll(d.pool), lastChangeAt(d.pool)]);
      res.json({
        homeUrl,
        versions: list,
        selected: {
          label: "Canlı",
          kind: "snapshot",
          note: "",
          publishedAt: updatedAt,
          current: true,
          live: true,
          snapshot: buildSnapshot(all),
          pdfUrl: null,
        },
      });
      return;
    }
    let snapshot: Snapshot | null = null;
    if (sel.kind === "snapshot") {
      snapshot =
        (
          await d.pool.query(
            "SELECT snapshot FROM doc_versions WHERE id = $1",
            [sel.id],
          )
        ).rows[0]?.snapshot ?? null;
    }
    res.json({
      homeUrl,
      versions: list,
      selected: {
        label: sel.label,
        kind: sel.kind,
        note: sel.note,
        publishedAt: sel.publishedAt,
        current: false,
        live: false,
        snapshot,
        pdfUrl:
          sel.kind === "pdf"
            ? `/api/public/doc/${encodeURIComponent(sel.label)}/pdf`
            : null,
      },
    });
  });

  // Arşiv PDF (eski sürümler). İçerik hiç değişmediği için önbelleğe alınabilir.
  r.get("/public/doc/:label/pdf", async (req, res) => {
    const row = (
      await d.pool.query(
        "SELECT pdf, pdf_name FROM doc_versions WHERE label = $1 AND kind = 'pdf'",
        [String(req.params.label)],
      )
    ).rows[0] as { pdf: Buffer; pdf_name: string | null } | undefined;
    if (!row) {
      res.status(404).json({ error: "Bulunamadı." });
      return;
    }
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${(row.pdf_name ?? "kodlar.pdf").replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "public, max-age=86400",
      "X-Frame-Options": "SAMEORIGIN", // sayfa içinde (iframe) gösterilebilsin
    });
    res.send(row.pdf);
  });
  return r;
}

const publishBody = z.object({
  note: z.string().trim().max(2000),
  makeCurrent: z.boolean().default(true),
  force: z.boolean().default(false),
});
const noteBody = z.object({ note: z.string().trim().max(2000) });

/** Yönetim: sürümleri listele, yeni sürüm yayınla, güncel sürümü seç, not düzenle, sil. */
export function adminDocRoutes(d: Deps): Router {
  const r = Router();

  const latestSnapshot = async (q: Deps["pool"]) =>
    (
      await q.query(
        `SELECT label, snapshot FROM doc_versions WHERE kind = 'snapshot' ORDER BY sort_key DESC LIMIT 1`,
      )
    ).rows[0] as { label: string; snapshot: Snapshot } | undefined;

  r.get("/admin/doc", async (_req, res) => {
    const versions = (
      await d.pool.query(
        `SELECT id, label, kind, note, published_at AS "publishedAt", published_by AS "publishedBy",
                COALESCE(length(pdf), 0) AS "pdfSize"
           FROM doc_versions ORDER BY sort_key DESC`,
      )
    ).rows;
    const current = await getCurrent(d.pool);
    const latest = await latestSnapshot(d.pool);
    const sum = describeChanges(
      latest?.snapshot ?? null,
      buildSnapshot(await loadAll(d.pool)),
    );
    res.json({
      current,
      versions: versions.map((v) => ({ ...v, current: v.label === current })),
      suggestion: { baseline: latest?.label ?? null, ...sum },
    });
  });

  r.post("/admin/doc/publish", async (req, res) => {
    const body = publishBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "Geçersiz istek." });
      return;
    }
    const { note, makeCurrent, force } = body.data;
    const out = await withTx(d.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(727003)");
      const latest = await latestSnapshot(c as unknown as Deps["pool"]);
      const snap = buildSnapshot(await loadAll(c));
      const sum = describeChanges(latest?.snapshot ?? null, snap);
      if (!sum.hasChanges && !force) return { unchanged: latest?.label ?? "" };
      const rows = (await c.query("SELECT label, sort_key FROM doc_versions"))
        .rows as { label: string; sort_key: number }[];
      const nums = rows
        .map((x) => /^v(\d+)$/.exec(x.label)?.[1])
        .filter(Boolean)
        .map(Number);
      const label = `v${(nums.length ? Math.max(...nums) : 0) + 1}`;
      const sortKey =
        (rows.length ? Math.max(...rows.map((x) => x.sort_key)) : 0) + 1;
      await c.query(
        `INSERT INTO doc_versions (label, kind, note, published_at, published_by, snapshot, sort_key)
         VALUES ($1, 'snapshot', $2, now(), $3, $4::jsonb, $5)`,
        [
          label,
          note || sum.note,
          req.user?.username ?? null,
          JSON.stringify(snap),
          sortKey,
        ],
      );
      if (makeCurrent) {
        await c.query(
          `INSERT INTO settings (key, value) VALUES ('doc_current', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [label],
        );
      }
      await logChange(
        c,
        req.user?.username ?? null,
        `Döküman sürümü yayınlandı: ${label}${makeCurrent ? " (güncel yapıldı)" : ""}`,
      );
      return { label };
    });
    if ("unchanged" in out) {
      res
        .status(409)
        .json({
          error: `Son sürümden (${out.unchanged}) bu yana veride değişiklik yok, yeni sürüm yayınlanmadı.`,
        });
      return;
    }
    res.status(201).json(out);
  });

  r.put("/admin/doc/versions/:id", async (req, res) => {
    const body = noteBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "Geçersiz not." });
      return;
    }
    const u = await d.pool.query(
      "UPDATE doc_versions SET note = $1 WHERE id = $2",
      [body.data.note, Number(req.params.id)],
    );
    if (!u.rowCount) {
      res.status(404).json({ error: "Sürüm bulunamadı." });
      return;
    }
    res.json({ ok: true });
  });

  r.post("/admin/doc/current", async (req, res) => {
    const id = Number((req.body ?? {}).id);
    const out = await withTx(d.pool, async (c) => {
      const row = (
        await c.query("SELECT label FROM doc_versions WHERE id = $1", [id])
      ).rows[0] as { label: string } | undefined;
      if (!row) return null;
      await c.query(
        `INSERT INTO settings (key, value) VALUES ('doc_current', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [row.label],
      );
      await logChange(
        c,
        req.user?.username ?? null,
        `Güncel döküman sürümü değiştirildi: ${row.label}`,
      );
      return row.label;
    });
    if (!out) {
      res.status(404).json({ error: "Sürüm bulunamadı." });
      return;
    }
    res.json({ current: out });
  });

  r.delete("/admin/doc/versions/:id", async (req, res) => {
    const id = Number(req.params.id);
    const out = await withTx(d.pool, async (c) => {
      const row = (
        await c.query("SELECT label FROM doc_versions WHERE id = $1", [id])
      ).rows[0] as { label: string } | undefined;
      if (!row) return { status: 404 as const };
      if (row.label === (await getCurrent(c))) return { status: 409 as const };
      await c.query("DELETE FROM doc_versions WHERE id = $1", [id]);
      await logChange(
        c,
        req.user?.username ?? null,
        `Döküman sürümü silindi: ${row.label}`,
      );
      return { status: 200 as const };
    });
    if (out.status === 404)
      res.status(404).json({ error: "Sürüm bulunamadı." });
    else if (out.status === 409)
      res
        .status(409)
        .json({
          error: "Güncel sürüm silinemez. Önce başka bir sürümü güncel yapın.",
        });
    else res.json({ ok: true });
  });

  return r;
}
