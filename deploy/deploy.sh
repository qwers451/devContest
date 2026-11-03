#!/usr/bin/env bash
# Развёртывание демо-стенда на сервере (после deploy/setup-server.sh).
# Запускать из корня репозитория на сервере (/opt/devcontest):
#   YOOKASSA_SHOP_ID=... YOOKASSA_SECRET_KEY=... bash deploy/deploy.sh
# .env создаётся один раз со случайными секретами; повторный запуск его не трогает.
set -euo pipefail

DOMAIN=developercontest.site
cd "$(dirname "$0")/.."
ROOT=$(pwd)

rand() { openssl rand -hex 24; }

if [ ! -f .env ]; then
  echo "==> .env"
  cat > .env <<EOF
COMPOSE_FILE=docker-compose.yml:deploy/docker-compose.prod.yml
COMPOSE_PROJECT_NAME=devcontest

USER_DB_PASSWORD=$(rand)
CONTEST_DB_PASSWORD=$(rand)
EVAL_DB_PASSWORD=$(rand)
PAYMENT_DB_PASSWORD=$(rand)
AUDIT_DB_PASSWORD=$(rand)
MONITORING_DB_PASSWORD=$(rand)
JWT_SECRET=$(rand)$(rand)
INTERNAL_SECRET=$(rand)

YOOKASSA_SHOP_ID=${YOOKASSA_SHOP_ID:-}
YOOKASSA_SECRET_KEY=${YOOKASSA_SECRET_KEY:-}
YOOKASSA_PAYOUT_AGENT_ID=
YOOKASSA_PAYOUT_SECRET_KEY=
YOOKASSA_RETURN_URL=https://$DOMAIN/payment/callback

SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_FROM="devContest <noreply@$DOMAIN>"
SMTP_TLS=false
FRONTEND_URL=https://$DOMAIN
VITE_GATEWAY_URL=https://$DOMAIN/api

EVALUATION_STUB=true
EOF
  chmod 600 .env
fi

echo "==> nginx + TLS"
if [ ! -f /etc/nginx/devcontest-mail.htpasswd ]; then
  MAIL_PW=$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-12)
  htpasswd -bc /etc/nginx/devcontest-mail.htpasswd demo "$MAIL_PW" >/dev/null
  echo "$MAIL_PW" > /root/devcontest-mail-password.txt
  chmod 600 /root/devcontest-mail-password.txt
fi
if [ ! -d /etc/letsencrypt/live/$DOMAIN ]; then
  # Первый выпуск: отвечает стандартный сайт nginx с корнем /var/www/html
  systemctl start nginx
  certbot certonly --webroot -w /var/www/html -d $DOMAIN -d www.$DOMAIN \
    --non-interactive --agree-tos --register-unsafely-without-email
fi
[ -f /etc/letsencrypt/options-ssl-nginx.conf ] || \
  cp /usr/lib/python3/dist-packages/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf /etc/letsencrypt/
rm -f /etc/nginx/sites-enabled/default
ln -sf "$ROOT/deploy/nginx/$DOMAIN.conf" /etc/nginx/sites-enabled/$DOMAIN.conf
sed -i 's/^\s*worker_processes .*/worker_processes 1;/' /etc/nginx/nginx.conf
nginx -t
systemctl reload nginx
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo "==> Сборка и наполнение"
bash deploy/reset-demo.sh --build

echo "==> Ночной сброс демо-данных в 04:00 МСК"
cat > /etc/cron.d/devcontest-reset <<EOF
0 4 * * * root cd $ROOT && bash deploy/reset-demo.sh >> /var/log/devcontest-reset.log 2>&1 && docker image prune -f >/dev/null
EOF

echo "Готово: https://$DOMAIN  (почта: https://$DOMAIN/mail/, логин demo, пароль в /root/devcontest-mail-password.txt)"
