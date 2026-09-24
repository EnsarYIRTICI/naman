"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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

/** Aramayı kelimelere böler: "dana kıyma" → her iki kelime de adda geçmeli (sıra önemsiz). */
function tokens(raw: string): string[] {
  return normalize(raw.trim()).split(/\s+/).filter(Boolean);
}
function matchesName(name: string, toks: string[]): boolean {
  const n = normalize(name);
  return toks.every((t) => n.includes(t));
}

export default function PublicApp() {
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [raw, setRaw] = useState("");
  const [cat, setCat] = useState<"tumu" | Cat>("tumu");
  const [tab, setTab] = useState<"urunler" | "barkodlar">("urunler");
  const [modal, setModal] = useState<{ name: string; code: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const trimmed = raw.trim();
  const toks = useMemo(() => tokens(raw), [raw]);
  const isDigits = /^\d+$/.test(trimmed);
  const searching = toks.length > 0;
  // Vurgulama için ilk kelime yeterli (tek kelimelik aramalarda tam eşleşme)
  const hlQ = toks[0] ?? "";

  const filtered = useMemo(() => {
    if (!data) return [];
    const list = data.products.filter((p) => {
      if (cat !== "tumu" && getCategory(p.group) !== cat) return false;
      if (!searching) return true;
      if (isDigits) return p.code.includes(trimmed) || splitCode(p.code).typed === trimmed;
      return matchesName(p.name, toks);
    });
    // Rakamla arandığında kasada girilen kodla birebir eşleşen ürün en üste
    if (isDigits) {
      const exact = list.filter((p) => splitCode(p.code).typed === trimmed || p.code === trimmed);
      if (exact.length) return [...exact, ...list.filter((p) => !exact.includes(p))];
    }
    return list;
  }, [data, cat, toks, searching, isDigits, trimmed]);

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

  // Arama "getir", "trendyol", "sodexo" gibi kanal / yemek kartı adıyla eşleşirse onları da göster
  const extra = useMemo(() => {
    if (!data || !searching || isDigits) return [];
    const ch = data.channels.filter((c) => matchesName(c.name, toks)).map((c) => ({ key: "c" + c.id, name: c.name, value: c.code, label: "Sipariş kanalı" }));
    const mc = data.mealCards.filter((m) => matchesName(m.name, toks)).map((m) => ({ key: "m" + m.id, name: m.name, value: m.posName, label: "Yemek kartı" }));
    return [...ch, ...mc];
  }, [data, searching, isDigits, toks]);

  const barcodes = useMemo(() => {
    if (!data) return [];
    if (!searching) return data.barcodes;
    return data.barcodes.filter((b) => (isDigits ? b.code.includes(trimmed) : matchesName(b.name, toks)));
  }, [data, searching, isDigits, trimmed, toks]);

  const clear = () => { setRaw(""); inputRef.current?.focus(); };
  const count = tab === "urunler" ? filtered.length + extra.length : barcodes.length;

  return (
    <div className="pub">
      <div className="head">
        <h1>🛒 Stok Kodu Arama</h1>
        <a className="doclink" href="/dokuman" title="Kod dökümanı">
          📄 Döküman{data?.meta.docVersion ? <span className="dv">{data.meta.docVersion}</span> : null}
        </a>
      </div>

      {offline && <div className="banner">⚠️ Sunucuya ulaşılamadı, cihazda kayıtlı son veri gösteriliyor.</div>}

      <div className="search-box">
        <div className="input-wrap">
          <input
            ref={inputRef} type="search" inputMode="search" value={raw} autoFocus
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") clear(); }}
            placeholder="Ürün adı veya kod (domates, biber sivri, 27)"
            aria-label="Ürün ara"
          />
          {raw && <button type="button" className="clear" onClick={clear} aria-label="Aramayı temizle">✕</button>}
        </div>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button key={c.key} type="button" data-cat={c.key} className={"chip" + (cat === c.key ? " active" : "")} onClick={() => setCat(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="bar">
          <div className="count">
            {error || !data ? error || "Yükleniyor..." : searching ? `${count} sonuç` : `${count} ${tab === "urunler" ? "ürün" : "barkod"}`}
          </div>
          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "urunler"} className={tab === "urunler" ? "on" : undefined} onClick={() => setTab("urunler")}>Ürünler</button>
            <button type="button" role="tab" aria-selected={tab === "barkodlar"} className={tab === "barkodlar" ? "on" : undefined} onClick={() => setTab("barkodlar")}>Barkodlar</button>
          </div>
        </div>
      </div>

      {/* Bilgi alanı: arama yapılırken gizlenir, sonuçlar hemen görünsün */}
      {data && !searching && (
        <details className="info">
          <summary>
            {data.channels.map((c) => (
              <span className="ch" key={c.id}>{c.name} <b className="code">{c.code}</b></span>
            ))}
            <span className="more">Bilgiler</span>
          </summary>
          <div className="info-body">
            <p className="note">Sipariş kanalı: önce müşteri girilir, sonra kod enter&apos;lanır.</p>
            {data.mealCards.length > 0 && (
              <>
                <h3>💳 Yemek kartları</h3>
                {data.mealCards.map((m) => (
                  <div className="row" key={m.id}><span>{m.name}</span><b>{m.posName}</b></div>
                ))}
              </>
            )}
            <h3>ℹ️ Kod nasıl girilir?</h3>
            <p>
              Kod <b>290</b> ile başlıyorsa bu öneki ve baştaki sıfırları girmeyin, sadece{" "}
              <mark className="typed" style={{ marginLeft: 0 }}>sarı</mark> haneleri girin. Örnek: 2900027 → <b>27</b>, 2905083 → <b>5083</b>.
              Kod 290 ile başlamıyorsa (293, 282, 300 vb.) tam kodu girin.
            </p>
          </div>
        </details>
      )}

      {tab === "urunler" ? (
        <div>
          {extra.length > 0 && (
            <ul className="extra">
              {extra.map((x) => (
                <li key={x.key}>
                  <span className="name"><Hl text={x.name} q={hlQ} /> <small>{x.label}</small></span>
                  <span className="code">{x.value}</span>
                </li>
              ))}
            </ul>
          )}
          {data && rows.length === 0 && extra.length === 0 && (
            <div className="empty">
              “{trimmed}” için sonuç yok.{cat !== "tumu" && <> <button type="button" className="link" onClick={() => setCat("tumu")}>Tüm kategorilerde ara</button></>}
            </div>
          )}
          {rows.length > 0 && (
            <ul>
              {rows.map((r) => (
                <Fragment key={r.key}>
                  {r.group !== null && <li className="group-title" data-cat={r.cat}>{r.group}</li>}
                  <li data-cat={r.cat}>
                    <span className="name"><Hl text={r.name} q={hlQ} /></span>
                    <Code code={r.code} />
                  </li>
                </Fragment>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          {data && barcodes.length === 0 && <div className="empty">Barkod bulunamadı</div>}
          {barcodes.map((b) => (
            <button type="button" className="barcode-row" key={b.id} onClick={() => setModal(b)}>
              <span><Hl text={b.name} q={isDigits ? "" : hlQ} /></span><span className="code">{b.code}</span>
            </button>
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
        {data?.meta.updatedAt && <>Son güncelleme: {new Date(data.meta.updatedAt).toLocaleDateString("tr-TR")} · </>}
        Sürüm {APP_VERSION}
      </footer>
    </div>
  );
}
