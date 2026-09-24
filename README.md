# Naman v3.1 — Kasa stok kodu arama + yönetim paneli + sürümlü kod dökümanı

Kasiyerler için ürün/kod arama sayfası (`/`, giriş gerektirmez), kodları düzenleyip toplu veri yükleyebildiğiniz yönetim paneli (`/admin`, giriş gerekir) ve eski **namdoc** yerine geçen sürümlü "Kasa Ürün Kodları" dökümanı (`/dokuman`, giriş gerektirmez).

**Yığın:** Next.js 16 + TypeScript + Tailwind CSS 4 (arayüz) · Express 5 + TypeScript (API) · PostgreSQL 17 · Docker Compose. Nginx compose dışında, host'ta çalışır.

```
tarayıcı → host nginx ─┬─ /api/ → api (127.0.0.1:4100) → postgres (iç ağ)
                       └─ /     → web (127.0.0.1:3100)
```

## Kurulum

```bash
cp .env.example .env      # CHANGE_ME olanları doldurun; APP_ORIGIN = tarayıcıdaki adres
docker compose up -d --build
docker compose logs -f api
```

`nginx/naman.conf` dosyasını host nginx'inize uygulayın (`nginx -t && systemctl reload nginx`). İlk açılışta veritabanı **eski naman verisiyle** (158 ürün, kanal kodları, barkodlar, yemek kartları) otomatik dolar.

İlk yönetici `.env`'deki `ADMIN_USERNAME` / `ADMIN_PASSWORD` ile oluşur (sonra `ADMIN_PASSWORD` satırını silin). Yönetim: `https://naman.xenny.cloud/admin`

## Yönetim paneli (/admin)

- **Ürünler / Kanallar / Barkodlar / Yemek kartları:** ekle, düzenle, sil. Yapılan her değişiklik kasa sayfasına anında yansır.
- **Veri yükle:** `.json` (eski `products.json` biçimi ya da panelden indirilen yedek) veya ürün listesi için `.csv`. Önce **önizleme** gösterilir (kaç kayıt eklenecek/güncellenecek/silinecek); onaylamadan hiçbir şey değişmez. Dosyada hata varsa (tekrarlanan kod, boş alan vb.) hiçbir şey yüklenmez ve nedeni listelenir.
  - **Birleştir:** yeni kayıtlar eklenir, var olanlar güncellenir, hiçbir şey silinmez.
  - **Değiştir:** dosyada olmayan kayıtlar silinir; liste dosyadaki gibi olur.
