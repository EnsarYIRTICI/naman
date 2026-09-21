import express, { type NextFunction, type Request, type Response } from "express";
import { COOKIE_NAME, parseCookies } from "./auth";
import type { Deps } from "./deps";
import { adminRoutes } from "./routes/admin";
import { adminDocRoutes, publicDocRoutes } from "./routes/doc";
import { publicDataRoutes } from "./routes/public";
import { publicRoutes } from "./routes/session";

export function buildApp(d: Deps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false); // ETag'i sadece /api/public/data kendisi ayarlar
  if (d.config.TRUST_PROXY) app.set("trust proxy", 1);

  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
    next();
  });

  // CSRF: çerez SameSite=Strict + durum değiştiren isteklerde Origin kontrolü
  const allowedOrigin = d.config.APP_ORIGIN ? new URL(d.config.APP_ORIGIN).origin : null;
  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    const origin = req.get("origin");
    if (!origin) return next();
    let ok = false;
    try {
      const o = new URL(origin);
      ok = allowedOrigin ? o.origin === allowedOrigin : o.host === req.host;
    } catch {
      ok = false;
    }
    if (!ok) {
      res.status(403).json({ error: "Geçersiz istek kaynağı." });
      return;
    }
    next();
  });

  const api = express.Router();
  api.use(publicRoutes(d)); // health, login, logout
  api.use(publicDataRoutes(d)); // /public/data (girişsiz)
  api.use(publicDocRoutes(d)); // /public/doc (girişsiz)

  // Buradan sonrası oturum gerektirir
  api.use(async (req: Request, res: Response, next: NextFunction) => {
    const session = await d.auth.getSession(parseCookies(req.headers.cookie)[COOKIE_NAME]);
    if (!session) {
      res.status(401).json({ error: "Oturum gerekli." });
      return;
    }
    req.user = session;
    res.set("Cache-Control", "no-store");
    next();
  });

  api.get("/me", (req, res) => res.json({ username: req.user!.username, ...d.version }));
  api.use(express.json({ limit: "5mb" }));
  api.use(adminRoutes(d));
  api.use(adminDocRoutes(d));
  api.use((_req, res) => res.status(404).json({ error: "Bulunamadı." }));
  app.use("/api", api);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({ error: "İstek çok büyük." });
      return;
    }
    if (err?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Geçersiz JSON." });
      return;
    }
    console.error("Beklenmeyen hata:", err);
    res.status(500).json({ error: "Sunucu hatası." });
  });

  return app;
}
