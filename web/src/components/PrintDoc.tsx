"use client";
import { useMemo, type Ref } from "react";
import { splitCode } from "@/lib/codes";
import { buildSections } from "@/lib/docsections";
import {
  FONTS, PAGE_H_PX, fmtPt, shortCols, simulatePages, stripName,
  type FitPages, type Layout, type PrintSettings,
} from "@/lib/printfit";
import type { DocSnapshot } from "@/lib/types";

function PCode({ code }: { code: string }) {
  const { prefix, typed } = splitCode(code);
  return (
    <span className="pcode">
      {typed ? <><span className="pre">{prefix}</span><mark>{typed}</mark></> : <b>{prefix}</b>}
    </span>
  );
}

/**
 * Yazdırılan (A4) döküman. Ekranda görünmez ama A4 genişliğinde yerleşir; böylece sayfa sayısı ölçülebilir.
 * Yazı boyutu ve sütun sayısı CSS değişkenleriyle (--pf, --pcols, --pcols-s) applyLayout ile verilir.
 */
export function PrintDoc({ snap, title, subtitle, info, breakGroups, stripPrefix, innerRef }: {
  snap: DocSnapshot; title: string; subtitle: string; info: boolean; breakGroups: boolean; stripPrefix: boolean; innerRef: Ref<HTMLDivElement>;
}) {
  const sections = useMemo(() => buildSections(snap.products), [snap]);
  return (
    <div className="dprint-wrap" aria-hidden="true">
      <div className="dprint" ref={innerRef}>
        <header className="ph" data-avoid="1">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>
        {info && (
          <div className="pgrid" data-avoid="1">
            <section className="pbox">
              <h3>Yemek kartları</h3>
              {snap.mealCards.map((m) => <div className="prow" key={m.name}><span>{m.name}</span><b>{m.posName}</b></div>)}
            </section>
            <section className="pbox">
              <h3>Satış kanalı kodları</h3>
              {snap.channels.map((c) => <div className="prow" key={c.name}><span>{c.name}</span><b className="num">{c.code}</b></div>)}
            </section>
          </div>
        )}
        {info && (
          <p className="phow" data-avoid="1">
            <b>Kod nasıl girilir?</b> Kod <span className="num">290</span> ile başlıyorsa bu öneki ve baştaki sıfırları girmeyin,
            sadece <mark>sarı</mark> haneleri girin: <span className="num">2900027 → 27</span>, <span className="num">2905083 → 5083</span>.
            Kod 290 ile başlamıyorsa (293, 282, 300 vb.) tam kodu girin.
          </p>
        )}
        {sections.map((s, i) => (
          <section className="pgroup" data-cat={s.cat} key={s.key} data-avoid="1" data-break={breakGroups && i > 0 ? "page" : undefined}>
            <h2>{s.title} <small>({s.count} ürün)</small></h2>
            {s.parts.map((part) => (
              <div key={part.sub ?? "-"}>
                {part.sub && <h4>{part.sub}</h4>}
                <div className={"pcols" + (s.cols === 3 ? " long" : "")}>
                  {part.items.map((p) => (
                    <div className="pitem" key={p.code}>
                      <span className="pname">{stripPrefix ? stripName(p.name) : p.name}</span>
                      <span className="pdots" />
                      <PCode code={p.code} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/** Yazdırılacak öğeye yazı boyutu / sütun sayısı uygular. */
export function applyLayout(el: HTMLElement, font: number, cols: number) {
  el.style.setProperty("--pf", `${font}pt`);
  el.style.setProperty("--pcols", String(cols));
  el.style.setProperty("--pcols-s", String(shortCols(cols)));
}

/** Verilen düzende kaç A4 sayfa tutacağını ölçer (yaklaşık). */
export function measurePages(el: HTMLElement, font: number, cols: number): number {
  applyLayout(el, font, cols);
  const kids = [...el.children] as HTMLElement[];
  if (!kids.length) return 1;
  const rects = kids.map((k) => k.getBoundingClientRect());
  const bottom = el.getBoundingClientRect().bottom;
  const blocks = kids.map((k, i) => ({
    h: (i + 1 < kids.length ? rects[i + 1]!.top : bottom) - rects[i]!.top,
    breakBefore: k.dataset.break === "page",
    avoid: k.dataset.avoid === "1",
  }));
  // Küçük pay: tarayıcılar arası yazı/satır farkları
  return simulatePages(blocks, PAGE_H_PX * 0.985);
}

export type Presets = Record<FitPages, Layout & { fits: boolean }>;

/** Yazdırma düzeni penceresi: 2 / 3 / 4 sayfaya sığdır ya da elle yazı boyutu + sütun. */
export function PrintDialog({ settings, onChange, layout, presets, onPrint, onClose }: {
  settings: PrintSettings;
  onChange: (s: PrintSettings) => void;
  layout: Layout | null;
  presets: Presets | null;
  onPrint: () => void;
  onClose: () => void;
}) {
  const set = (p: Partial<PrintSettings>) => onChange({ ...settings, ...p });
  return (
    <div className="dmodal no-print" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label="Yazdırma düzeni">
      <div className="dmodal-box pdlg">
        <div className="dmodal-head">
          <b>Yazdırma / PDF düzeni</b>
          <button type="button" onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <p className="pdlg-note">Listenin kaç sayfaya sığacağını seçin; yazı boyutu buna göre otomatik ayarlanır. Ürün sayısı değiştikçe yazı boyutu da değişir.</p>
        <div className="pdlg-opts">
          {([2, 3, 4] as FitPages[]).map((n) => {
            const pr = presets?.[n];
            const on = settings.mode === "fit" && settings.pages === n;
            return (
              <button type="button" key={n} className={"popt" + (on ? " on" : "")} onClick={() => set({ mode: "fit", pages: n })} data-testid={`fit-${n}`}>
                <b>{n} sayfa</b>
                <span>
                  {!pr ? "hesaplanıyor…" : pr.fits ? `yazı ${fmtPt(pr.font)} pt · ${pr.cols} sütun` : `sığmıyor (en az ${pr.pages} sayfa)`}
                </span>
              </button>
            );
          })}
          <button type="button" className={"popt" + (settings.mode === "custom" ? " on" : "")} onClick={() => set({ mode: "custom" })} data-testid="fit-custom">
            <b>Özel</b>
            <span>yazı ve sütunu siz seçin</span>
          </button>
        </div>
        {settings.mode === "custom" && (
          <div className="pdlg-row">
            <label>Yazı boyutu{" "}
              <select value={settings.font} onChange={(e) => set({ font: Number(e.target.value) })}>
                {FONTS.map((f) => <option key={f} value={f}>{fmtPt(f)} pt</option>)}
              </select>
            </label>
            <label>Sütun{" "}
              <select value={settings.cols} onChange={(e) => set({ cols: Number(e.target.value) as 2 | 3 | 4 })}>
                {[2, 3, 4].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="pdlg-row col">
          <label><input type="checkbox" checked={settings.info} onChange={(e) => set({ info: e.target.checked })} /> Yemek kartı, kanal kodları ve &quot;kod nasıl girilir&quot; kutusu</label>
          <label><input type="checkbox" checked={settings.stripPrefix} onChange={(e) => set({ stripPrefix: e.target.checked })} /> Ürün adlarının başındaki &quot;MNV.&quot; / &quot;MN.&quot; yazılmasın (daha az satır kaydırma, daha büyük yazı)</label>
          <label><input type="checkbox" checked={settings.breakGroups} onChange={(e) => set({ breakGroups: e.target.checked })} /> Her bölüm (Sebze, Meyve…) yeni sayfadan başlasın</label>
        </div>
        {layout && (
          <div className="pdlg-sum" data-testid="print-summary">
            Tahmini <b>{layout.pages} sayfa</b> · yazı <b>{fmtPt(layout.font)} pt</b> · {layout.cols} sütun
            <div className="pdlg-sample" style={{ fontSize: `${layout.font}pt` }}>
              <span>MNV.DOMATES PEMBE KG</span><span className="pdots" /><span className="pcode"><span className="pre">290</span><mark>5083</mark></span>
            </div>
          </div>
        )}
        <p className="pdlg-note small">
          Sayfa sayısı tahminidir (±1). Tarayıcının yazdırma ekranında kağıt <b>A4</b>, ölçek <b>%100 / Varsayılan</b> olmalı;
          PDF için hedef olarak &quot;PDF olarak kaydet&quot;i seçin.
        </p>
        <div className="pdlg-actions">
          <button type="button" className="dbtn dark" onClick={onPrint} disabled={!layout}>Yazdır / PDF kaydet</button>
          <button type="button" className="dbtn" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}
