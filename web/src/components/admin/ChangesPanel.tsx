"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Change } from "@/lib/types";

export default function ChangesPanel({ version }: { version: number }) {
  const [rows, setRows] = useState<Change[] | null>(null);
  useEffect(() => {
    api<Change[]>("/api/admin/changes").then(setRows).catch(() => setRows([]));
  }, [version]);
  if (!rows) return <div className="text-sm text-neutral-500">Yükleniyor...</div>;
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
          <tr><th className="px-3 py-2">Sürüm</th><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Kullanıcı</th><th className="px-3 py-2">Değişiklik</th></tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-neutral-100 align-top">
              <td className="px-3 py-1.5 font-mono">v{c.version}</td>
              <td className="whitespace-nowrap px-3 py-1.5">{new Date(c.at).toLocaleString("tr-TR")}</td>
              <td className="px-3 py-1.5">{c.username ?? "sistem"}</td>
              <td className="px-3 py-1.5">{c.summary}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-400">Kayıt yok</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
