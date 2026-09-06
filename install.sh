#!/usr/bin/env bash
# Cài PrintAgent trên macOS/Linux từ máy trắng: tự tải Node portable nếu thiếu,
# cài package từ npm rồi khởi động agent. Không cần quyền admin, git hay nvm.
#
#   curl -fsSL https://raw.githubusercontent.com/huy97/printagent/main/install.sh | bash
#
# Biến môi trường: PRINTAGENT_LANG=en, PRINTAGENT_NODE_TRACK=v22.x,
# PRINTAGENT_HOME=~/.printagent, PRINTAGENT_NO_START=1
set -euo pipefail

MIN_MAJOR=20
NODE_TRACK="${PRINTAGENT_NODE_TRACK:-v22.x}"
PACKAGE="${PRINTAGENT_PACKAGE:-@hyydev/printagent}"
HOME_DIR="${PRINTAGENT_HOME:-$HOME/.printagent}"
RUNTIME_DIR="$HOME_DIR/runtime"
APP_DIR="$HOME_DIR/app"
BIN_DIR="$HOME_DIR/bin"
LANG_CODE="$(printf '%s' "${PRINTAGENT_LANG:-vi}" | cut -c1-2)"

say() {
  if [ "$LANG_CODE" = "en" ]; then shift; printf '%s\n' "$1"; else printf '%s\n' "$1"; fi
}

die() {
  say "$1" "$2" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1
}

download() {
  # $1 url, $2 đích
  if need curl; then
    curl -fsSL --retry 3 "$1" -o "$2"
  elif need wget; then
    wget -qO "$2" "$1"
  else
    return 1
  fi
}

sha256_of() {
  if need shasum; then shasum -a 256 "$1" | cut -d' ' -f1
  elif need sha256sum; then sha256sum "$1" | cut -d' ' -f1
  else printf ''; fi
}

node_major() {
  "$1" -v 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

platform_slug() {
  local os arch
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) return 1 ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64 | amd64) arch=x64 ;;
    armv7l) arch=armv7l ;;
    ppc64le) arch=ppc64le ;;
    s390x) arch=s390x ;;
    *) return 1 ;;
  esac
  printf '%s-%s' "$os" "$arch"
}

# Các hàm dưới trả kết quả qua biến NODE để thông báo tiến độ vẫn ra được màn hình.
# Node portable trong thư mục dữ liệu, dùng lại nếu lần trước đã tải.
existing_runtime_node() {
  local candidate
  for candidate in "$RUNTIME_DIR"/node-*/bin/node; do
    [ -x "$candidate" ] || continue
    if [ "$(node_major "$candidate")" -ge "$MIN_MAJOR" ] 2>/dev/null; then
      NODE="$candidate"
      return 0
    fi
  done
  return 1
}

install_node() {
  local slug dist shasums file archive checksum actual target
  slug="$(platform_slug)" || die \
    "Không hỗ trợ $(uname -s) $(uname -m). Cài Node $MIN_MAJOR+ thủ công rồi chạy lại." \
    "Unsupported $(uname -s) $(uname -m). Install Node $MIN_MAJOR+ manually, then re-run."

  say "Chưa có Node.js $MIN_MAJOR trở lên, đang tải bản portable cho $slug..." \
      "Node.js $MIN_MAJOR+ not found, downloading a portable build for $slug..."

  dist="https://nodejs.org/dist/latest-$NODE_TRACK"
  mkdir -p "$RUNTIME_DIR"
  shasums="$RUNTIME_DIR/SHASUMS256.txt"
  download "$dist/SHASUMS256.txt" "$shasums" || die \
    "Không tải được danh sách bản Node. Kiểm tra kết nối mạng rồi chạy lại." \
    "Could not fetch the Node release list. Check your network and re-run."

  file="$(grep -o "node-v[0-9.]*-$slug\.tar\.gz" "$shasums" | head -1)"
  [ -n "$file" ] || die \
    "Không tìm thấy bản Node cho $slug." \
    "No Node build available for $slug."

  archive="$RUNTIME_DIR/$file"
  download "$dist/$file" "$archive" || die \
    "Tải Node thất bại." "Node download failed."

  checksum="$(grep " $file\$" "$shasums" | cut -d' ' -f1)"
  actual="$(sha256_of "$archive")"
  if [ -n "$actual" ] && [ "$actual" != "$checksum" ]; then
    rm -f "$archive"
    die "Bản Node tải về sai checksum, đã xoá. Chạy lại lệnh cài đặt." \
        "Checksum mismatch on the downloaded Node build; removed. Please re-run."
  fi

  tar -xzf "$archive" -C "$RUNTIME_DIR"
  rm -f "$archive" "$shasums"
  target="$RUNTIME_DIR/${file%.tar.gz}/bin/node"
  [ -x "$target" ] || die "Giải nén Node thất bại." "Extracting Node failed."
  NODE="$target"
}

