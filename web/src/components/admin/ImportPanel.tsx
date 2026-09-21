"use client";
import { useRef, useState } from "react";
import { ApiError, send } from "@/lib/api";
import { decodeText, parseProductsCsv } from "@/lib/importfile";
import type { ImportResponse } from "@/lib/types";

type Mode = "merge" | "replace";
const SAMPLE_CSV = "Kod;Ürün Adı;Grup\n2900027;MNV.BARBUNYA KG;Sebze\n2900100;MNV.BEZELYE KG;Sebze\n";

export default function ImportPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [mode, setMode] = useState<Mode>("merge");
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function doPreview(data: unknown, m: Mode) {
    setBusy(true);
    setErrs([]);
    setPreview(null);
    try {
      setPreview(await send<ImportResponse>("POST", "/api/admin/import", { mode: m, dry: true, data }));
    } catch (e) {
      const a = e as ApiError;
      setErrs([a.message, ...(a.details ?? [])]);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    setOkMsg("");
    setPreview(null);
    setPayload(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const text = decodeText(await file.arrayBuffer());
      const data = /\.json$/i.test(file.name) ? JSON.parse(text) : parseProductsCsv(text);
      setPayload(data);
      await doPreview(data, mode);
    } catch (e) {
      setErrs([e instanceof SyntaxError ? "JSON okunamadı: " + e.message : (e as Error).message]);
    }
  }

  async function apply() {
    if (!payload || !preview) return;
    const removed = preview.sections.reduce((n, s) => n + s.removed, 0);
    if (removed > 0 && !confirm(`${removed} kayıt SİLİNECEK. Devam edilsin mi?\n(Yedek almadıysanız önce "Yedek indir" ile indirin.)`)) return;
    setBusy(true);
    setErrs([]);
    try {
      const r = await send<ImportResponse>("POST", "/api/admin/import", { mode, dry: false, data: payload });
      setOkMsg(r.applied ? `Yüklendi. Yeni veri sürümü: v${r.version}` : "Değişiklik yok, veri aynı kaldı.");
      setPreview(null);
      setPayload(null);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      await onChanged();
    } catch (e) {
      const a = e as ApiError;
      setErrs([a.message, ...(a.details ?? [])]);
    } finally {
      setBusy(false);
    }
  }

  const total = preview?.sections.reduce((n, s) => n + s.added + s.updated + s.removed, 0) ?? 0;
  const card = "rounded-lg border border-neutral-200 bg-white p-4";
  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="m-0 mb-1 text-sm font-semibold">Veri yükle</h3>
        <p className="m-0 mb-3 text-xs leading-relaxed text-neutral-500">
          <b>.json</b> (eski <code>products.json</code> ya da yedek dosyası) veya ürün listesi için <b>.csv</b> (Excel&apos;den &quot;CSV olarak kaydet&quot;;
          sütunlar: <code>Kod;Ürün Adı;Grup</code>). Önce önizleme gösterilir, onaylamadan hiçbir şey değişmez.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".json,.csv,.txt" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          <a className="text-xs underline" href={"data:text/csv;charset=utf-8," + encodeURIComponent("\uFEFF" + SAMPLE_CSV)} download="urunler-ornek.csv">Örnek CSV indir</a>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(["merge", "replace"] as Mode[]).map((m) => (
            <label key={m} className="flex cursor-pointer items-start gap-2">
              <input type="radio" name="mode" checked={mode === m} onChange={() => { setMode(m); if (payload) void doPreview(payload, m); }} className="mt-1" />
              <span>
                <b>{m === "merge" ? "Birleştir" : "Değiştir"}</b>
                <span className="block text-xs text-neutral-500">
                  {m === "merge" ? "Yeni kayıtlar eklenir, var olanlar güncellenir. Hiçbir şey silinmez." : "Dosyada olmayan kayıtlar SİLİNİR; liste dosyadaki gibi olur."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {errs.length > 0 && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          <b>{errs[0]}</b>
          <ul className="m-0 mt-1 list-disc pl-5 text-xs">{errs.slice(1).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {okMsg && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800" data-testid="import-ok">{okMsg}</div>}

      {preview && (
        <div className={card} data-testid="preview">
          <h3 className="m-0 mb-2 text-sm font-semibold">Önizleme — {fileName} ({mode === "merge" ? "birleştir" : "değiştir"})</h3>
          {preview.notes.map((n) => <div key={n} className="mb-1 text-xs text-amber-700">{n}</div>)}
          {preview.sections.map((s) => (
            <div key={s.key} className="mb-3 border-t border-neutral-100 pt-2 text-sm">
              <div className="font-semibold">{s.label}</div>
              <div className="text-xs text-neutral-600">
                <span className="text-green-700">+{s.added} eklenecek</span> · <span className="text-blue-700">~{s.updated} güncellenecek</span> ·{" "}
                <span className={s.removed ? "font-bold text-red-700" : ""}>−{s.removed} silinecek</span> · {s.unchanged} değişmeyecek
              </div>
              {s.samples.added.length > 0 && <div className="mt-1 text-xs text-neutral-500">Eklenecek: {s.samples.added.join(" | ")}{s.added > s.samples.added.length ? " ..." : ""}</div>}
              {s.samples.updated.map((u) => (
                <div key={u.label} className="mt-1 text-xs text-neutral-500">Güncellenecek: {u.label} — {u.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join(", ")}</div>
              ))}
              {s.samples.removed.length > 0 && <div className="mt-1 text-xs text-red-600">Silinecek: {s.samples.removed.join(" | ")}{s.removed > s.samples.removed.length ? " ..." : ""}</div>}
            </div>
          ))}
          <button type="button" disabled={busy || total === 0} onClick={apply}
            className="rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:bg-neutral-300">
            {total === 0 ? "Değişiklik yok" : "Uygula"}
          </button>
        </div>
      )}

      <div className={card}>
        <h3 className="m-0 mb-1 text-sm font-semibold">Yedek</h3>
        <p className="m-0 mb-2 text-xs text-neutral-500">Tüm veriyi (ürünler, kanallar, barkodlar, yemek kartları) JSON olarak indirir. Aynı dosya &quot;Değiştir&quot; ile geri yüklenebilir.</p>
        <a href="/api/admin/export" className="inline-block rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold hover:bg-neutral-50">Yedek indir (JSON)</a>
      </div>
    </div>
  );
}
