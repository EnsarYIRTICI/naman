import { Pool } from "pg";

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

// Sıralı migrasyonlar. Yeni değişiklik = listeye yeni kayıt ekleyin (eskileri değiştirmeyin).
const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL, last_seen BIGINT NOT NULL, expires_at BIGINT NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE products (
        id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        group_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE channels (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE barcodes (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE meal_cards (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, pos_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO settings (key, value) VALUES ('data_version', '0');

      -- Her veri değişikliği bir kayıt üretir; version = o değişiklikten sonraki veri sürümü
      CREATE TABLE changes (
        id SERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(),
        username TEXT, summary TEXT NOT NULL, version INTEGER NOT NULL
      );
    `,
  },
  {
    id: "002_docs",
    sql: `
      -- Sürümlü döküman ("Kasa Ürün Kodları"): snapshot = veriden üretilen sayfa, pdf = eski (arşiv) PDF
      CREATE TABLE doc_versions (
        id SERIAL PRIMARY KEY,
        label TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('snapshot', 'pdf')),
        note TEXT NOT NULL DEFAULT '',
        published_at TIMESTAMPTZ,
        published_by TEXT,
        snapshot JSONB,
        pdf_name TEXT,
        pdf BYTEA,
        sort_key INTEGER NOT NULL
      );
    `,
  },
];

export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727002)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const done = new Set((await client.query("SELECT id FROM schema_migrations")).rows.map((r) => r.id as string));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await client.query("COMMIT");
        console.log(`Migrasyon uygulandı: ${m.id}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727002)").catch(() => {});
    client.release();
  }
}
