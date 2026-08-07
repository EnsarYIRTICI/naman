#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# install-naman.sh
#
# Bu script iki işi birden yapar:
#   1) Genel nginx + Let's Encrypt (wildcard, Cloudflare DNS-01) altyapısını
#      kurar/onarır (idempotent — zaten kuruluysa dokunmaz).
#   2) naman'ı repodan çekip web dizinine deploy eder.
#
# Her şey zaten kuruluysa (nginx + sertifika mevcut) script sadece repoyu
# günceller, dosyaları kopyalar ve nginx'i reload eder (eski naman.sh'ın işi).
# ==============================================================================

# ---------- Ayarlar (kendi ortamına göre düzenle) ----------
DOMAIN="naman.xenny.cloud"                 # naman'ın yayınlanacağı subdomain
BASE_DOMAIN="xenny.cloud"                  # wildcard sertifikanın alınacağı kök domain
REPO_URL="https://github.com/EnsarYIRTICI/naman.git"
REPO_DIR="${HOME}/repo/naman"
WEB_DIR="/var/www/${DOMAIN}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/${DOMAIN}"
CERT_EMAIL="admin@${BASE_DOMAIN}"          # certbot bildirim maili — değiştir
CF_CREDENTIALS="/root/.secrets/certbot/cloudflare.ini"

# ---------- Yardımcılar ----------
log() { echo -e ">> $*"; }
err() { echo -e "!! $*" >&2; }
die() { err "$*"; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

require_root() {
    [[ $EUID -eq 0 ]] || die "Bu script root ile çalıştırılmalı (sudo ./install-naman.sh)."
}

# ---------- nginx ----------
install_nginx() {
    if command_exists nginx; then
        log "nginx zaten kurulu, atlanıyor."
        return
    fi
    log "nginx kuruluyor..."
    apt update
    apt install -y nginx
    systemctl enable --now nginx
}

# ---------- certbot + cloudflare eklentisi ----------
install_certbot() {
    if command_exists certbot; then
        log "certbot zaten kurulu, atlanıyor."
        return
    fi
    log "certbot ve cloudflare dns eklentisi kuruluyor..."
    apt update
    apt install -y certbot python3-certbot-dns-cloudflare python3-certbot-nginx
}

# ---------- repo ----------
sync_repo() {
    if [[ -d "$REPO_DIR/.git" ]]; then
        log "Repo mevcut, güncelleniyor (git pull)..."
        git -C "$REPO_DIR" pull
    else
        log "Repo klonlanıyor..."
        mkdir -p "$(dirname "$REPO_DIR")"
        git clone "$REPO_URL" "$REPO_DIR"
    fi
}

deploy_files() {
    log "Dosyalar ${WEB_DIR} dizinine kopyalanıyor..."
    mkdir -p "$WEB_DIR"
    rsync -a --delete "$REPO_DIR"/ "$WEB_DIR"/
}

# ---------- geçici http-only config (sertifika alınana kadar) ----------
write_http_only_config() {
    log "Geçici HTTP nginx configi yazılıyor..."
    cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${WEB_DIR};
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
    ln -sf "$NGINX_SITE" "$NGINX_SITE_LINK"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl reload nginx
}

# ---------- sertifika ----------
cert_exists() {
    [[ -f "/etc/letsencrypt/live/${BASE_DOMAIN}/fullchain.pem" ]]
}

obtain_certificate() {
    [[ -f "$CF_CREDENTIALS" ]] || die "Cloudflare token dosyası yok: ${CF_CREDENTIALS}
Şu içerikle oluştur ve chmod 600 yap:
  dns_cloudflare_api_token = <CLOUDFLARE_API_TOKEN>"

    chmod 600 "$CF_CREDENTIALS"

    log "Wildcard sertifika alınıyor (*.${BASE_DOMAIN})..."
    certbot certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials "$CF_CREDENTIALS" \
        --dns-cloudflare-propagation-seconds 30 \
        -d "${BASE_DOMAIN}" -d "*.${BASE_DOMAIN}" \
        --email "$CERT_EMAIL" \
        --agree-tos \
        --non-interactive
}

# ---------- https config (80 -> 443 redirect + ssl) ----------
site_is_https() {
    [[ -f "$NGINX_SITE" ]] && grep -q "listen 443" "$NGINX_SITE"
}

write_https_config() {
    log "Nihai HTTPS nginx configi yazılıyor..."
    cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     /etc/letsencrypt/live/${BASE_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${BASE_DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root ${WEB_DIR};
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF
    ln -sf "$NGINX_SITE" "$NGINX_SITE_LINK"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl reload nginx
}

setup_renew_hook() {
    local hook_dir="/etc/letsencrypt/renewal-hooks/deploy"
    local hook_file="${hook_dir}/reload-nginx.sh"
    mkdir -p "$hook_dir"
    if [[ ! -f "$hook_file" ]]; then
        cat > "$hook_file" <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
        chmod +x "$hook_file"
        log "certbot yenileme sonrası nginx reload hook'u eklendi."
    fi
}

# ---------- ana akış ----------
main() {
    require_root

    install_nginx
    install_certbot
    sync_repo
    deploy_files

    if ! cert_exists; then
        # DNS-01 kullanıyoruz, doğrulama için nginx'in ayakta olması şart
        # değil ama site zaten görünür olsun diye önce http config yazıyoruz.
        [[ -f "$NGINX_SITE" ]] || write_http_only_config
        obtain_certificate
        write_https_config
        setup_renew_hook
    elif ! site_is_https; then
        log "Sertifika mevcut ama nginx configi https'e geçmemiş, düzeltiliyor..."
        write_https_config
        setup_renew_hook
    fi

    nginx -t
    systemctl reload nginx

    log "Tamamlandı: https://${DOMAIN}"
}

main "$@"