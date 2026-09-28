"use client";
import { useMemo, useState } from "react";
import { ApiError, send } from "@/lib/api";
import { readProductFile, suggestGroup, type FileItem, type ParsedFile } from "@/lib/productfile";
import { getCategory } from "@/lib/text";
import type { ImportResponse, Product } from "@/lib/types";
import FilePicker from "./FilePicker";

type VisMode = "active" | "all" | "none";
const CAT_LABEL: Record<string, string> = { sebze: "Sebze", meyve: "Meyve", kasap: "Kasap", sarkuteri: "Şarküteri", diger: "Diğer" };
const card = "rounded-lg border border-neutral-200 bg-white p-4";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-neutral-400";

/**
 * Dosyadan ürün ekle: sipariş evrakı (xlsx), CSV ya da JSON yüklenir; dosyadaki kodlardan sistemde OLMAYANLAR eklenir.
 * Sistemde zaten olan kodlara dokunulmaz. Yeni ürünlerin görünür/gizli olacağı ve grubu eklemeden önce seçilir.
 */
export default function AddProductsPanel({ products, onChanged }: { products: Product[]; onChanged: () => Promise<void> }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [groupMap, setGroupMap] = useState<Record<string, string>>({});
  const [rowGroup, setRowGroup] = useState<Record<string, string>>({});
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [visMode, setVisMode] = useState<VisMode>("active");
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const byCode = useMemo(() => new Map(products.map((p) => [p.code, p])), [products]);
  const allGroups = useMemo(() => [...new Set(products.map((p) => p.group))], [products]);
  const items = parsed?.items ?? [];
  const newItems = useMemo(() => items.filter((i) => !byCode.has(i.code)), [items, byCode]);
  const oldItems = useMemo(() => items.filter((i) => byCode.has(i.code)), [items, byCode]);
  const fileGroups = useMemo(() => [...new Set(items.map((i) => i.fileGroup))], [items]);
  const hasActivity = (parsed?.activityCols.length ?? 0) > 0;
  const reshow = oldItems.filter((i) => i.active && byCode.get(i.code)?.visible === false);

  const target = (it: FileItem) => (rowGroup[it.code] ?? groupMap[it.fileGroup] ?? "").trim();
  const visFor = (mode: VisMode, it: FileItem) => (mode === "all" ? true : mode === "none" ? false : !!it.active);
  const applyVisMode = (mode: VisMode, list: FileItem[] = newItems) => {
    setVisMode(mode);
    setVisible(Object.fromEntries(list.map((it) => [it.code, visFor(mode, it)])));
  };

  function reset() {
    setParsed(null);
    setFileName("");
    setGroupMap({});
    setRowGroup({});
    setInclude({});
    setVisible({});
  }

  async function onFile(file: File | undefined) {
    setErr("");
    setOkMsg("");
    reset();
    if (!file) return;
    setBusy(true);
    try {
      const p = await readProductFile(file);
      setFileName(file.name);
      setParsed(p);
      const groups = [...new Set(p.items.map((i) => i.fileGroup))];
      setGroupMap(Object.fromEntries(groups.map((g) => [g, suggestGroup(g, p.items.filter((i) => i.fileGroup === g), products)])));
      const fresh = p.items.filter((i) => !byCode.has(i.code));
      setInclude(Object.fromEntries(fresh.map((i) => [i.code, true])));
      // Sipariş/satış sütunu varsa: miktarı olanlar görünür, diğerleri gizli. Yoksa hepsi görünür.
      const mode: VisMode = p.activityCols.length ? "active" : "all";
      setVisMode(mode);
      setVisible(Object.fromEntries(fresh.map((it) => [it.code, visFor(mode, it)])));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const chosen = newItems.filter((i) => include[i.code]);
  const missingGroup = chosen.filter((i) => !target(i));

  async function apply() {
    if (!chosen.length || missingGroup.length) return;
    setBusy(true);
    setErr("");
    try {
      const data = { products: chosen.map((i) => ({ code: i.code, name: i.name, group: target(i), visible: !!visible[i.code] })) };
      const r = await send<ImportResponse>("POST", "/api/admin/import", { mode: "add", dry: false, data });
      const added = r.sections.find((s) => s.key === "products")?.added ?? 0;
      const vis = chosen.filter((i) => visible[i.code]).length;
      setOkMsg(
        added
          ? `${added} ürün eklendi (${vis} görünür, ${chosen.length - vis} gizli). Veri sürümü: v${r.version}. Gizli ürünleri "Ürünler" sekmesinden istediğiniz zaman açabilirsiniz.`
          : "Eklenecek yeni ürün yoktu (hepsi sistemde zaten var).",
      );
      reset();
      await onChanged();
    } catch (e) {
      const a = e as ApiError;
      setErr([a.message, ...(a.details ?? [])].join("\n"));
    } finally {
      setBusy(false);
    }
  }

  async function showExisting() {
    setBusy(true);
    setErr("");
    try {
      await send("POST", "/api/admin/products-visibility", { ids: reshow.map((i) => byCode.get(i.code)!.id), visible: true });
      setOkMsg(`${reshow.length} mevcut ürün görünür yapıldı.`);
      await onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const allIncluded = newItems.length > 0 && newItems.every((i) => include[i.code]);
  const allVisible = chosen.length > 0 && chosen.every((i) => visible[i.code]);

  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="m-0 mb-1 text-sm font-semibold">Dosyadan ürün ekle</h3>
        <p className="m-0 mb-3 text-xs leading-relaxed text-neutral-500">
          Manav sipariş evrakı gibi bir liste yükleyin: <b>Excel (.xlsx)</b>, <b>CSV / TXT</b> ya da <b>JSON</b>. Dosyada <b>Stok Kodu</b> ve{" "}
          <b>Stok Adı</b> (ya da Kod / Ürün Adı) sütunları olmalı; &quot;Ürün Grubu: …&quot; satırları ve Grup sütunu tanınır.
          Sistemde <b>olmayan</b> kodlar eklenir, <b>olanlara dokunulmaz</b>. Eklemeden önce önizleme gösterilir.
        </p>
        <FilePicker accept=".xlsx,.xlsm,.csv,.txt,.tsv,.json" formats="Excel (.xlsx) · CSV / TXT · JSON" fileName={fileName}
          disabled={busy} onFile={onFile} testId="add-file" />
        <p className="m-0 mt-2 text-xs text-neutral-400">Eski .xls dosyalarını Excel&apos;de &quot;Farklı Kaydet → .xlsx&quot; ile kaydedip yükleyin. PDF&apos;ten okunamaz.</p>
      </div>

      {err && <div className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</div>}
      {okMsg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800" data-testid="add-ok">{okMsg}</div>}

      {parsed && (
        <>
          <div className={card} data-testid="add-summary">
            <h3 className="m-0 mb-2 text-sm font-semibold">{fileName}{parsed.sheet ? ` — ${parsed.sheet}` : ""}</h3>
            <div className="text-sm">
              Dosyada <b>{items.length}</b> ürün: <span className="font-semibold text-green-700">{newItems.length} yeni</span> ·{" "}
              <span className="text-neutral-600">{oldItems.length} sistemde zaten var (dokunulmayacak)</span>
            </div>
            {parsed.warnings.length > 0 && (
              <details className="mt-2 text-xs text-amber-700">
                <summary className="cursor-pointer">{parsed.warnings.length} uyarı</summary>
                <ul className="m-0 mt-1 list-disc pl-5">{parsed.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
            {reshow.length > 0 && (
              <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                Sistemde <b>gizli</b> olan {reshow.length} ürünün bu dosyada siparişi/satışı var ({reshow.slice(0, 4).map((i) => i.name).join(", ")}{reshow.length > 4 ? " …" : ""}).{" "}
                <button type="button" disabled={busy} onClick={showExisting} className="ml-1 rounded-md border border-amber-400 bg-white px-2 py-0.5 font-semibold">Bunları görünür yap</button>
              </div>
            )}
          </div>

          {newItems.length > 0 && (
            <>
              <div className={card}>
                <h3 className="m-0 mb-2 text-sm font-semibold">1. Gruplar</h3>
                <p className="m-0 mb-2 text-xs text-neutral-500">Dosyadaki her grup için sistemde hangi gruba ekleneceğini seçin (mevcut bir grubu seçin ya da yeni ad yazın).</p>
                <datalist id="add-groups">{allGroups.map((g) => <option key={g} value={g} />)}</datalist>
                <div className="space-y-2">
                  {fileGroups.filter((g) => newItems.some((i) => i.fileGroup === g)).map((g) => {
                    const tg = (groupMap[g] ?? "").trim();
                    const cat = getCategory(tg);
                    const n = newItems.filter((i) => i.fileGroup === g).length;
                    return (
                      <div key={g} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-[180px]">Dosyada: <b>{g || "(grupsuz)"}</b> <span className="text-xs text-neutral-500">({n} yeni)</span></span>
                        <span className="text-neutral-400">→</span>
                        <input className={inp + " max-w-[240px]"} list="add-groups" value={groupMap[g] ?? ""} placeholder="Grup adı"
                          aria-label={`${g || "grupsuz"} için sistem grubu`}
                          onChange={(e) => setGroupMap({ ...groupMap, [g]: e.target.value })} />
                        {tg && (
                          <span className={"text-xs " + (cat === "diger" ? "text-amber-700" : "text-neutral-500")}>
                            {allGroups.includes(tg) ? "mevcut grup" : "yeni grup"} · kategori: {CAT_LABEL[cat]}
                            {cat === "diger" && " (kasa sayfasında sadece “Tümü”de görünür; adında Sebze/Meyve geçerse o kategoriye girer)"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={card}>
                <h3 className="m-0 mb-2 text-sm font-semibold">2. Görünürlük</h3>
                <p className="m-0 mb-2 text-xs text-neutral-500">Gizli ürünler sisteme kaydedilir ama kasa sayfasında ve dökümanda çıkmaz; sonra &quot;Ürünler&quot; sekmesinden açabilirsiniz.</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {([
                    ...(hasActivity ? [["active", "Siparişi / satışı olanlar görünür", "Sipariş veya satış miktarı 0'dan büyük olanlar görünür, diğerleri gizli."]] : []),
                    ["all", "Hepsi görünür", "Eklenen tüm ürünler kasa sayfasında görünür."],
                    ["none", "Hepsi gizli", "Hepsi eklenir ama gizli kalır; kullandıklarınızı sonra açarsınız."],
                  ] as [VisMode, string, string][]).map(([m, label, desc]) => (
                    <label key={m} className="flex max-w-[280px] cursor-pointer items-start gap-2">
                      <input type="radio" name="vismode" checked={visMode === m} onChange={() => applyVisMode(m)} className="mt-1" />
                      <span><b>{label}</b><span className="block text-xs text-neutral-500">{desc}</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={card}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-sm font-semibold">3. Eklenecek ürünler</h3>
                  <span className="text-xs text-neutral-500">
                    {chosen.length} eklenecek · {chosen.filter((i) => visible[i.code]).length} görünür · {chosen.filter((i) => !visible[i.code]).length} gizli
                  </span>
                </div>
                <div className="max-h-[60vh] overflow-auto rounded-md border border-neutral-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-neutral-50 text-left text-xs text-neutral-500">
                      <tr>
                        <th className="px-2 py-2"><label className="flex items-center gap-1"><input type="checkbox" checked={allIncluded}
                          onChange={() => setInclude(Object.fromEntries(newItems.map((i) => [i.code, !allIncluded])))} />Ekle</label></th>
                        <th className="px-2 py-2">Kod</th>
                        <th className="px-2 py-2">Ürün adı</th>
                        <th className="px-2 py-2">Grup</th>
                        {hasActivity && <th className="px-2 py-2">Sipariş / satış</th>}
                        <th className="px-2 py-2"><label className="flex items-center gap-1"><input type="checkbox" checked={allVisible}
                          onChange={() => setVisible({ ...visible, ...Object.fromEntries(chosen.map((i) => [i.code, !allVisible])) })} />Görünür</label></th>
                      </tr>
                    </thead>
                    <tbody>
                      {newItems.map((it) => {
                        const on = !!include[it.code];
                        return (
                          <tr key={it.code} className={"border-t border-neutral-100 " + (on ? "" : "text-neutral-400")}>
                            <td className="px-2 py-1"><input type="checkbox" aria-label={`${it.name} ekle`} checked={on} onChange={() => setInclude({ ...include, [it.code]: !on })} /></td>
                            <td className="px-2 py-1 font-mono text-xs">{it.code}</td>
                            <td className="px-2 py-1">{it.name}</td>
                            <td className="px-2 py-1">
                              <input className={inp + " min-w-[130px] py-0.5 text-xs"} list="add-groups" value={target(it)} disabled={!on}
                                aria-label={`${it.name} grubu`}
                                onChange={(e) => setRowGroup({ ...rowGroup, [it.code]: e.target.value })} />
                            </td>
                            {hasActivity && <td className="px-2 py-1 text-xs text-neutral-500">{it.activity || "—"}</td>}
                            <td className="px-2 py-1 text-center">
                              <input type="checkbox" aria-label={`${it.name} görünür`} checked={!!visible[it.code]} disabled={!on}
                                onChange={() => setVisible({ ...visible, [it.code]: !visible[it.code] })} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {missingGroup.length > 0 && <div className="mt-2 text-xs text-red-700">{missingGroup.length} ürünün grubu boş; grup yazın.</div>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={busy || chosen.length === 0 || missingGroup.length > 0} onClick={apply} data-testid="add-apply"
                    className="rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:bg-neutral-300">
                    {chosen.length ? `${chosen.length} ürünü ekle` : "Seçili ürün yok"}
                  </button>
                  <button type="button" onClick={reset} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm">Vazgeç</button>
                </div>
              </div>
            </>
          )}

          {oldItems.length > 0 && (
            <details className={card}>
              <summary className="cursor-pointer text-sm font-semibold">Sistemde zaten olan {oldItems.length} ürün (dokunulmayacak)</summary>
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {oldItems.map((it) => {
                    const p = byCode.get(it.code)!;
                    return (
                      <tr key={it.code} className="border-t border-neutral-100">
                        <td className="px-2 py-1 font-mono">{it.code}</td>
                        <td className="px-2 py-1">{p.name}{p.name !== it.name && <span className="text-neutral-400"> (dosyada: {it.name})</span>}</td>
                        <td className="px-2 py-1 text-neutral-500">{p.group}</td>
                        <td className="px-2 py-1">{p.visible === false ? <span className="text-neutral-400">Gizli</span> : <span className="text-green-700">Görünür</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </div>
  );
}
