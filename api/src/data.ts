import type { Pool, PoolClient } from "pg";
import { SECTIONS, type SectionCfg, type SectionKey } from "./sections";

type Q = Pool | PoolClient;
export type Row = Record<string, string | number>;
export type AllData = Record<SectionKey, Row[]>;

function selectSql(cfg: SectionCfg): string {
  const cols = cfg.props.map((p) => `t.${p.col} AS "${p.prop}"`).join(", ");
  if (cfg.key === "products") {
    // Grupların sırası: gruptaki ilk ürünün sırasına göre; grup içinde kendi sırası
    return `SELECT t.id, ${cols} FROM products t
              JOIN (SELECT group_name, MIN(sort_order) AS r FROM products GROUP BY group_name) g ON g.group_name = t.group_name
             ORDER BY g.r, t.sort_order, t.id`;
  }
  return `SELECT t.id, ${cols} FROM ${cfg.table} t ORDER BY t.sort_order, t.id`;
}

export async function loadAll(q: Q): Promise<AllData> {
  const out = {} as AllData;
  for (const cfg of SECTIONS) out[cfg.key] = (await q.query(selectSql(cfg))).rows as Row[];
  return out;
}

export async function loadSection(q: Q, cfg: SectionCfg): Promise<Row[]> {
  return (await q.query(selectSql(cfg))).rows as Row[];
}

export async function getVersion(q: Q): Promise<number> {
  const r = await q.query("SELECT value FROM settings WHERE key = 'data_version'");
  return Number(r.rows[0]?.value ?? 0);
}

export async function lastChangeAt(q: Q): Promise<string | null> {
  const r = await q.query("SELECT MAX(at) AS at FROM changes");
  return r.rows[0]?.at ? new Date(r.rows[0].at).toISOString() : null;
}

/** Veri sürümünü 1 artırır ve değişiklik kaydı yazar (transaction içinde çağırın). */
export async function bumpVersion(client: PoolClient, username: string | null, summary: string): Promise<number> {
  const r = await client.query(
    "UPDATE settings SET value = (value::int + 1)::text WHERE key = 'data_version' RETURNING value",
  );
  const v = Number(r.rows[0].value);
  await client.query("INSERT INTO changes (username, summary, version) VALUES ($1, $2, $3)", [username, summary, v]);
  return v;
}

export async function withTx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
