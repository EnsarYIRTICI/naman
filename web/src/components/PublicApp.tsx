"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { splitCode } from "@/lib/codes";
import { CATEGORIES, getCategory, normalize, splitMatch, type Cat } from "@/lib/text";
import type { PublicData } from "@/lib/types";
import { APP_VERSION } from "@/lib/version";
import Barcode from "./Barcode";

const CACHE_KEY = "naman:data";

function Hl({ text, q }: { text: string; q: string }) {
  const m = splitMatch(text, q);
  if (!m) return <>{text}</>;
  return (<>{m[0]}<mark className="hl">{m[1]}</mark>{m[2]}</>);
}

function Code({ code }: { code: string }) {
  const { prefix, typed } = splitCode(code);
  return (
    <span className="code">
      <span className={typed ? "pre" : undefined}>{prefix}</span>
      {typed && <mark className="typed">{typed}</mark>}
    </span>
  );
}

export default function PublicApp() {
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [raw, setRaw] = useState("");
  const [cat, setCat] = useState<"tumu" | Cat>("tumu");
  const [tab, setTab] = useState<"urunler" | "barkodlar">("urunler");
  const [modal, setModal] = useState<{ name: string; code: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/public/data", { cache: "no-cache" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const d = (await res.json()) as PublicData;
        setData(d);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch {}
      } catch (e) {
        // Sunucuya ulaşılamıyorsa son kaydedilen veriyle çalış (kasada internet kesilebilir)
        try {
          const c = localStorage.getItem(CACHE_KEY);
          if (c) {
            setData(JSON.parse(c) as PublicData);
            setOffline(true);
            return;
          }
        } catch {}
        setError("Veri yüklenemedi: " + (e as Error).message);
      }
    })();
  }, []);

  const q = normalize(raw.trim());
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.products.filter((p) => {
      if (cat !== "tumu" && getCategory(p.group) !== cat) return false;
      if (!q) return true;
      return normalize(p.name).includes(q) || p.code.includes(raw.trim());
    });
  }, [data, cat, q, raw]);

  const rows = useMemo(() => {
    const out: { group: string | null; cat: Cat; name: string; code: string; key: number }[] = [];
    let last: string | null = null;
    for (const p of filtered) {
      const c = getCategory(p.group);
      out.push({ group: p.group !== last ? p.group : null, cat: c, name: p.name, code: p.code, key: p.id });
      last = p.group;
    }
    return out;
  }, [filtered]);

  return (
    <div className="pub">
      <h1>
        🛒 Stok Kodu Arama
        {data && <span className="badge">v{data.meta.version}</span>}
      </h1>

      {offline && <div className="banner">⚠️ Sunucuya ulaşılamadı, cihazda kayıtlı son veri gösteriliyor.</div>}

      <div className="search-box">
        <input
          type="text" value={raw} onChange={(e) => setRaw(e.target.value)} autoFocus
          placeholder="Ürün adı veya kod yazın (örn: domates, tavuk, peynir, 2900104)"
        />
        <div className="count">
          {error || !data ? error || "Yükleniyor..." : q ? `${filtered.length} sonuç bulundu` : `${filtered.length} ürün listeleniyor`}
        </div>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button key={c.key} type="button" data-cat={c.key} className={"chip" + (cat === c.key ? " active" : "")} onClick={() => setCat(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <>
          <div className="info-box">
            <div className="row" style={{ fontWeight: 700, color: "var(--accent)" }}>📦 Sipariş Kanalı Kodları</div>
            {data.channels.map((c) => (
              <div className="row" key={c.id}><span>{c.name}</span><span className="code">{c.code}</span></div>
            ))}
            <div className="note">Not: Önce müşteri girilir, sonra kod enter&apos;lanır.</div>
          </div>

          {data.mealCards.length > 0 && (
            <details className="info-box">
              <summary>💳 Yemek Kartları</summary>
              {data.mealCards.map((m) => (
                <div className="row" key={m.id}><span>{m.name}</span><b>{m.posName}</b></div>
              ))}
            </details>
          )}

          <details className="info-box">
            <summary>ℹ️ Kod nasıl girilir?</summary>
            <p>
              Ürün kodu <b>290</b> ile başlıyorsa bu öneki ve baştaki sıfırları girmeyin, sadece{" "}
              <mark className="typed" style={{ marginLeft: 0 }}>sarı</mark> haneleri girin. Örnek: 2900027 → <b>27</b> · 2905083 → <b>5083</b>.
              Kod 290 ile başlamıyorsa (293, 282, 300 vb.) tam kodu girin.
            </p>
          </details>
        </>
      )}

      <div className="tabs">
        <button type="button" className={"tab" + (tab === "urunler" ? " active" : "")} onClick={() => setTab("urunler")}>Ürünler</button>
        <button type="button" className={"tab" + (tab === "barkodlar" ? " active" : "")} onClick={() => setTab("barkodlar")}>Barkodlar</button>
      </div>

      {tab === "urunler" ? (
        <div>
          {data && rows.length === 0 && <div className="empty">Sonuç bulunamadı</div>}
          {rows.length > 0 && (
            <ul>
              {rows.map((r) => (
                <Fragment key={r.key}>
                  {r.group !== null && <li className="group-title" data-cat={r.cat} style={{ display: "block", borderLeft: 0 }}>{r.group}</li>}
                  <li data-cat={r.cat}>
                    <span className="name"><Hl text={r.name} q={q} /></span>
                    <Code code={r.code} />
                  </li>
                </Fragment>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          {data && data.barcodes.length === 0 && <div className="empty">Barkod bulunamadı</div>}
          {data?.barcodes.map((b) => (
            <div className="barcode-row" key={b.id} onClick={() => setModal(b)}>
              <span>{b.name}</span><span className="code">{b.code}</span>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal-content">
            <div className="modal-label">{modal.name}</div>
            <Barcode value={modal.code} />
            <div><button type="button" onClick={() => setModal(null)}>Kapat</button></div>
          </div>
        </div>
      )}

      <footer>
        Sürüm {APP_VERSION}
        {data?.meta.updatedAt && ` · Veri ${new Date(data.meta.updatedAt).toLocaleDateString("tr-TR")} tarihli`}
        {" · "}<a href="/dokuman" style={{ textDecoration: "underline" }}>Kod dökümanı</a>
      </footer>
    </div>
  );
}
