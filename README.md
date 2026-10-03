# Naman v3.2 — Kasa stok kodu arama + yönetim paneli + sürümlü kod dökümanı

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

`nginx/naman.conf` dosyasını host nginx'inize uygulayın (`nginx -t && systemctl reload nginx`). Yeni kurulumda veritabanı **boş** başlar (hazır/seed veri yoktur); ürünleri panelden **Dosyadan ürün ekle** ile ya da JSON yedeği **Veri yükle** ile yükleyin.

İlk yönetici `.env`'deki `ADMIN_USERNAME` / `ADMIN_PASSWORD` ile oluşur (sonra `ADMIN_PASSWORD` satırını silin). Yönetim: `https://naman.xenny.cloud/admin`

## Yönetim paneli (/admin)

- **Ürünler / Kanallar / Barkodlar / Yemek kartları:** ekle, düzenle, sil. Yapılan her değişiklik kasa sayfasına anında yansır.
- **Görünür / gizli ürün:** Ürünler listesinde her ürünün **Durum** düğmesi (Görünür/Gizli) vardır; satırları işaretleyip toplu gizleyip gösterebilirsiniz. Gizli ürün sistemde kayıtlı kalır ama **kasa sayfasında ve dökümanda çıkmaz** (mevsimi geçen, şu an satılmayan ürünler). Üstteki Tümü / Görünür / Gizli düğmeleriyle filtrelenir.
- **Dosyadan ürün ekle:** Manav sipariş evrakı gibi bir listeyi yükleyin: **Excel (.xlsx)**, **CSV/TXT** ya da **JSON**. `Stok Kodu` + `Stok Adı` (ya da `Kod` + `Ürün Adı`) sütunları, `Ürün Grubu: …` satırları ve `Grup` sütunu tanınır. **Sistemde olmayan kodlar eklenir, olanlara dokunulmaz.** Eklemeden önce:
  - dosyadaki her grubun sistemde hangi gruba gideceğini seçersiniz (öneri: o gruptan sistemde zaten olan ürünlerin grubu, örn. "Meyve Siparişi" → "Egzotik Meyveler");
  - yeni ürünlerin görünürlüğünü seçersiniz: *siparişi/satışı olanlar görünür* (dosyada Sipariş/Satış/Miktar sütunu varsa), *hepsi görünür* ya da *hepsi gizli*; ürün ürün de değiştirilebilir;
  - sistemde gizli olup dosyada siparişi/satışı olan ürünler için "Bunları görünür yap" önerilir.
  - Eski `.xls` okunmaz (Excel'de "Farklı Kaydet → .xlsx"); PDF'ten ürün okunmaz.
- **Veri yükle:** (toplu düzeltme / yedekten geri yükleme) `.xlsx`, `.csv` ya da `.json`. Excel/CSV'de Grup sütunu yoksa sistemdeki ürünlerin grubu korunur; `.json` eski `products.json` biçimi ya da panelden indirilen yedek olabilir. Önce **önizleme** gösterilir (kaç kayıt eklenecek/güncellenecek/silinecek); onaylamadan hiçbir şey değişmez. Dosyada hata varsa (tekrarlanan kod, boş alan vb.) hiçbir şey yüklenmez ve nedeni listelenir.
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
- **Eski PDF'ler:** v1–v5 arşiv PDF'leri mevcut kurulumun veritabanında durur ve sürüm listesinde "PDF arşiv" etiketiyle görünür. (v3.2'den itibaren depoda seed/arşiv dosyası yoktur; yeni kurulumda sürüm listesi boş başlar, ilk "Yayınla" ile `v1` oluşur.)
- **Gizli ürünler** dökümana girmez; bir ürünü gizlemek sonraki sürüm notunda "silindi" olarak görünür.
- **Doğrudan bağlantılar:** `https://namdoc.xenny.cloud/?v=v3` gibi eski adresler aynen çalışır. Eski sürüm açıkken üstte uyarı ve "Güncel listeye dön" bağlantısı çıkar.
- **PDF / yazdırma:** Sayfadaki **"Yazdır / PDF"** düğmesi bir pencere açar. Sayfa sayısı seçilmez; **tarz** ve **yazı boyutu** seçilir, sayfa sayısı içeriğe göre ne çıkarsa odur (düğmede ve pencerede yazar):
  - Tarzlar: **Yatay · 2 sütun** (eski v1 PDF düzeni), **Dikey · 2 sütun**, **Yatay · 3 sütun** (daha sık). Yazı boyutu: Küçük / Normal / Büyük.
  - Düzen v1 gibidir: renkli bölüm başlıkları, çizgili (zebra) tablo satırları, her ürün tek satır, kod sağda ayrı sütunda; bölüm sütun sonunda bölünürse devamı "Sebze (devam)" başlığıyla sürer; her sayfada başlık ve "Sayfa 1 / 4".
  - Sayfalar tarayıcıya bırakılmaz, satırlar ölçülüp sayfalar uygulamada kurulur; penceredeki önizleme basılacak sayfaların aynısıdır.
  - **İçerik:** hangi kategorilerin dökümana gireceği seçilir: **Sebze**, **Meyve**, **Kasap**, **Şarküteri** (listede olanlar, yanında ürün sayısı). Ayrıca satış birimine göre: **Kilogramlık (KG)** / **Adetli / paketli**. Birim ürün adından anlaşılır: adında `KG` geçen kilogramlık, geri kalanlar (`AD`, `ADET`, `PAKET`, `350 GR` gibi) adetli sayılır. Filtre açıksa her sayfanın başlığına "Kasap hariç · adetliler hariç" gibi not yazılır.
  - Seçenekler: yemek kartı / kanal / "kod nasıl girilir" kutusu, ad başındaki "MNV./MN." önekini yazmama. Seçim o cihazda hatırlanır.
  - Tarayıcının yazdırma ekranında ölçek Varsayılan / %100 olmalı. Kağıt yönü tarza göre otomatik gelir; tarayıcının tarih/adres üst bilgisi basılmaz.
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
- **Diğer** düğmesi, grup adı bu kategorilere uymayan ürün varsa çıkar (ör. "Adetli Ürünler" grubu).
- **Adetli** düğmesi tüm kategorilerden kilo ile değil adet / paket ile satılanları gösterir: adında `KG` geçmeyen ürünler (`AD`, `ADET`, `PKT`, `400 GR` …). Döküman yazdırma penceresindeki "Adetli / paketli" seçeneğiyle aynı kuraldır.

## Güncelleme (v3.1 → v3.2)

```bash
cd /opt/naman && git pull && docker compose up -d --build
```

İlk açılışta `003_product_visible` migrasyonu çalışır: ürünlere görünürlük alanı eklenir, **mevcut tüm ürünler görünür** kalır. Ürün, döküman ve arşiv PDF verinize dokunulmaz. Seed yapısı (`api/seed/`, `seed.ts`) kaldırıldı; mevcut veritabanını etkilemez.

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
