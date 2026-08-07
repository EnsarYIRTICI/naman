# install-naman.sh

naman'ı sıfırdan bir Ubuntu sunucusuna kurar (nginx + Let's Encrypt wildcard sertifika + deploy),
ya da altyapı zaten kuruluysa sadece son değişiklikleri çekip yayına alır.

## Gereksinimler

- Ubuntu 22.04+ / root erişimi (`sudo`)
- Bir Cloudflare API token'ı (DNS-01 doğrulaması için — bkz. aşağıdaki "Cloudflare Token" bölümü)
- `${BASE_DOMAIN}` (script içinde `xenny.cloud`) domaininin Cloudflare üzerinde yönetiliyor olması

> **Not:** Repodaki branch adını (`main`/`master`) ve gerçek raw URL'ini kendi reponuza göre
> doğrulayın; aşağıdaki komutlarda `main` varsayıldı.

## Hızlı Kurulum

Scripti indirip inceledikten sonra çalıştırmak (önerilen):

```bash
curl -fsSL https://raw.githubusercontent.com/EnsarYIRTICI/naman/main/install-naman.sh -o install-naman.sh
chmod +x install-naman.sh
sudo ./install-naman.sh
```

Doğrudan pipe ile çalıştırmak (önce içeriğini gözden geçirmeden root olarak script
çalıştırmak risklidir, yalnızca scripti ve kaynağı güvendiğiniz durumlarda kullanın):

```bash
curl -fsSL https://raw.githubusercontent.com/EnsarYIRTICI/naman/main/install-naman.sh | sudo bash
```

## Cloudflare Token

Script wildcard sertifika almak için Cloudflare DNS-01 doğrulaması kullanır ve şu dosyayı arar:

```
/root/.secrets/certbot/cloudflare.ini
```

Dosyanın içeriği (tek satır):

```
dns_cloudflare_api_token = <CLOUDFLARE_API_TOKEN>
```

Oluşturma:

```bash
mkdir -p /root/.secrets/certbot
cat > /root/.secrets/certbot/cloudflare.ini <<'EOF'
dns_cloudflare_api_token = <CLOUDFLARE_API_TOKEN>
EOF
chmod 600 /root/.secrets/certbot/cloudflare.ini
```

Token'a **Zone:DNS:Edit** yetkisi ilgili zone (`xenny.cloud`) için verilmiş olmalı.
Bu dosya yoksa script diğer her şeyi (nginx kurulumu, repo çekme, deploy) yapar ama
sertifika adımında net bir hata mesajıyla durur — script içinde hiçbir token
hardcode edilmemiştir.

## Ayarlanabilir Değişkenler

Script başındaki değişkenler kendi ortamınıza göre düzenlenmeli:

| Değişken         | Varsayılan                                  | Açıklama                                   |
| ---------------- | ------------------------------------------- | ------------------------------------------ |
| `DOMAIN`         | `naman.xenny.cloud`                         | naman'ın yayınlanacağı subdomain           |
| `BASE_DOMAIN`    | `xenny.cloud`                               | wildcard sertifikanın alınacağı kök domain |
| `REPO_URL`       | `https://github.com/EnsarYIRTICI/naman.git` | naman repo adresi                          |
| `REPO_DIR`       | `~/repo/naman`                              | reponun sunucuda klonlanacağı yer          |
| `WEB_DIR`        | `/var/www/naman.xenny.cloud`                | nginx'in servis edeceği dizin              |
| `CERT_EMAIL`     | `admin@xenny.cloud`                         | certbot bildirim maili — **değiştirin**    |
| `CF_CREDENTIALS` | `/root/.secrets/certbot/cloudflare.ini`     | Cloudflare token dosyasının yolu           |

## Script Ne Yapar

1. nginx kurulu değilse kurar ve başlatır.
2. certbot + `python3-certbot-dns-cloudflare` eklentisi kurulu değilse kurar.
3. `REPO_DIR`'de repo yoksa klonlar, varsa `git pull` ile günceller.
4. Repo içeriğini `rsync -a --delete` ile `WEB_DIR`'e kopyalar.
5. Wildcard sertifika (`*.xenny.cloud`) yoksa Cloudflare DNS-01 ile alır.
6. nginx configini 80 → 443 yönlendirmesi ve SSL ile yazar/günceller.
7. certbot yenilemesi sonrası nginx'i otomatik reload eden bir hook ekler.
8. nginx configini test edip (`nginx -t`) reload eder.

## Tekrar Çalıştırma

Script tamamen idempotent'tir — nginx, certbot, sertifika ve config için önce
mevcut durumu kontrol eder, eksik olanı tamamlar. Altyapı zaten hazırsa
(nginx kurulu, sertifika mevcut, config zaten https) script yalnızca:

```
git pull → rsync → nginx -t → systemctl reload nginx
```

adımlarını çalıştırır — yani eski `naman.sh` ile aynı işi görür. Deploy sonrası
her seferinde bu scripti çalıştırmanız yeterli.

## Sorun Giderme

- **`nginx -t` hata veriyor:** Config dosyasını (`/etc/nginx/sites-available/naman.xenny.cloud`)
  elle kontrol edin; script bir önceki geçerli configi ezmiş olabilir.
- **Sertifika alınamıyor:** `CF_CREDENTIALS` dosyasının varlığını, izinlerini (600) ve
  token'ın doğru zone yetkisine sahip olduğunu doğrulayın. `certbot certonly ... -v`
  ile elle çalıştırıp hatayı görebilirsiniz.
- **Site 404 veriyor:** `WEB_DIR` içinde `index.html` olduğundan ve `rsync`'in
  hatasız tamamlandığından emin olun.
