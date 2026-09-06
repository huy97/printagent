#!/usr/bin/env bash
# Cài đặt PrintAgent trên macOS/Linux: tự cài Node LTS nếu thiếu rồi khởi động agent.
# Chạy: bash install.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NVM_VERSION="v0.40.3"
MIN_MAJOR=20

node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -v | sed 's/^v//' | cut -d. -f1
}

echo "PrintAgent - đang chuẩn bị môi trường"

if [ "$(node_major)" -lt "$MIN_MAJOR" ]; then
  echo "Chưa có Node.js $MIN_MAJOR trở lên, đang cài qua nvm..."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$MIN_MAJOR"
  nvm alias default "$MIN_MAJOR"
fi

echo "Node $(node -v) sẵn sàng"

cd "$ROOT"
if command -v yarn >/dev/null 2>&1; then
  yarn install
else
  npm install
fi

echo "Đang khởi động agent, trình duyệt sẽ tự mở màn hình cài đặt..."
node bin/printagent.js start
