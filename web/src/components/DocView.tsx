"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { splitCode } from "@/lib/codes";
import { getCategory, type Cat } from "@/lib/text";
import type { DocPublic, DocSnapshot } from "@/lib/types";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("tr-TR") : "";

type P = DocSnapshot["products"][number];
interface Section {
  key: string;
  title: string;
  cat: Cat;
  count: number;
  /** Kasap gibi alt gruplara ayrılan bölümlerde alt başlık, diğerlerinde null */
  parts: { sub: string | null; items: P[] }[];
  cols: number;
}

/**
 * Ürünleri v5 PDF'teki gibi bölümlere ayırır: "Kasap - Şen Piliç", "Kasap - Banvit" ... tek "Kasap"
 * bölümünde marka alt başlıklarıyla toplanır; diğer gruplar kendi bölümüdür.
 */
function buildSections(products: P[]): Section[] {
  const out: Section[] = [];
  const byKey = new Map<string, Section>();
  for (const p of products) {
    const cat = getCategory(p.group);
    const dash = p.group.indexOf(" - ");
    const merged = cat === "kasap" && dash > 0;
    const key = merged ? "kasap" : "g:" + p.group;
    let s = byKey.get(key);
    if (!s) {
      s = { key, title: merged ? p.group.slice(0, dash) : p.group, cat, count: 0, parts: [], cols: 2 };
      byKey.set(key, s);
      out.push(s);
    }
    const sub = merged ? p.group.slice(dash + 3) : null;
    let part = s.parts.find((x) => x.sub === sub);
    if (!part) { part = { sub, items: [] }; s.parts.push(part); }
    part.items.push(p);
    s.count++;
  }
  // Uzun, alt başlıksız listeler 3 sütun (Sebze, Meyve); kısa olanlar ve alt başlıklılar 2 sütun
  for (const s of out) s.cols = s.parts.length === 1 && s.count >= 30 ? 3 : 2;
  return out;
}

function Code({ code }: { code: string }) {
  const { prefix, typed } = splitCode(code);
  return (
    <span className="dcode">
      {typed ? <><span className="pre">{prefix}</span><mark>{typed}</mark></> : <b>{prefix}</b>}
    </span>
  );
}