- **CSV biçimi:** `Kod;Ürün Adı;Grup` (Excel'den "CSV olarak kaydet"; UTF-8 ya da Türkçe Windows kodlaması otomatik anlaşılır; ayraç `;` `,` veya sekme).
- **Yedek indir:** tüm veriyi JSON olarak indirir; aynı dosya "Değiştir" ile geri yüklenebilir.
- **Geçmiş:** her değişikliği (kim, ne zaman, ne) ve veri sürümünü gösterir. Kasa sayfasındaki `v9` gibi rozet veri sürümüdür.

## Döküman (namdoc.xenny.cloud)

Eskiden PDF'i elle üretip `index.html`'e sürüm satırı ekleyerek yayınlıyordunuz. Artık döküman **veriden otomatik** oluşur:

- **Güncel liste (canlı):** `/dokuman` her zaman veritabanındaki anlık veriyi gösterir. Panelde bir ürünü, kanalı ya da yemek kartını değiştirdiğiniz anda dökümana yansır; yayınlamanız gerekmez. Açık sayfa, sekmeye dönüldüğünde ve dakikada bir kendini yeniler. Görünüm v5 PDF düzenindedir (renkli bölümler, Sebze/Meyve 3 sütun, Kasap marka alt başlıklarıyla).
- **Sürüm yayınla (arşiv):** `/admin` → **Döküman** sekmesi. "Yayınla" o anki ürün, kanal ve yemek kartı verisinin kopyasını numaralı sürüm (`v7`, `v8` ...) olarak saklar. Yayınlanmış sürüm sonradan değişmez; `?v=v7` ile açılır. **Sürüm notu iki sürüm arasındaki farktan otomatik yazılır**, isterseniz düzenlersiniz. Veride değişiklik yoksa yayınlamaya izin vermez.
- **Son sürüm:** Arama sayfasındaki "Kod Dökümanı" düğmesinde görünen sürüm rozetidir. Yayınlarken otomatik işaretlenir, listeden **"Son sürüm yap"** ile değiştirilebilir. Kasiyerlerin gördüğü listeyi etkilemez (kasiyerler hep güncel listeyi görür).
- **Eski PDF'ler:** v1–v5 ilk kurulumda arşiv olarak yüklenir (birebir aynı dosyalar) ve sürüm listesinde "PDF arşiv" etiketiyle görünür. İlk açılışta mevcut veriden `v6` (ilk dijital sürüm) oluşturulur.
- **Doğrudan bağlantılar:** `https://namdoc.xenny.cloud/?v=v3` gibi eski adresler aynen çalışır. Eski sürüm açıkken üstte uyarı ve "Güncel listeye dön" bağlantısı çıkar.
- **PDF:** Yeni sürümler sayfa olarak gösterilir (telefonda okunur, metin aranabilir). PDF gerekirse sayfadaki **"Yazdır / PDF kaydet"** düğmesi tarayıcıdan A4 PDF üretir. (Sunucu tarafında ayrı PDF dosyası üretilmez.)
- **Sınırlar:** Sürümlere barkodlar dahil değildir (eski PDF'te de yoktu). Sürüm silmek geri alınamaz; son sürüm olarak işaretli sürüm silinemez. Arşiv PDF'ler sayfa içinde gömülü gösterilir, bazı telefonlarda yalnızca ilk sayfa görünebilir; "PDF'i yeni sekmede aç" bağlantısı vardır.

`nginx/namdoc.conf`: `namdoc.xenny.cloud` alan adını bu uygulamaya bağlar. Bu alan adında **sadece** döküman ve okuma API'si (`/api/public/`) açıktır; `/admin` ve girişli API'ler kapalıdır (404).

## Kullanıcı yönetimi

```bash
docker compose exec api node dist/cli.js user add <kullanici>      # şifre ekranda görünmez
docker compose exec api node dist/cli.js user passwd <kullanici>   # açık oturumlar kapanır
docker compose exec api node dist/cli.js user delete <kullanici>
docker compose exec api node dist/cli.js user list
```

Rol ayrımı yoktur: giriş yapan herkes her şeyi düzenleyebilir.

## Kasa sayfası hakkında

- **Kod gösterimi:** 7 haneli kod `290` ile başlıyorsa kasiyerin gireceği kısım sarı vurgulanır (`2900027` → **27**, `2905083` → **5083**); diğer kodlar tam girilir. Bu kural `kasa ürün kodları` PDF'indeki vurgulamayla 158/158 üründe aynıdır.
- **Çevrimdışı yedek:** sunucuya ulaşılamazsa cihazda kayıtlı son veri gösterilir (uyarı bandıyla).
- Sayfa `noindex` içerir (arama motorlarında görünmez).
- Kategori (Sebze/Meyve/Kasap/Şarküteri) grup adından belirlenir: "Kasap - ..." → Kasap, adında "meyve" geçen → Meyve, vb.

## Güncelleme (v3 → v3.1)

```bash
cd /opt/naman && git pull && docker compose up -d --build
```

Veritabanı şeması (döküman tablosu) ve arşiv PDF'ler ilk açılışta otomatik eklenir; mevcut ürün verinize dokunulmaz.

## Yedek (sunucu)

```bash
docker compose exec -T db pg_dump -U naman naman | gzip > naman-db-$(date +%F).sql.gz
```

Panelden indirilen JSON yedek de yeterlidir (ürünler, kanallar, barkodlar, yemek kartları), ama kullanıcıları içermez.

## Eski statik sitelerden geçiş

**namdoc:** `nginx/namdoc.conf` ile eski yapılandırmayı değiştirin (yedeğini alın); eski namdoc container'ını/klasörünü durdurup silebilirsiniz. Eski PDF'ler ve sürüm notları otomatik taşınır.

**naman:** `install-naman.sh` ve `/var/www/naman.xenny.cloud` altındaki statik dosyalar artık kullanılmaz. Nginx yapılandırmasını `nginx/naman.conf` ile değiştirin; wildcard sertifika ve yenileme hook'u aynen çalışmaya devam eder. Eski `data/products.json` içeriği ilk açılışta zaten otomatik yüklenir.

## Geliştirme

```bash
cd api && npm i && DATABASE_URL=postgres://... APP_ORIGIN=http://localhost:3100 ADMIN_USERNAME=admin ADMIN_PASSWORD=... PORT=4100 npm run dev
cd web && npm i && npm run dev        # http://localhost:3100 ; /api istekleri localhost:4100'e yönlenir
npm test                              # hem api/ hem web/ içinde
```

## Güvenlik notları

Şifreler scrypt ile hash'lenir, oturum belirteçleri veritabanında yalnızca SHA-256 özeti tutulur. Çerez: HttpOnly, SameSite=Strict, HTTPS'te Secure. Durum değiştiren isteklerde Origin kontrolü (CSRF). Hatalı girişte hız sınırı (IP başına 15 dk'da 8), bellekte tutulur, servis yeniden başlayınca sıfırlanır. PostgreSQL'in portu dışarı açılmaz.
