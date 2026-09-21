import { describe, expect, it } from "vitest";
import { SECTIONS, diffSection, normalizeImport, normalizeItem } from "./sections";

const products = SECTIONS.find((s) => s.key === "products")!;

describe("normalizeImport", () => {
  it("eski naman products.json biçimini (c/n/g, kanal/kod, actions) kabul eder", () => {
    const r = normalizeImport({
      actions: [{ ad: "Ürün İptal", kod: "BEYKOZ" }],
      channels: [{ kanal: "Getir", kod: "999914" }],
      products: [{ c: "2900027", n: "MNV.BARBUNYA KG", g: "Sebze" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.data.products).toEqual([{ code: "2900027", name: "MNV.BARBUNYA KG", group: "Sebze" }]);
    expect(r.data.channels).toEqual([{ name: "Getir", code: "999914" }]);
    expect(r.data.barcodes).toEqual([{ name: "Ürün İptal", code: "BEYKOZ" }]);
  });
  it("yeni biçimi ve sayısal kodları kabul eder", () => {
    const r = normalizeImport({ products: [{ code: 2900027, name: " X ", group: "Sebze" }] });
    expect(r.data.products?.[0]).toEqual({ code: "2900027", name: "X", group: "Sebze" });
  });
  it("tekrarlanan kodu, boş alanı ve ASCII olmayan barkodu reddeder (kısmi yükleme yok)", () => {
    const r = normalizeImport({
      products: [{ code: "1", name: "A", group: "G" }, { code: "1", name: "B", group: "G" }, { code: "2", name: "", group: "G" }],
      barcodes: [{ name: "x", code: "ŞŞ" }],
    });
    expect(r.errors.length).toBe(3);
    expect(r.errors.join("|")).toMatch(/tekrar ediyor/);
  });
  it("boş liste atlanır, tanınmayan içerik hata verir", () => {
    expect(normalizeImport({ products: [] }).notes.length).toBe(1);
    expect(normalizeImport({ foo: 1 }).errors.length).toBe(1);
    expect(normalizeImport([]).errors.length).toBe(1);
  });
});

describe("diffSection", () => {
  const ex = [
    { code: "1", name: "A", group: "G" },
    { code: "2", name: "B", group: "G" },
    { code: "3", name: "C", group: "G" },
  ];
  const inc = [
    { code: "1", name: "A", group: "G" },
    { code: "2", name: "B2", group: "G" },
    { code: "4", name: "D", group: "G" },
  ];
  it("birleştir: eklenen/güncellenen/değişmeyen, silme yok", () => {
    const d = diffSection(products, ex, inc, "merge");
    expect([d.added.length, d.updated.length, d.removed.length, d.unchanged]).toEqual([1, 1, 0, 1]);
  });
  it("değiştir: yüklenmeyen kayıtlar silinir", () => {
    const d = diffSection(products, ex, inc, "replace");
    expect(d.removed.map((x) => x.code)).toEqual(["3"]);
  });
});

describe("normalizeItem", () => {
  it("eksik alanı bildirir", () => {
    expect(normalizeItem(products, { code: "1" }).errors.length).toBe(2);
  });
});
