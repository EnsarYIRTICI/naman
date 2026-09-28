import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseProductTable, readProductFile, suggestGroup } from "./productfile";

const fixture = (n: string) => fs.readFileSync(path.join(__dirname, "__fixtures__", n));

describe("readProductFile (xlsx sipariş evrakı)", () => {
  it("grup satırlarını, sayısal kodları, sipariş/satış sütunlarını okur; tekrar ve boş kodu atlar", async () => {
    const r = await readProductFile(new File([fixture("siparis-ornek.xlsx")], "siparis.xlsx"));
    expect(r.activityCols).toEqual(["Geçen Haftaki Sipariş", "Geçen Haftaki Satış", "Sipariş Miktarı"]);
    expect(r.items.map((i) => [i.code, i.name, i.fileGroup, i.active])).toEqual([
      ["2880003", "MNV.DEREOTU AD", "Adetli Ürünler", true],
      ["8681657099061", "ERBAA YAPRAK 400 GR", "Adetli Ürünler", false],
      ["2900034", "MNV.ARMUT SANTAMARIA KG", "Meyve Siparişi", true],
      ["2900028", "MNV.LIMON & MISKET <KG>", "Meyve Siparişi", true],
    ]);
    expect(r.items[2]!.activity).toBe("Geçen Haftaki Sipariş: 60 · Geçen Haftaki Satış: 9,68");
    expect(r.warnings.join("\n")).toMatch(/2900034 kodu satır 6 ile aynı/);
    expect(r.warnings.join("\n")).toMatch(/Satır 8: kod boş/);
    expect(r.warnings.join("\n")).toMatch(/2 sayfa var/);
  });
  it("eski .xls ve PDF için anlaşılır hata verir", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    await expect(readProductFile(new File([ole], "a.xls"))).rejects.toThrow(/xlsx/);
    await expect(readProductFile(new File(["%PDF-1.4"], "a.pdf"))).rejects.toThrow(/PDF/);
  });
});

describe("CSV / JSON", () => {
  it("başlıklı CSV (Kod;Ürün Adı;Grup) ve Windows-1254 olmayan UTF-8", async () => {
    const r = await readProductFile(new File(["﻿Kod;Ürün Adı;Grup\n2900027;MNV.BARBUNYA KG;Sebze\n"], "u.csv"));
    expect(r.items).toMatchObject([{ code: "2900027", name: "MNV.BARBUNYA KG", fileGroup: "Sebze", active: null }]);
  });
  it("başlıksız: kod, ad sırası", () => {
    const r = parseProductTable([["2900027", "MNV.BARBUNYA KG"]]);
    expect(r.items[0]).toMatchObject({ code: "2900027", name: "MNV.BARBUNYA KG", fileGroup: "" });
    expect(r.warnings[0]).toMatch(/Başlık satırı bulunamadı/);
  });
  it("JSON yedek / products.json", async () => {
    const r = await readProductFile(new File([JSON.stringify({ products: [{ c: "1", n: "A", g: "Sebze" }] })], "p.json"));
    expect(r.items[0]).toMatchObject({ code: "1", name: "A", fileGroup: "Sebze" });
  });
});

describe("suggestGroup", () => {
  const existing = [
    { code: "2900034", group: "Egzotik Meyveler" },
    { code: "2900027", group: "Sebze" },
  ];
  const it1 = (code: string) => ({ code, name: "x", fileGroup: "", row: 1, active: null, activity: "" });
  it("dosyadaki gruptan sistemde olan ürünlerin grubunu önerir", () => {
    expect(suggestGroup("Meyve Siparişi", [it1("2900034"), it1("999")], existing)).toBe("Egzotik Meyveler");
  });
  it("eşleşme yoksa kategori, o da yoksa temizlenmiş ad", () => {
    expect(suggestGroup("Sebze Siparişi", [it1("5")], existing)).toBe("Sebze");
    expect(suggestGroup("Adetli Ürünler", [it1("6")], existing)).toBe("Adetli Ürünler");
    expect(suggestGroup("", [it1("6")], existing)).toBe("Diğer");
  });
});
