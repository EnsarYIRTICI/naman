/**
 * Kasada girilecek kod: 7 haneli kod "290" ile başlıyorsa kasiyer bu öneki ve baştaki sıfırları atlayıp
 * kalan anlamlı haneleri girer (2900027 → 27, 2905083 → 5083). Diğer kodlar (293, 282, 300 ...) tam girilir, vurgu yok.
 * prefix: girilmeyen kısım, typed: girilecek (vurgulanan) kısım.
 */
export function splitCode(code: string): { prefix: string; typed: string } {
  if (/^290\d{4}$/.test(code)) {
    const typed = code.slice(3).replace(/^0+/, "");
    if (typed) return { prefix: code.slice(0, code.length - typed.length), typed };
  }
  return { prefix: code, typed: "" };
}
