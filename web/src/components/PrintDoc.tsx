"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { splitCode } from "@/lib/codes";
import { buildSections } from "@/lib/docsections";
import {
  SIZE_LABEL, STYLES, fmtPt, paginate, stripName,
  type FlowSection, type Page, type PrintSettings, type PrintSize, type PrintStyle,
} from "@/lib/printfit";
import type { Cat } from "@/lib/text";
import type { DocSnapshot } from "@/lib/types";

/** Yazdırılacak bölüm: başlık + sırayla alt başlıklar ve ürün satırları */
interface Entry { kind: "row" | "sub"; text: string; code?: string }
interface PSection { title: string; cat: Cat; count: number; entries: Entry[] }
export interface PrintPlan { pages: Page[]; sections: PSection[] }

function toSections(snap: DocSnapshot, strip: boolean): PSection[] {
  return buildSections(snap.products).map((s) => ({
    title: s.title,
    cat: s.cat,
    count: s.count,
    entries: s.parts.flatMap((part) => [
      ...(part.sub ? [{ kind: "sub" as const, text: part.sub }] : []),
      ...part.items.map((p) => ({ kind: "row" as const, text: strip ? stripName(p.name) : p.name, code: p.code })),
    ]),
  }));
}

function PCode({ code }: { code: string }) {
  const { prefix, typed } = splitCode(code);
  return (
    <span className="pc-code">
      {typed ? <><span className="pre">{prefix}</span><mark>{typed}</mark></> : <b>{prefix}</b>}
    </span>
  );
}

const pageVars = (s: PrintSettings) => {
  const st = STYLES[s.style];
  const land = st.orient === "landscape";
  return {
    ["--pw" as string]: land ? "297mm" : "210mm",
    ["--ph" as string]: land ? "210mm" : "297mm",
    ["--n" as string]: st.cols,
    ["--pf" as string]: `${st.font[s.size]}pt`,
  };
};

function Info({ snap }: { snap: DocSnapshot }) {
  return (
    <div className="pc-info">
      <div className="pc-tbl">
        <div className="pc-th dark"><span>Yemek kartı</span><span>Kasada seçilecek</span></div>
        {snap.mealCards.map((m, i) => <div className={"pc-tr" + (i % 2 ? " z" : "")} key={m.name}><span>{m.name}</span><b>{m.posName}</b></div>)}
      </div>
      <div className="pc-tbl">
        <div className="pc-th dark"><span>Satış kanalı</span><span>Kod</span></div>
        {snap.channels.map((c, i) => <div className={"pc-tr" + (i % 2 ? " z" : "")} key={c.name}><span>{c.name}</span><b className="num">{c.code}</b></div>)}
      </div>
      <div className="pc-how">
        <b>Kod nasıl girilir?</b> Kod <span className="num">290</span> ile başlıyorsa bu öneki ve baştaki sıfırları girmeyin,
        sadece <mark>sarı</mark> haneleri girin: <span className="num">2900027 → 27</span>, <span className="num">2905083 → 5083</span>.
        290 ile başlamıyorsa (293, 282, 300 vb.) kodun tamamı girilir.
      </div>
    </div>
  );
}

function SecHead({ s, cont }: { s: PSection; cont: boolean }) {
  return <div className="pc-head">{s.title} <small>{cont ? "(devam)" : `(${s.count} ürün)`}</small></div>;
}
function Row({ e, z }: { e: Entry; z: boolean }) {
  if (e.kind === "sub") return <div className="pc-sub">{e.text}</div>;
  return <div className={"pc-tr" + (z ? " z" : "")}><span className="pc-name">{e.text}</span><PCode code={e.code!} /></div>;
}

/**
 * Görünmez ölçüm alanı: örnek bir sayfa (sütun yüksekliği için) ve sütun genişliğinde tüm satırlar.
 * Ölçümden sonra sayfalar kurulur ve onPlan ile bildirilir. Ayar ya da veri değişince yeniden ölçülür.
 */
