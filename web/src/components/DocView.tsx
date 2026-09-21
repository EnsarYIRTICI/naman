"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { splitCode } from "@/lib/codes";
import { getCategory } from "@/lib/text";
import type { DocPublic, DocSnapshot } from "@/lib/types";

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("tr-TR") : "");

function Code({ code }: { code: string }) {
  const { prefix, typed } = splitCode(code);
  return (
    <span className="dcode">
      <span className={typed ? "pre" : undefined}>{prefix}</span>
      {typed && <mark>{typed}</mark>}
    </span>
  );
}

function Snapshot({ snap }: { snap: DocSnapshot }) {
  const groups = useMemo(() => {
    const m = new Map<string, DocSnapshot["products"]>();
    for (const p of snap.products) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return [...m.entries()];
  }, [snap]);
  return (
    <>
      <div className="dgrid">
        <section className="dbox">
          <h3>Yemek kartları</h3>
          {snap.mealCards.map((m) => (<div className="drow" key={m.name}><span>{m.name}</span><b>{m.posName}</b></div>))}
          {snap.mealCards.length === 0 && <div className="dempty">—</div>}
        </section>
        <section className="dbox">
          <h3>Satış kanalı kodları</h3>
          {snap.channels.map((c) => (<div className="drow" key={c.name}><span>{c.name}</span><b>{c.code}</b></div>))}
          {snap.channels.length === 0 && <div className="dempty">—</div>}
        </section>
      </div>

      <section className="dhow">
        <h3>Kod Vurgulama Sistemi — Nasıl Çalışır?</h3>
        <p>
          Ürün kodu 7 hane. İlk 3 hane <b>290</b> ise kasiyer bu öneki ve ardından gelen anlamsız (baştaki) sıfırları atlayıp sadece geri kalan
          anlamlı haneleri girer. Bu haneler <mark>sarı</mark> ile vurgulanmıştır. Örnekler: 2900027 → <b>27</b> · 2900063 → <b>63</b> · 2905083 → <b>5083</b>{" "}
          (baştaki hane sıfır değilse tamamı girilir). Kod 290 ile başlamıyorsa (293, 282, 300 vb.) tam kod olduğu gibi girilir, vurgu yapılmaz.
        </p>
      </section>

      {groups.map(([group, items]) => (
        <section className="dgroup" data-cat={getCategory(group)} key={group}>
          <h2>{group} <small>({items.length} ürün)</small></h2>
          <div className="dcols">
            {items.map((p) => (<div className="ditem" key={p.code}><span>{p.name}</span><Code code={p.code} /></div>))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function DocView() {
  const params = useSearchParams();
  const v = params.get("v") ?? "";
  const [data, setData] = useState<DocPublic | null>(null);
  const [err, setErr] = useState("");
  const [dlg, setDlg] = useState(false);

  useEffect(() => {
    setData(null);
    setErr("");
    fetch(`/api/public/doc${v ? `?v=${encodeURIComponent(v)}` : ""}`, { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json() as Promise<DocPublic>; })
      .then(setData)
      .catch((e: Error) => setErr("Döküman yüklenemedi: " + e.message));
  }, [v]);

  const sel = data?.selected ?? null;
  // Eski adresler (namdoc.xenny.cloud/?v=v3) çalışmaya devam eder: bağlantılar bulunulan yolu korur
  const base = typeof window !== "undefined" ? location.pathname : "/dokuman";
  const hrefFor = (label: string, isCurrent: boolean) => (isCurrent ? base : `${base}?v=${encodeURIComponent(label)}`);

  return (
    <div className="doc">
      <div className="dhead">
        <div>
          <h1>Kasa Ürün Kodları Listesi</h1>
          <p>Manav / Kasap / Şarküteri Referans Tablosu</p>
        </div>
        {sel && (
          <div className="dactions no-print">
            <button type="button" className="dbtn" onClick={() => setDlg(true)}>
              {sel.label}{sel.current && <span className="dchip">Güncel</span>} ▾
            </button>
            {sel.kind === "snapshot" ? (
              <button type="button" className="dbtn" onClick={() => window.print()}>Yazdır / PDF kaydet</button>
            ) : (
              <a className="dbtn" href={sel.pdfUrl ?? "#"} download>PDF indir</a>
            )}
          </div>
        )}
      </div>

      {err && <div className="dwarn">{err}</div>}
      {!data && !err && <div className="dempty">Yükleniyor...</div>}
      {data && !sel && <div className="dempty">Henüz yayınlanmış bir sürüm yok.</div>}

      {sel && !sel.current && (
        <div className="dwarn no-print" role="status">
          <b>Eski sürümü ({sel.label}) görüntülüyorsunuz.</b>{sel.note && <> {sel.note}</>}{" "}
          <a href={hrefFor(data!.versions.find((x) => x.current)?.label ?? "", true)}>Güncel sürüme dön</a>
        </div>
      )}

      {sel?.kind === "snapshot" && sel.snapshot && <Snapshot snap={sel.snapshot} />}
      {sel?.kind === "pdf" && sel.pdfUrl && (
        <div className="no-print">
          <iframe src={sel.pdfUrl} title={`Kodlar ${sel.label}`} className="dpdf" />
          <p className="dnote"><a href={sel.pdfUrl} target="_blank" rel="noopener">PDF&apos;i yeni sekmede aç</a> (telefonda tüm sayfalar görünmüyorsa)</p>
        </div>
      )}

      {sel?.kind === "snapshot" && sel.publishedAt && (
        <p className="dnote">Sürüm {sel.label} · {fmtDate(sel.publishedAt)}{sel.note ? ` · ${sel.note}` : ""}</p>
      )}

      {dlg && data && (
        <div className="dmodal no-print" onClick={(e) => e.target === e.currentTarget && setDlg(false)} role="dialog" aria-label="Sürümler">
          <div className="dmodal-box">
            <div className="dmodal-head"><b>Sürümler</b><button type="button" onClick={() => setDlg(false)} aria-label="Kapat">✕</button></div>
            {data.versions.map((x) => (
              <a key={x.label} className={"dver" + (sel?.label === x.label ? " on" : "")} href={hrefFor(x.label, x.current)}>
                <span className="dver-top"><b>{x.label}</b>{x.current && <span className="dchip">Güncel</span>}{x.kind === "pdf" && <span className="dtag">PDF arşiv</span>}<span className="ddate">{fmtDate(x.publishedAt)}</span></span>
                {x.note && <span className="dver-note">{x.note}</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
