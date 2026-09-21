import { describe, expect, it } from "vitest";
import { splitCode } from "./codes";
import { decodeText, parseProductsCsv } from "./importfile";
import { getCategory, normalize, splitMatch } from "./text";

describe("splitCode (PDF'teki kod vurgulama kuralı)", () => {
  it("290 önekini ve baştaki sıfırları atar", () => {
    expect(splitCode("2900027")).toEqual({ prefix: "29000", typed: "27" });
    expect(splitCode("2900063")).toEqual({ prefix: "29000", typed: "63" });
    expect(splitCode("2905083")).toEqual({ prefix: "290", typed: "5083" });
    expect(splitCode("2900009")).toEqual({ prefix: "290000", typed: "9" });
  });
  it("290 ile başlamayan kodlarda vurgu yok", () => {
    expect(splitCode("2930341")).toEqual({ prefix: "2930341", typed: "" });
    expect(splitCode("8690574114443")).toEqual({ prefix: "8690574114443", typed: "" });
    expect(splitCode("BEYKOZ")).toEqual({ prefix: "BEYKOZ", typed: "" });
  });
});

describe("arama yardımcıları", () => {
  it("Türkçe karakterlerden bağımsız", () => {
    expect(normalize("şeftali")).toBe(normalize("SEFTALI"));
    expect(normalize("limon")).toBe("LIMON");
  });
  it("kategori", () => {
    expect(getCategory("Kasap - Banvit")).toBe("kasap");
    expect(getCategory("Egzotik Meyveler")).toBe("meyve");
    expect(getCategory("Şarküteri")).toBe("sarkuteri");
    expect(getCategory("Sebze")).toBe("sebze");
    expect(getCategory("Kuruyemiş")).toBe("diger");
  });
  it("splitMatch", () => {
    expect(splitMatch("MNV.DOMATES KG", "DOMATES")).toEqual(["MNV.", "DOMATES", " KG"]);
    expect(splitMatch("MNV.DOMATES KG", "YOK")).toBeNull();
  });
});

describe("CSV içe aktarma", () => {
  it("başlıklı ; ayraçlı dosya", () => {
    const r = parseProductsCsv("Kod;Ürün Adı;Grup\r\n2900027;MNV.BARBUNYA KG;Sebze\r\n2900100;\"MNV.X; Y\";Sebze\r\n");
    expect(r.products).toEqual([
      { code: "2900027", name: "MNV.BARBUNYA KG", group: "Sebze" },
      { code: "2900100", name: "MNV.X; Y", group: "Sebze" },
    ]);
  });
  it("başlıksız, sütun sırasıyla; virgül ve BOM", () => {
    const r = parseProductsCsv(decodeText(new TextEncoder().encode("\uFEFF2900027,A,Sebze\n2900100,B,Meyve").buffer as ArrayBuffer));
    expect(r.products.map((p) => p.code)).toEqual(["2900027", "2900100"]);
  });
  it("Windows-1254 kodlamasını çözer", () => {
    // "ŞEFTALİ" cp1254: D0? -> Ş=0xDE, İ=0xDD
    const bytes = new Uint8Array([0xde, 0x45, 0x46, 0x54, 0x41, 0x4c, 0xdd]);
    expect(decodeText(bytes.buffer)).toBe("ŞEFTALİ");
  });
  it("sütun eksikse anlaşılır hata", () => {
    expect(() => parseProductsCsv("kod;ad\n1;2")).toThrow(/kod, ad ve grup/);
  });
});