export function PrintMeasure({ snap, settings, onPlan }: {
  snap: DocSnapshot; settings: PrintSettings; onPlan: (p: PrintPlan) => void;
}) {
  const sections = useMemo(() => toSections(snap, settings.stripPrefix), [snap, settings.stripPrefix]);
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onPlan);
  cb.current = onPlan;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const h = (el: Element | null) => (el ? el.getBoundingClientRect().height : 0);
    const colH = h(root.querySelector(".pm-sample .pc-body"));
    const headH = h(root.querySelector(".pm-head"));
    const gap = h(root.querySelector(".pm-gap"));
    const infoH = settings.info ? h(root.querySelector(".pm-info")) : null;
    const flow: FlowSection[] = sections.map((_, si) => ({
      items: [...root.querySelectorAll(`[data-s="${si}"] > *`)].map((el, i) => ({
        kind: el.classList.contains("pc-sub") ? ("sub" as const) : ("row" as const),
        h: h(el),
        ref: i,
      })),
    }));
    const pages = paginate(flow, { cols: STYLES[settings.style].cols, colH: colH - 1, headH, gap, infoH });
    cb.current({ pages, sections });
  }, [sections, settings]);

  return (
    <div className="pm-wrap" aria-hidden="true">
      <div className="pm" ref={ref} style={pageVars(settings)}>
        <div className="pc-page pm-sample">
          <PageHead title="" sub="" />
          <div className="pc-body"><div className="pc-col" /></div>
          <div className="pc-foot">Sayfa 1 / 1</div>
        </div>
        <div className="pm-col">
          <div className="pm-head"><SecHead s={sections[0] ?? { title: "X", cat: "diger", count: 0, entries: [] }} cont={false} /></div>
          <div className="pm-gap pc-gap" />
          {settings.info && <div className="pm-info"><Info snap={snap} /></div>}
          {sections.map((s, si) => (
            <div key={si} data-s={si}>
              {s.entries.map((e, i) => <Row key={i} e={e} z={false} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="pc-top">
      <b>{title || "KASA ÜRÜN KODLARI LİSTESİ"}</b>
      <span>{sub || "Manav / Kasap / Şarküteri"}</span>
    </div>
  );
}

/** Kurulmuş sayfaları çizer (yazdırma alanı ve önizleme için aynı bileşen). */
export function PrintPages({ plan, snap, settings, subtitle }: {
  plan: PrintPlan; snap: DocSnapshot; settings: PrintSettings; subtitle: string;
}) {
  const total = plan.pages.length;
  return (
    <div className="pc" style={pageVars(settings)}>
      {plan.pages.map((pg, pi) => (
        <div className="pc-page" key={pi}>
          <PageHead title="KASA ÜRÜN KODLARI LİSTESİ" sub={subtitle} />
          <div className="pc-body">
            {pg.columns.map((col, ci) => (
              <div className="pc-col" key={ci}>
                {col.map((b, bi) => {
                  if (b.kind === "info") return <Info key={bi} snap={snap} />;
                  const s = plan.sections[b.sec]!;
                  let z = 0;
                  return (
                    <div className={"pc-sec" + (bi < col.length - 1 ? " pc-gap-after" : "")} data-cat={s.cat} key={bi}>
                      <SecHead s={s} cont={b.cont} />
                      {b.items.map((it) => {
                        const e = s.entries[it.ref]!;
                        const zebra = e.kind === "row" ? z++ % 2 === 1 : false;
                        if (e.kind === "sub") z = 0;
                        return <Row key={it.ref} e={e} z={zebra} />;
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="pc-foot">Sayfa {pi + 1} / {total}</div>
        </div>
      ))}
    </div>
  );
}

/** Yazdırma penceresi: tarz + yazı boyutu seçimi, gerçek sayfaların önizlemesi. Sayfa sayısı sonuçtur, seçilmez. */
export function PrintDialog({ settings, onChange, plan, snap, subtitle, onPrint, onClose }: {
  settings: PrintSettings;
  onChange: (s: PrintSettings) => void;
  plan: PrintPlan | null;
  snap: DocSnapshot;
  subtitle: string;
  onPrint: () => void;
  onClose: () => void;
}) {
  const set = (p: Partial<PrintSettings>) => onChange({ ...settings, ...p });
  const st = STYLES[settings.style];
  return (
    <div className="dmodal no-print" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label="Yazdırma düzeni">
      <div className="dmodal-box pdlg">
        <div className="dmodal-head">
          <b>Yazdır / PDF</b>
          <button type="button" onClick={onClose} aria-label="Kapat">✕</button>
        </div>

        <div className="pdlg-label">Tarz</div>
        <div className="pdlg-opts">
          {(Object.keys(STYLES) as PrintStyle[]).map((k) => {
            const c = STYLES[k];
            return (
              <button type="button" key={k} className={"popt" + (settings.style === k ? " on" : "")} onClick={() => set({ style: k })} data-testid={`style-${k}`}>
                <span className={"pthumb " + c.orient} aria-hidden="true">
                  {Array.from({ length: c.cols }, (_, i) => <i key={i} />)}
                </span>
                <b>{c.label}</b>
                <span>{c.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="pdlg-label">Yazı boyutu</div>
        <div className="pseg" role="group" aria-label="Yazı boyutu">
          {(Object.keys(SIZE_LABEL) as PrintSize[]).map((k) => (
            <button type="button" key={k} className={settings.size === k ? "on" : ""} onClick={() => set({ size: k })} data-testid={`size-${k}`}>
              {SIZE_LABEL[k]} <small>{fmtPt(st.font[k])} pt</small>
            </button>
          ))}
        </div>

        <div className="pdlg-row col">
          <label><input type="checkbox" checked={settings.info} onChange={(e) => set({ info: e.target.checked })} /> Yemek kartı, kanal kodları ve &quot;kod nasıl girilir&quot; kutusu</label>
          <label><input type="checkbox" checked={settings.stripPrefix} onChange={(e) => set({ stripPrefix: e.target.checked })} /> Ürün adlarının başındaki &quot;MNV.&quot; / &quot;MN.&quot; yazılmasın</label>
        </div>

        <div className="pdlg-sum" data-testid="print-summary">
          {plan ? <>Bu ayarla <b>{plan.pages.length} sayfa</b> · {st.orient === "landscape" ? "yatay" : "dikey"} A4 · yazı {fmtPt(st.font[settings.size])} pt</> : "Hazırlanıyor…"}
        </div>
        <div className={"ppreview " + st.orient} aria-label="Önizleme">
          {plan && <PrintPages plan={plan} snap={snap} settings={settings} subtitle={subtitle} />}
        </div>

        <p className="pdlg-note small">
          Tarayıcının yazdırma ekranında kağıt <b>A4</b>, ölçek <b>Varsayılan / %100</b> olmalı. PDF için hedef olarak &quot;PDF olarak kaydet&quot;i seçin.
        </p>
        <div className="pdlg-actions">
          <button type="button" className="dbtn dark" onClick={onPrint} disabled={!plan} data-testid="print-go">Yazdır / PDF kaydet</button>
          <button type="button" className="dbtn" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}
