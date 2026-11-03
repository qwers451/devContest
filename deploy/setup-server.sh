#!/usr/bin/env bash
# Первичная настройка чистого Debian 12 под демо-стенд devContest (1 vCPU / 2 ГБ).
# Идемпотентен: можно запускать повторно.
#   ssh root@<server> 'bash -s' < deploy/setup-server.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "==> Пакеты"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install ca-certificates curl gnupg git ufw fail2ban nginx \
  certbot python3-certbot-nginx unattended-upgrades apache2-utils htop python3

echo "==> Часовой пояс"
timedatectl set-timezone Europe/Moscow

echo "==> Swap-файл 2 ГБ (zram остаётся приоритетным)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
fi
swapon --show | grep -q /swapfile || swapon -p 10 /swapfile
grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw,pri=10 0 0' >> /etc/fstab
cat > /etc/sysctl.d/90-devcontest.conf <<'EOF'
vm.swappiness = 60
vm.vfs_cache_pressure = 50
vm.overcommit_memory = 1
net.core.somaxconn = 1024
net.ipv4.tcp_fastopen = 3
EOF
sysctl -q --system

echo "==> Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
systemctl restart docker
systemctl enable -q docker

echo "==> Firewall: наружу только 22/80/443"
ufw delete allow ispmanager >/dev/null 2>&1 || true
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> SSH: только ключи (10- раньше хостерского 40-hosting.conf: в sshd побеждает первое значение)"
rm -f /etc/ssh/sshd_config.d/90-devcontest.conf
cat > /etc/ssh/sshd_config.d/10-devcontest.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 4
EOF
sshd -t && systemctl reload ssh

echo "==> fail2ban"
cat > /etc/fail2ban/jail.d/devcontest.conf <<'EOF'
[DEFAULT]
backend = systemd
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF
systemctl enable -q --now fail2ban
systemctl restart fail2ban

echo "==> Автообновления безопасности"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> Отключение LLMNR (порт 5355)"
mkdir -p /etc/systemd/resolved.conf.d
printf '[Resolve]\nLLMNR=no\n' > /etc/systemd/resolved.conf.d/no-llmnr.conf
systemctl restart systemd-resolved

echo "==> journald: не больше 200 МБ"
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\n' > /etc/systemd/journald.conf.d/size.conf
systemctl restart systemd-journald

echo "Готово."
