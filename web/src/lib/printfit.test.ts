import { describe, expect, it } from "vitest";
import { fitToPages, loadSettings, simulatePages } from "./printfit";

describe("simulatePages", () => {
  const b = (h: number, avoid = true, breakBefore = false) => ({ h, avoid, breakBefore });
  it("sığan blokları aynı sayfaya koyar, sığmayan bölünmez bloğu yeni sayfaya taşır", () => {
    expect(simulatePages([b(40), b(50)], 100)).toBe(1);
    expect(simulatePages([b(40), b(70)], 100)).toBe(2);
  });
  it("sayfadan uzun blok bölünür", () => {
    expect(simulatePages([b(30), b(250)], 100)).toBe(3); // 70 + 100 + 80
    expect(simulatePages([b(250)], 100)).toBe(3);
  });
  it("yeni sayfadan başla", () => {
    expect(simulatePages([b(10), b(10, true, true), b(10, true, true)], 100)).toBe(3);
  });
});

describe("fitToPages", () => {
  // Sahte ölçüm: sayfa = yazı * 0.4 (3 sütun), 2 sütunda %30 fazla, 4 sütunda %20 az
  const measure = (font: number, cols: number) => Math.ceil(font * 0.4 * (cols === 2 ? 1.3 : cols === 4 ? 0.8 : 1));
  it("hedefe sığan en büyük yazıyı seçer", () => {
    const r = fitToPages(3, measure);
    expect(r.fits).toBe(true);
    expect(r.pages).toBeLessThanOrEqual(3);
    expect(r).toMatchObject({ font: 9, cols: 4 });
  });
  it("sığmıyorsa en az sayfalı düzeni verir", () => {
    const r = fitToPages(1, measure);
    expect(r.fits).toBe(false);
    expect(r.font).toBe(6);
  });
});

describe("loadSettings", () => {
  it("bozuk / eksik ayarda varsayılana döner", () => {
    expect(loadSettings("{bozuk").mode).toBe("fit");
    expect(loadSettings(JSON.stringify({ pages: 7, font: 99, cols: 4 }))).toMatchObject({ pages: 3, font: 9, cols: 4 });
  });
});

describe("stripName", () => {
  it("MNV. / MN. önekini kaldırır, diğerlerine dokunmaz", async () => {
    const { stripName } = await import("./printfit");
    expect(stripName("MNV.BIBER KG")).toBe("BIBER KG");
    expect(stripName("MN. PATLICAN MOR KG")).toBe("PATLICAN MOR KG");
    expect(stripName("MNV KURU INCIR KG")).toBe("MNV KURU INCIR KG");
    expect(stripName("SEN PILIC BAGET KG")).toBe("SEN PILIC BAGET KG");
  });
});
