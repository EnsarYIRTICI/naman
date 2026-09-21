"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, send } from "@/lib/api";
import type { AdminData, Me } from "@/lib/types";
import ChangesPanel from "./ChangesPanel";
import DocPanel from "./DocPanel";
import ImportPanel from "./ImportPanel";
import LoginForm from "./LoginForm";
import SectionEditor from "./SectionEditor";

type Tab = "products" | "channels" | "barcodes" | "meal-cards" | "doc" | "import" | "changes";
const TABS: { key: Tab; label: string }[] = [
  { key: "products", label: "Ürünler" },
  { key: "channels", label: "Sipariş kanalları" },
  { key: "barcodes", label: "Barkodlar" },
  { key: "meal-cards", label: "Yemek kartları" },
  { key: "doc", label: "Döküman" },
  { key: "import", label: "Veri yükle / yedek" },
  { key: "changes", label: "Geçmiş" },
];

export default function AdminApp() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined: yükleniyor, null: giriş yok
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState<Tab>("products");
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<AdminData>("/api/admin/data"));
      setLoadErr("");
    } catch (e) {
      if ((e as ApiError).status === 401) setMe(null);
      else setLoadErr((e as Error).message);
    }
  }, []);

  const boot = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
      await load();
    } catch {
      setMe(null);
    }
  }, [load]);

  useEffect(() => { void boot(); }, [boot]);

  const groups = useMemo(() => [...new Set((data?.products ?? []).map((p) => p.group))], [data]);

  async function logout() {
    try { await send("POST", "/api/logout"); } catch {}
    setMe(null);
    setData(null);
  }

  if (me === undefined) return <div className="p-8 text-sm text-neutral-500">Yükleniyor...</div>;
  if (me === null) return <LoginForm onLoggedIn={boot} />;

  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="m-0 text-lg font-semibold">🛒 Naman Yönetim</h1>
          <div className="text-xs text-neutral-500">Veri sürümü v{data?.version ?? "…"} · yapılan her değişiklik kasa sayfasına anında yansır</div>
        </div>
        <div className="text-sm">
          <a href="/" target="_blank" className="mr-4 underline">Siteyi aç ↗</a>
          <span className="text-neutral-500">{me.username}</span>{" "}
          <button type="button" onClick={logout} className="ml-1 cursor-pointer border-0 bg-transparent p-0 underline">Çıkış</button>
        </div>
      </header>

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Bölümler">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={"rounded-full border px-3.5 py-1.5 text-sm font-semibold " + (tab === t.key ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-300 bg-white")}>
            {t.label}
            {data && t.key !== "import" && t.key !== "changes" && t.key !== "doc" && (
              <span className="ml-1.5 opacity-60">
                {t.key === "products" ? data.products.length : t.key === "channels" ? data.channels.length : t.key === "barcodes" ? data.barcodes.length : data.mealCards.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {loadErr && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadErr}</div>}

      {data && tab === "products" && (
        <SectionEditor section="products" singular="Ürün" rows={data.products} onChanged={load} filterable
          columns={[{ prop: "code", label: "Kod", mono: true }, { prop: "name", label: "Ürün adı" }, { prop: "group", label: "Grup", suggestions: groups }]} />
      )}
      {data && tab === "channels" && (
        <SectionEditor section="channels" singular="Kanal" rows={data.channels} onChanged={load}
          columns={[{ prop: "name", label: "Kanal" }, { prop: "code", label: "Kod", mono: true }]} />
      )}
      {data && tab === "barcodes" && (
        <SectionEditor section="barcodes" singular="Barkod" rows={data.barcodes} onChanged={load}
          columns={[{ prop: "name", label: "Ad" }, { prop: "code", label: "Barkod / kod", mono: true }]} />
      )}
      {data && tab === "meal-cards" && (
        <SectionEditor section="meal-cards" singular="Yemek kartı" rows={data.mealCards} onChanged={load}
          columns={[{ prop: "name", label: "Kart" }, { prop: "posName", label: "Kasada seçilecek" }]} />
      )}
      {data && tab === "doc" && <DocPanel dataVersion={data.version} />}
      {data && tab === "import" && <ImportPanel onChanged={load} />}
      {data && tab === "changes" && <ChangesPanel version={data.version} />}
    </div>
  );
}
