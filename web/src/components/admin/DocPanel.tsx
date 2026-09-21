"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, send } from "@/lib/api";
import type { DocAdmin } from "@/lib/types";

const card = "rounded-lg border border-neutral-200 bg-white p-4";
const btn = "rounded-md border px-2.5 py-1 text-xs font-semibold";

export default function DocPanel({ dataVersion }: { dataVersion: number }) {
  const [info, setInfo] = useState<DocAdmin | null>(null);
  const [note, setNote] = useState("");
  const dirty = useRef(false);
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [force, setForce] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<DocAdmin>("/api/admin/doc");
      setInfo(d);
      if (!dirty.current) setNote(d.suggestion.note);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load, dataVersion]);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const m = await fn();
      if (m) setMsg(m);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const publish = () =>
    run(async () => {
      const r = await send<{ label: string }>("POST", "/api/admin/doc/publish", { note, makeCurrent, force });
      dirty.current = false;
      setForce(false);
      return `${r.label} yayınlandı${makeCurrent ? " ve kasiyerlere gösterilen (güncel) sürüm yapıldı" : ""}.`;
    });

  if (!info) return <div className="text-sm text-neutral-500">Yükleniyor...</div>;
  const s = info.suggestion;
  const canPublish = !busy && (s.hasChanges || force);

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            Kasiyerlerin gördüğü sürüm: <b data-testid="doc-current">{info.current ?? "—"}</b>
          </div>
          <a href="/dokuman" target="_blank" className="text-sm underline">Herkese açık dökümanı aç ↗</a>
        </div>

        <h3 className="m-0 mb-1 text-sm font-semibold">Yeni sürüm yayınla</h3>
        <p className="m-0 mb-3 text-xs text-neutral-500">
          Yayınlanınca şu anki ürün, kanal ve yemek kartı verisinin bir kopyası yeni sürüm olarak saklanır. Sonradan veriyi değiştirseniz de bu sürüm aynı kalır;
          istediğiniz zaman eski bir sürüme geri dönebilirsiniz.
        </p>

        <div className="mb-3 rounded-md bg-neutral-50 p-2.5 text-sm" data-testid="doc-suggestion">
          {s.baseline === null ? (
            <span>Henüz sayfa olarak yayınlanmış sürüm yok. İlk sürüm oluşturulacak.</span>
          ) : s.hasChanges ? (
            <span>
              <b>{s.baseline}</b> sürümünden bu yana değişiklik var:{" "}
              {s.changes.filter((c) => c.added + c.updated + c.removed > 0).map((c) => (
                <span key={c.key} className="mr-2 whitespace-nowrap">{c.label} <span className="text-green-700">+{c.added}</span> <span className="text-blue-700">~{c.updated}</span> <span className="text-red-700">−{c.removed}</span></span>
              ))}
            </span>
          ) : (
            <span className="text-amber-700">{s.baseline} sürümünden bu yana veride değişiklik yok.</span>
          )}
        </div>

        <label htmlFor="doc-note" className="mb-1 block text-xs font-semibold text-neutral-600">Sürüm notu (kasiyerler eski sürümlerde bu açıklamayı görür)</label>
        <textarea id="doc-note" data-testid="doc-note" rows={3} value={note} maxLength={2000}
          onChange={(e) => { dirty.current = true; setNote(e.target.value); }}
          placeholder="Ne değişti? Boş bırakırsanız otomatik oluşturulan not kullanılır."
          className="mb-3 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-400" />

        <div className="mb-3 space-y-1 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} />
            Kasiyerlere bu sürüm gösterilsin (güncel sürüm yap)
          </label>
          {!s.hasChanges && s.baseline !== null && (
            <label className="flex cursor-pointer items-center gap-2 text-neutral-600">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Değişiklik olmasa da yine de yayınla
            </label>
          )}
        </div>

        <button type="button" disabled={!canPublish} onClick={publish}
          className="rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:bg-neutral-300">
          Yayınla
        </button>
        {msg && <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800" data-testid="doc-msg">{msg}</div>}
        {err && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="doc-err">{err}</div>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr><th className="px-3 py-2">Sürüm</th><th className="px-3 py-2">Tarih / yayınlayan</th><th className="px-3 py-2">Not</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {info.versions.map((v) => (
              <tr key={v.id} data-label={v.label} className="border-t border-neutral-100 align-top">
                <td className="whitespace-nowrap px-3 py-2">
                  <b className="font-mono">{v.label}</b>{" "}
                  {v.current && <span className="rounded-full bg-green-700 px-2 py-0.5 text-[11px] font-semibold text-white">Güncel</span>}{" "}
                  {v.kind === "pdf" && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] text-neutral-700">PDF arşiv</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-600">
                  {v.publishedAt ? new Date(v.publishedAt).toLocaleString("tr-TR") : "tarih kayıtlı değil"}
                  {v.publishedBy ? <><br />{v.publishedBy}</> : null}
                </td>
                <td className="px-3 py-2">
                  {editId === v.id ? (
                    <textarea rows={3} value={editNote} onChange={(e) => setEditNote(e.target.value)} className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm" />
                  ) : (v.note || <span className="text-neutral-400">—</span>)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {editId === v.id ? (
                    <>
                      <button type="button" disabled={busy} className={btn + " border-neutral-800 bg-neutral-800 text-white"}
                        onClick={() => run(async () => { await send("PUT", `/api/admin/doc/versions/${v.id}`, { note: editNote }); setEditId(null); })}>Kaydet</button>{" "}
                      <button type="button" className={btn + " border-neutral-300"} onClick={() => setEditId(null)}>İptal</button>
                    </>
                  ) : (
                    <>
                      <a className={btn + " inline-block border-neutral-300"} target="_blank" href={v.current ? "/dokuman" : `/dokuman?v=${encodeURIComponent(v.label)}`}>Aç</a>{" "}
                      <button type="button" className={btn + " border-neutral-300"} onClick={() => { setEditId(v.id); setEditNote(v.note); }}>Notu düzenle</button>
                      {!v.current && (
                        <>
                          {" "}
                          <button type="button" disabled={busy} className={btn + " border-green-700 text-green-800"}
                            onClick={() => run(async () => { await send("POST", "/api/admin/doc/current", { id: v.id }); return `${v.label} artık kasiyerlere gösterilen sürüm.`; })}>Güncel yap</button>{" "}
                          <button type="button" disabled={busy} className={btn + " border-red-300 text-red-600"}
                            onClick={() => { if (confirm(`${v.label} sürümü silinsin mi? Bu işlem geri alınamaz.`)) void run(async () => { await send("DELETE", `/api/admin/doc/versions/${v.id}`); return `${v.label} silindi.`; }); }}>Sil</button>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