function Snapshot({ snap }: { snap: DocSnapshot }) {
  const sections = useMemo(() => buildSections(snap.products), [snap]);
  return (
    <>
      <div className="dgrid">
        <section className="dbox">
          <h3>Yemek kartları</h3>
          {snap.mealCards.map((m) => (
            <div className="drow" key={m.name}><span>{m.name}</span><b>{m.posName}</b></div>
          ))}
          {snap.mealCards.length === 0 && <div className="dempty">—</div>}
        </section>
        <section className="dbox">
          <h3>Satış kanalı kodları</h3>
          {snap.channels.map((c) => (
            <div className="drow" key={c.name}><span>{c.name}</span><b className="num">{c.code}</b></div>
          ))}
          {snap.channels.length === 0 && <div className="dempty">—</div>}
        </section>
      </div>

      <section className="dhow">
        <h3>Kod Vurgulama Sistemi — Nasıl Çalışır?</h3>
        <p>
          Ürün kodu 7 hane. İlk 3 hane <span className="num">290</span> ise kasiyer bu öneki ve ardından gelen anlamsız
          (baştaki) sıfırları atlayıp sadece geri kalan anlamlı haneleri girer. Bu haneler <mark>sarı</mark> ile
          vurgulanmıştır. Örnekler: <span className="num">2900027 → 27</span> · <span className="num">2900063 → 63</span> ·{" "}
          <span className="num">2905083 → 5083</span> (baştaki hane sıfır değilse tamamı girilir). Kod 290 ile
          başlamıyorsa (293, 282, 300 vb.) tam kod olduğu gibi girilir, vurgu yapılmaz.
        </p>
      </section>

      {sections.map((s) => (
        <section className="dgroup" data-cat={s.cat} key={s.key}>
          <h2>{s.title} <small>({s.count} ürün)</small></h2>
          {s.parts.map((part) => (
            <div key={part.sub ?? "-"}>
              {part.sub && <h4>{part.sub}</h4>}
              <div className="dcols" style={{ ["--cols" as string]: s.cols }}>
                {part.items.map((p) => (
                  <div className="ditem" key={p.code}>
                    <span className="dname">{p.name}</span>
                    <Code code={p.code} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

/** Döküman yüklenirken gerçek düzenin iskeleti: iki bilgi kutusu, açıklama, bir kategori bölümü. */
export function DocSkeleton() {
  const col = [70, 55, 80, 62, 48, 75, 58, 66];
  return (
    <div className="dskel" aria-busy="true" aria-label="Liste yükleniyor">
      <div className="dgrid">
        {[7, 2].map((n, i) => (
          <div className="dbox" key={i}>
            <div className="sk sk-h" />
            {Array.from({ length: n }, (_, j) => (
              <div className="drow" key={j}><span className="sk" style={{ width: 30 + ((j * 17) % 30) + "%" }} /><span className="sk" style={{ width: "22%" }} /></div>
            ))}
          </div>
        ))}
      </div>
      <div className="sk sk-how" />
      <div className="dgroup sk-group">
        <div className="sk sk-bar" />
        <div className="dcols" style={{ ["--cols" as string]: 3 }}>
          {[0, 1, 2].flatMap((c) => col.map((w, j) => (
            <div className="ditem" key={c + "-" + j}><span className="sk" style={{ width: ((w + c * 9) % 45) + 35 + "%" }} /><span className="sk sk-code" /></div>
          )))}
        </div>
      </div>
    </div>
  );
}

export default function DocView() {
  const params = useSearchParams();
  const v = params.get("v") ?? "";
  const [data, setData] = useState<DocPublic | null>(null);
  const [err, setErr] = useState("");
  const [dlg, setDlg] = useState(false);

  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) { setData(null); setErr(""); }
    try {
      const r = await fetch(`/api/public/doc${v ? `?v=${encodeURIComponent(v)}` : ""}`, { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      setData((await r.json()) as DocPublic);
      setErr("");
    } catch (e) {
      // Sessiz yenilemede hata olursa eldeki liste ekranda kalsın
      if (!quiet) setErr("Döküman yüklenemedi: " + (e as Error).message);
    }
  }, [v]);

  useEffect(() => { void load(false); }, [load]);

  const sel = data?.selected ?? null;
  const live = !!sel?.live;

  // Canlı listede: sekmeye dönüldüğünde ve her dakika sessizce yenile (panelde yapılan değişiklik görünsün)
  useEffect(() => {
    if (!live) return;
    const onVis = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(onVis, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.clearInterval(t); };
  }, [live, load]);

  // Arama sayfasına dönüş: yüklenene kadar gizli (namdoc alan adında göreli "/" dökümanın kendisi olurdu)
  const home = data ? (data.homeUrl ?? "/") : err ? "/" : null;
  // Eski adresler (namdoc.xenny.cloud/?v=v3) çalışmaya devam eder: bağlantılar bulunulan yolu korur
  const base = typeof window !== "undefined" ? location.pathname : "/dokuman";
  const hrefFor = (label: string | null) => (label ? `${base}?v=${encodeURIComponent(label)}` : base);

  return (
    <div className="doc">
      <div className="dhead">
        <div>
          <h1>Kasa Ürün Kodları Listesi</h1>
          <p>
            Manav / Kasap / Şarküteri Referans Tablosu
            {sel && (live ? ` — Güncel liste (${fmtDate(sel.publishedAt)})` : ` — Sürüm ${sel.label}`)}
          </p>
        </div>
        <div className="dactions no-print">
          {home && <a className="dbtn dark" href={home}>← Ürün arama</a>}
          {sel && (
            <>
              <button type="button" className="dbtn" onClick={() => setDlg(true)}>
                {live ? <span className="dchip">Güncel</span> : sel.label} ▾
              </button>
              {sel.kind === "snapshot" ? (
                <button type="button" className="dbtn" onClick={() => window.print()}>Yazdır / PDF kaydet</button>
              ) : (
                <a className="dbtn" href={sel.pdfUrl ?? "#"} download>PDF indir</a>
              )}
            </>
          )}
        </div>
      </div>

      {err && (
        <div className="derr" role="alert">
          <b>Liste yüklenemedi</b>
          <p>İnternet bağlantısını kontrol edip tekrar deneyin.</p>
          <button type="button" className="dbtn dark" onClick={() => void load(false)}>Tekrar dene</button>
        </div>
      )}
      {!data && !err && <DocSkeleton />}

      {sel && !live && (
        <div className="dwarn no-print" role="status">
          <b>Eski sürümü ({sel.label}) görüntülüyorsunuz.</b>
          {sel.note && <> {sel.note}</>} <a href={hrefFor(null)}>Güncel listeye dön</a>
        </div>
      )}

      {sel?.kind === "snapshot" && sel.snapshot && <Snapshot snap={sel.snapshot} />}
      {sel?.kind === "pdf" && sel.pdfUrl && (
        <div className="no-print">
          <iframe src={sel.pdfUrl} title={`Kodlar ${sel.label}`} className="dpdf" />
          <p className="dnote">
            <a href={sel.pdfUrl} target="_blank" rel="noopener">PDF&apos;i yeni sekmede aç</a> (telefonda tüm sayfalar görünmüyorsa)
          </p>
        </div>
      )}

      {sel?.kind === "snapshot" && (
        <p className="dnote">
          {live
            ? <>Bu liste güncel veriden oluşur, yapılan değişiklikler anında yansır.{sel.publishedAt ? ` Son değişiklik: ${fmtDate(sel.publishedAt)}.` : ""}</>
            : <>Sürüm {sel.label} · {fmtDate(sel.publishedAt)}{sel.note ? ` · ${sel.note}` : ""}</>}
        </p>
      )}

      {dlg && data && (
        <div className="dmodal no-print" onClick={(e) => e.target === e.currentTarget && setDlg(false)} role="dialog" aria-label="Sürümler">
          <div className="dmodal-box">
            <div className="dmodal-head">
              <b>Sürümler</b>
              <button type="button" onClick={() => setDlg(false)} aria-label="Kapat">✕</button>
            </div>
            <a className={"dver" + (live ? " on" : "")} href={hrefFor(null)}>
              <span className="dver-top"><b>Güncel liste</b><span className="dchip">Canlı</span></span>
              <span className="dver-note">Her zaman en son veri. Değişiklikler anında görünür.</span>
            </a>
            {data.versions.map((x) => (
              <a key={x.label} className={"dver" + (!live && sel?.label === x.label ? " on" : "")} href={hrefFor(x.label)}>
                <span className="dver-top">
                  <b>{x.label}</b>
                  {x.kind === "pdf" && <span className="dtag">PDF arşiv</span>}
                  <span className="ddate">{fmtDate(x.publishedAt)}</span>
                </span>
                {x.note && <span className="dver-note">{x.note}</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
