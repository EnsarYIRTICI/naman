import type { Metadata } from "next";
import { Suspense } from "react";
import DocView, { DocSkeleton } from "@/components/DocView";

export const metadata: Metadata = { title: "Kasa Ürün Kodları" };

export default function DokumanPage() {
  return (
    <Suspense
      fallback={
        <div className="doc">
          <div className="dhead"><div><h1>Kasa Ürün Kodları Listesi</h1><p>Manav / Kasap / Şarküteri Referans Tablosu</p></div></div>
          <DocSkeleton />
        </div>
      }
    >
      <DocView />
    </Suspense>
  );
}
