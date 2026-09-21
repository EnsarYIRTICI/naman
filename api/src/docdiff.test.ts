import { describe, expect, it } from "vitest";
import { describeChanges, type Snapshot } from "./docdiff";

const snap = (products: [string, string][], meal: [string, string][] = []): Snapshot => ({
  generatedAt: "x",
  products: products.map(([code, name]) => ({ code, name, group: "Sebze" })),
  channels: [{ name: "Getir", code: "999914" }],
  mealCards: meal.map(([name, posName]) => ({ name, posName })),
});

describe("describeChanges", () => {
  it("önceki sürüm yoksa ilk sürüm notu üretir", () => {
    const r = describeChanges(null, snap([["1", "A"]]));
    expect(r.hasChanges).toBe(true);
    expect(r.note).toContain("İlk sürüm: 1 ürün");
  });
  it("aynı içerikte değişiklik yok der ve not boş kalır", () => {
    const a = snap([["1", "A"], ["2", "B"]]);
    const r = describeChanges(a, snap([["1", "A"], ["2", "B"]]));
    expect(r.hasChanges).toBe(false);
    expect(r.note).toBe("");
  });
  it("eklenen / silinen / güncellenen ürünleri isimleriyle yazar", () => {
    const r = describeChanges(snap([["1", "A"], ["2", "B"], ["3", "C"]]), snap([["1", "A"], ["2", "B2"], ["4", "D"]]));
    expect(r.hasChanges).toBe(true);
    expect(r.note).toBe("Ürünler: 1 eklendi (D), 1 silindi (C), 1 güncellendi (B2)");
    expect(r.changes.find((c) => c.key === "products")).toMatchObject({ added: 1, removed: 1, updated: 1 });
  });
  it("çok kayıtta ilk 4 ismi gösterip kalanı sayar; yemek kartı değişimini de yakalar", () => {
    const many = Array.from({ length: 7 }, (_, i) => [String(100 + i), `URUN${i}`] as [string, string]);
    const r = describeChanges(snap([]), snap(many, [["Ticket", "Edenred"]]));
    expect(r.note).toContain("7 eklendi (URUN0, URUN1, URUN2, URUN3 +3)");
    expect(r.note).toContain("Yemek kartları: 1 eklendi (Ticket)");
  });
});
