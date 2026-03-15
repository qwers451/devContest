#!/bin/bash
# Генерация самоподписанного TLS-сертификата для локальной разработки
# Запускать из директории gateway/
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/server.key \
  -out certs/server.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=DevContest/CN=localhost"
echo "Сертификат создан: gateway/certs/server.crt"
