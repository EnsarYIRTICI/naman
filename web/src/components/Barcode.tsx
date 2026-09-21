"use client";
import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

export default function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", width: 4, height: 160, displayValue: true, fontSize: 22 });
    } catch {
      /* geçersiz karakter: API zaten ASCII zorunlu kılıyor */
    }
  }, [value]);
  return <svg ref={ref} />;
}
