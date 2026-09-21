import { Router } from "express";
import { getVersion, lastChangeAt, loadAll } from "../data";
import type { Deps } from "../deps";

/** Kasiyerlerin kullandığı herkese açık, salt okunur veri. ETag = veri sürümü (değişmediyse 304). */
export function publicDataRoutes(d: Deps): Router {
  const r = Router();
  r.get("/public/data", async (req, res) => {
    const version = await getVersion(d.pool);
    const doc = (await d.pool.query("SELECT value FROM settings WHERE key = 'doc_current'")).rows[0]?.value as string | undefined;
    const etag = `W/"naman-${version}-${doc ?? "-"}"`;
    res.set({ ETag: etag, "Cache-Control": "no-cache" });
    if (req.get("if-none-match") === etag) {
      res.status(304).end();
      return;
    }
    const all = await loadAll(d.pool);
    res.json({ meta: { version, updatedAt: await lastChangeAt(d.pool), docVersion: doc ?? null }, ...all });
  });
  return r;
}
