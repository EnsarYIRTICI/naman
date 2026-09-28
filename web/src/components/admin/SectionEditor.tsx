"use client";
import { useMemo, useState } from "react";
import { send } from "@/lib/api";
import { normalize } from "@/lib/text";

type Row = { id: number; visible?: boolean };
const val = (r: Row, prop: string): string => String((r as unknown as Record<string, unknown>)[prop] ?? "");
export interface Column { prop: string; label: string; suggestions?: string[]; mono?: boolean }
interface Props {
  section: string; // API yolu: products | channels | barcodes | meal-cards
  singular: string;
  columns: Column[];
  rows: Row[];
  onChanged: () => Promise<void>;
  filterable?: boolean;
  /** Ürünler: görünür/gizli sütunu, filtre ve toplu gizle/göster */
  visibility?: boolean;
}
type VisFilter = "all" | "visible" | "hidden";

const MAX_SHOWN = 1000;
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-neutral-400";
const btn = "rounded-md border px-2.5 py-1 text-xs font-semibold";

export default function SectionEditor({ section, singular, columns, rows, onChanged, filterable, visibility }: Props) {
  const empty = () => Object.fromEntries(columns.map((c) => [c.prop, ""]));
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>(empty());
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [vis, setVis] = useState<VisFilter>("all");
  const [sel, setSel] = useState<Set<number>>(new Set());

  const shown = useMemo(() => {
    const q = normalize(filter.trim());
    return rows.filter((r) => {
      if (visibility && vis !== "all" && (r.visible !== false) !== (vis === "visible")) return false;
      return !q || normalize(columns.map((c) => val(r, c.prop)).join(" ")).includes(q);
    });
  }, [rows, filter, columns, vis, visibility]);
  const hiddenCount = useMemo(() => rows.filter((r) => r.visible === false).length, [rows]);
  const selShown = shown.filter((r) => sel.has(r.id));
  const allShownSelected = shown.length > 0 && selShown.length === Math.min(shown.length, MAX_SHOWN);

  const setVisible = async (ids: number[], visible: boolean) => {
    if (await run(() => send("POST", "/api/admin/products-visibility", { ids, visible }))) setSel(new Set());
  };
  const toggleSel = (id: number) => setSel((cur) => {
    const n = new Set(cur);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await onChanged();
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const add = async () => {
    if (await run(() => send("POST", `/api/admin/${section}`, draft))) setDraft(empty());
  };
  const save = async (id: number) => {
    if (await run(() => send("PUT", `/api/admin/${section}/${id}`, edit))) setEditId(null);
  };
  const del = async (r: Row) => {
    const label = columns.map((c) => val(r, c.prop)).join(" · ");
    if (!confirm(`${singular} silinsin mi?\n\n${label}`)) return;
    await run(() => send("DELETE", `/api/admin/${section}/${r.id}`));
  };

  const dlId = `dl-${section}`;
  return (
    <div>
      {columns.map((c) => c.suggestions && (
        <datalist key={c.prop} id={`${dlId}-${c.prop}`}>{c.suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      ))}

      <div className="mb-3 rounded-lg border border-neutral-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold text-neutral-500">Yeni {singular.toLowerCase()} ekle</div>
        <div className="flex flex-wrap gap-2">
          {columns.map((c) => (
            <input key={c.prop} className={inp + " min-w-[140px] flex-1"} placeholder={c.label} value={draft[c.prop] ?? ""}
              list={c.suggestions ? `${dlId}-${c.prop}` : undefined}
              onChange={(e) => setDraft({ ...draft, [c.prop]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          ))}
          <button type="button" disabled={busy} onClick={add} className="rounded-md bg-neutral-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">Ekle</button>
        </div>
      </div>

      {err && <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</div>}

      {(filterable || visibility) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {filterable && (
            <input className={inp + " min-w-[200px] flex-1"} placeholder="Listede ara (ad, kod, grup)..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          )}
          {visibility && (
            <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs font-semibold" role="group" aria-label="Görünürlük filtresi">
              {([["all", `Tümü (${rows.length})`], ["visible", `Görünür (${rows.length - hiddenCount})`], ["hidden", `Gizli (${hiddenCount})`]] as [VisFilter, string][]).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setVis(k)}
                  className={"px-3 py-1.5 " + (vis === k ? "bg-neutral-800 text-white" : "bg-white hover:bg-neutral-50")}>{label}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {visibility && (
        <p className="m-0 mb-2 text-xs text-neutral-500">
          <b>Gizli</b> ürünler sistemde kayıtlı kalır ama kasa sayfasında ve dökümanda görünmez (mevsimi geçen, şu an satılmayan ürünler).
          Satırları işaretleyip toplu gizleyebilir / gösterebilirsiniz.
        </p>
      )}
      <div className="mb-1 flex min-h-8 flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span>{shown.length} kayıt{shown.length > MAX_SHOWN ? ` (ilk ${MAX_SHOWN} gösteriliyor, aramayı daraltın)` : ""}</span>
        {visibility && sel.size > 0 && (
          <span className="flex flex-wrap items-center gap-1.5 rounded-md bg-neutral-800 px-2 py-1 text-white" data-testid="bulkbar">
            <b>{sel.size} seçili</b>
            <button type="button" disabled={busy} onClick={() => setVisible([...sel], true)} className={btn + " border-green-300 bg-green-600 text-white"}>Görünür yap</button>
            <button type="button" disabled={busy} onClick={() => setVisible([...sel], false)} className={btn + " border-neutral-400 bg-neutral-600 text-white"}>Gizle</button>
            <button type="button" onClick={() => setSel(new Set())} className="cursor-pointer border-0 bg-transparent px-1 text-xs text-neutral-300 underline">seçimi kaldır</button>
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              {visibility && (
                <th className="w-8 px-3 py-2">
                  <input type="checkbox" aria-label="Listedekilerin hepsini seç" checked={allShownSelected}
                    onChange={() => setSel(allShownSelected ? new Set() : new Set(shown.slice(0, MAX_SHOWN).map((r) => r.id)))} />
                </th>
              )}
              {columns.map((c) => <th key={c.prop} className="px-3 py-2 font-semibold">{c.label}</th>)}
              {visibility && <th className="px-3 py-2 font-semibold">Durum</th>}
              <th className="w-40 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, MAX_SHOWN).map((r) => (
              <tr key={r.id} className={"border-t border-neutral-100 " + (visibility && r.visible === false ? "bg-neutral-50 text-neutral-400" : "")}>
                {visibility && (
                  <td className="px-3 py-1.5"><input type="checkbox" aria-label="Seç" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} /></td>
                )}
                {columns.map((c) => (
                  <td key={c.prop} className={"px-3 py-1.5 " + (c.mono ? "font-mono" : "")}>
                    {editId === r.id ? (
                      <input className={inp} value={edit[c.prop] ?? ""} list={c.suggestions ? `${dlId}-${c.prop}` : undefined}
                        onChange={(e) => setEdit({ ...edit, [c.prop]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save(r.id)} />
                    ) : val(r, c.prop)}
                  </td>
                ))}
                {visibility && (
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <button type="button" disabled={busy} onClick={() => setVisible([r.id], r.visible === false)}
                      title={r.visible === false ? "Gizli — kasa sayfasında görünmez. Tıklayınca görünür olur." : "Görünür — tıklayınca gizlenir."}
                      className={"rounded-full border px-2.5 py-0.5 text-xs font-semibold " + (r.visible === false ? "border-neutral-300 bg-white text-neutral-500" : "border-green-300 bg-green-50 text-green-800")}>
                      {r.visible === false ? "Gizli" : "Görünür"}
                    </button>
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  {editId === r.id ? (
                    <>
                      <button type="button" disabled={busy} className={btn + " border-neutral-800 bg-neutral-800 text-white"} onClick={() => save(r.id)}>Kaydet</button>{" "}
                      <button type="button" className={btn + " border-neutral-300"} onClick={() => setEditId(null)}>İptal</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={btn + " border-neutral-300"} onClick={() => { setEditId(r.id); setEdit(Object.fromEntries(columns.map((c) => [c.prop, val(r, c.prop)]))); setErr(""); }}>Düzenle</button>{" "}
                      <button type="button" className={btn + " border-red-300 text-red-600"} onClick={() => del(r)}>Sil</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={columns.length + (visibility ? 3 : 1)} className="px-3 py-6 text-center text-neutral-400">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
