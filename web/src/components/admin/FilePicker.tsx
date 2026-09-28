"use client";
import { useRef, useState } from "react";

/**
 * Belirgin dosya seçme alanı: tıklayınca dosya penceresi açılır, dosya sürükleyip bırakılabilir.
 * Seçilen dosyanın adı alanın içinde gösterilir. `resetKey` değişince seçim temizlenir.
 */
export default function FilePicker({ accept, formats, fileName, disabled, onFile, testId }: {
  accept: string;
  /** Kullanıcıya gösterilen biçimler, ör. "Excel (.xlsx), CSV, JSON" */
  formats: string;
  fileName: string;
  disabled?: boolean;
  onFile: (f: File | undefined) => void;
  testId?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (f: File | undefined) => {
    onFile(f);
    if (ref.current) ref.current.value = ""; // aynı dosya tekrar seçilebilsin
  };
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) pick(e.dataTransfer.files?.[0]); }}
      className={
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors " +
        (over ? "border-green-600 bg-green-50" : fileName ? "border-green-300 bg-green-50/40" : "border-neutral-300 bg-neutral-50 hover:border-neutral-500 hover:bg-white") +
        (disabled ? " pointer-events-none opacity-60" : "")
      }
    >
      <input ref={ref} type="file" accept={accept} disabled={disabled} className="sr-only" data-testid={testId}
        onChange={(e) => pick(e.target.files?.[0])} />
      <span className="text-3xl leading-none" aria-hidden="true">{fileName ? "📄" : "📂"}</span>
      {fileName ? (
        <>
          <span className="text-sm font-semibold text-neutral-800">{fileName}</span>
          <span className="text-xs text-neutral-500">Başka dosya için tıklayın ya da sürükleyin</span>
        </>
      ) : (
        <>
          <span className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white">Dosya seç</span>
          <span className="text-xs text-neutral-500">ya da dosyayı buraya sürükleyip bırakın</span>
        </>
      )}
      <span className="text-xs text-neutral-400">{formats}</span>
    </label>
  );
}
