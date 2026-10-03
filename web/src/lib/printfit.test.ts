import { describe, expect, it } from "vitest";
import { loadSettings, paginate, stripName, type FlowItem, type FlowSection, type Page } from "./printfit";

const rows = (n: number, h = 10): FlowItem[] => Array.from({ length: n }, (_, i) => ({ kind: "row", h, ref: i }));
const sec = (...items: FlowItem[][]): FlowSection => ({ items: items.flat() });
const dims = { cols: 2, colH: 100, headH: 20, gap: 10, infoH: null };
/** Sayfa → sütun → blok → satır sayısı özeti */
const shape = (pages: Page[]) =>
  pages.map((p) => p.columns.map((c) => c.map((b) => (b.kind === "info" ? "info" : `${b.sec}${b.cont ? "+" : ""}:${b.items.length}`))));

describe("paginate", () => {
  it("bölümü sütun sonunda böler, devamı sonraki sütunda başlıkla sürer", () => {
    // sütun: 20 başlık + 8 satır = 100
    expect(shape(paginate([sec(rows(12))], dims))).toEqual([[["0:8"], ["0+:4"]]]);
  });
  it("sütunlar dolunca yeni sayfa açar", () => {
    expect(shape(paginate([sec(rows(20))], dims))).toEqual([[["0:8"], ["0+:8"]], [["0+:4"], []]]);
  });
  it("yeni bölümün başlığı + 3 satırı sığmıyorsa bölüm sonraki sütundan başlar", () => {
    // ilk bölüm 20+6*10=80 (+10 boşluk=90); ikinci bölüm için 20+30 gerekir → sonraki sütun
    expect(shape(paginate([sec(rows(6)), sec(rows(4))], dims))).toEqual([[["0:6"], ["1:4"]]]);
  });
  it("sığıyorsa aynı sütunda devam eder", () => {
    expect(shape(paginate([sec(rows(2)), sec(rows(3))], dims))).toEqual([[["0:2", "1:3"], []]]);
  });
  it("bilgi kutusu ilk sütunun başına gelir", () => {
    expect(shape(paginate([sec(rows(3))], { ...dims, infoH: 40 }))).toEqual([[["info", "0:3"], []]]);
  });
  it("alt başlık sütun dibinde yalnız kalmaz", () => {
    const items: FlowItem[] = [...rows(7), { kind: "sub", h: 10, ref: 0 }, ...rows(2)];
    // 20 + 70 = 90; alt başlık (10) + satır (10) = 20 sığmaz → alt başlık sonraki sütuna
    expect(shape(paginate([sec(items)], dims))).toEqual([[["0:7"], ["0+:3"]]]);
  });
});

describe("loadSettings / stripName", () => {
  it("bozuk ya da eski (sayfa sayılı) ayarda varsayılana döner", () => {
    expect(loadSettings("{bozuk")).toEqual({ style: "land2", size: "m", info: true, stripPrefix: false, hideCats: [], hideUnits: [] });
    expect(loadSettings(JSON.stringify({ mode: "fit", pages: 3, style: "x" }))).toMatchObject({ style: "land2", size: "m" });
    expect(loadSettings(JSON.stringify({ style: "land3", size: "l" }))).toMatchObject({ style: "land3", size: "l" });
  });
  it("MNV. / MN. önekini kaldırır", () => {
    expect(stripName("MNV.BIBER KG")).toBe("BIBER KG");
    expect(stripName("MN. PATLICAN MOR KG")).toBe("PATLICAN MOR KG");
    expect(stripName("SEN PILIC BAGET KG")).toBe("SEN PILIC BAGET KG");
  });
});

import { filterNote, keepProduct } from "./printfit";
import { getUnit } from "./text";

describe("içerik filtresi", () => {
  it("birimi addan çıkarır", () => {
    expect(getUnit("MNV.BARBUNYA KG")).toBe("kg");
    expect(getUnit("MNV.AHUDUDU AD")).toBe("adet");
    expect(getUnit("MNV.FRENK SOGAN ADET")).toBe("adet");
    expect(getUnit("MNV.CAGLA PAKET")).toBe("adet");
    expect(getUnit("MASK TARIM DOGRANMIS KULTUR MANTARI 350 GR")).toBe("adet");
    expect(getUnit("MNV.BIBER CARLISTON PAKET KG")).toBe("kg");
  });
  it("kategori ve birime göre eler", () => {
    const s = { hideCats: ["kasap" as const], hideUnits: ["adet" as const] };
    expect(keepProduct({ name: "MNV.ELMA KG", group: "Egzotik Meyveler" }, s)).toBe(true);
    expect(keepProduct({ name: "PILIC BUT KG", group: "Kasap - Banvit" }, s)).toBe(false);
    expect(keepProduct({ name: "MNV.AHUDUDU AD", group: "Egzotik Meyveler" }, s)).toBe(false);
    expect(filterNote(s)).toBe("Kasap hariç · adetliler hariç");
  });
  it("bozuk kayıtlı filtreyi temizler", () => {
    const s = loadSettings(JSON.stringify({ hideCats: ["meyve", "yok", "meyve"], hideUnits: "x" }));
    expect(s.hideCats).toEqual(["meyve"]);
    expect(s.hideUnits).toEqual([]);
    expect(loadSettings(null).hideCats).toEqual([]);
  });
});