say "PrintAgent - đang chuẩn bị môi trường" "PrintAgent - preparing your environment"

NODE=""
if need node && [ "$(node_major "$(command -v node)")" -ge "$MIN_MAJOR" ] 2>/dev/null; then
  NODE="$(command -v node)"
elif ! existing_runtime_node; then
  install_node
fi

NODE_HOME="$(cd "$(dirname "$NODE")/.." && pwd)"
NPM_CLI="$NODE_HOME/lib/node_modules/npm/bin/npm-cli.js"
[ -f "$NPM_CLI" ] || die \
  "Bản Node đang dùng không kèm npm. Cài lại Node LTS rồi chạy lại." \
  "This Node build has no npm. Reinstall Node LTS and re-run."

# Script postinstall của dependencies (puppeteer) gọi thẳng lệnh `node`, nên Node
# portable phải nằm trong PATH chứ không chỉ được gọi bằng đường dẫn tuyệt đối.
export PATH="$NODE_HOME/bin:$PATH"

say "Node $("$NODE" -v) sẵn sàng" "Node $("$NODE" -v) ready"

REPO_ROOT=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  grep -q '"name": *"@hyydev/printagent"' "$REPO_ROOT/package.json" 2>/dev/null || REPO_ROOT=""
fi

if [ -n "$REPO_ROOT" ]; then
  # Chạy từ mã nguồn đã tải về: cài dependencies tại chỗ thay vì lấy bản trên npm.
  say "Đang cài thư viện từ mã nguồn (có thể mất vài phút, gồm cả Chromium)..." \
      "Installing dependencies from source (may take a few minutes, includes Chromium)..."
  # --no-package-lock: dự án dùng yarn.lock, không để npm sinh thêm lockfile thứ hai.
  (cd "$REPO_ROOT" && "$NODE" "$NPM_CLI" install --no-audit --no-fund --no-package-lock)
  ENTRY="$REPO_ROOT/bin/printagent.js"
else
  say "Đang cài $PACKAGE (có thể mất vài phút, gồm cả Chromium)..." \
      "Installing $PACKAGE (may take a few minutes, includes Chromium)..."
  mkdir -p "$APP_DIR"
  "$NODE" "$NPM_CLI" install -g --prefix "$APP_DIR" --no-audit --no-fund "$PACKAGE" || die \
    "Cài package thất bại. Xem thông báo lỗi phía trên rồi chạy lại." \
    "Package install failed. Check the error above and re-run."
  ENTRY="$APP_DIR/lib/node_modules/@hyydev/printagent/bin/printagent.js"
fi

[ -f "$ENTRY" ] || die "Không tìm thấy file khởi chạy sau khi cài." "Entry script missing after install."

mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/printagent" <<LAUNCHER
#!/bin/sh
# Launcher do install.sh sinh ra: khoá đúng Node đã dùng lúc cài.
export PATH="$NODE_HOME/bin:\$PATH"
exec "$NODE" "$ENTRY" "\$@"
LAUNCHER
chmod +x "$BIN_DIR/printagent"

LINKED=""
for dir in /usr/local/bin "$HOME/.local/bin"; do
  [ -d "$dir" ] || mkdir -p "$dir" 2>/dev/null || continue
  [ -w "$dir" ] || continue
  if ln -sf "$BIN_DIR/printagent" "$dir/printagent" 2>/dev/null; then
    LINKED="$dir"
    break
  fi
done

if [ -n "$LINKED" ] && printf '%s' ":$PATH:" | grep -q ":$LINKED:"; then
  say "Đã cài lệnh: printagent" "Command installed: printagent"
else
  say "Đã cài lệnh tại $BIN_DIR/printagent. Thêm dòng sau vào ~/.zshrc hoặc ~/.bashrc để gọi ngắn gọn:
  export PATH=\"$BIN_DIR:\$PATH\"" \
      "Command installed at $BIN_DIR/printagent. Add this to ~/.zshrc or ~/.bashrc for a short command:
  export PATH=\"$BIN_DIR:\$PATH\""
fi

if [ "${PRINTAGENT_NO_START:-}" = "1" ]; then
  say "Bỏ qua bước khởi động theo yêu cầu. Chạy: $BIN_DIR/printagent start" \
      "Skipping startup as requested. Run: $BIN_DIR/printagent start"
  exit 0
fi

say "Đang khởi động agent, trình duyệt sẽ tự mở màn hình cài đặt..." \
    "Starting the agent, your browser will open the setup screen..."
exec "$BIN_DIR/printagent" start
