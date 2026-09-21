import type { Metadata } from "next";
import { Suspense } from "react";
import DocView from "@/components/DocView";

export const metadata: Metadata = { title: "Kasa Ürün Kodları" };

export default function DokumanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Yükleniyor...</div>}>
      <DocView />
    </Suspense>
  );
}
