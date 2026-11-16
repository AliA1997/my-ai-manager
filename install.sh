#!/bin/sh
# see-plan installer for macOS and Linux. Never needs root, sudo or admin rights: everything goes under $HOME.
#   curl -fsSL https://github.com/AliA1997/my-lavish/releases/latest/download/install.sh | sh
#   wget -qO-  https://github.com/AliA1997/my-lavish/releases/latest/download/install.sh | sh
# Options (after `sh -s --` when piped):
#   --install-skill        also copy the Claude Code skill to ~/.claude/skills/my-lavish
#   --version vX.Y.Z       a specific release instead of the latest
#   --dir <path>           install folder (default ~/.see-plan/bin; also SEE_PLAN_INSTALL_DIR)
#   --from-file <archive>  install a see-plan-<os>-<arch>.tar.gz you downloaded yourself (no network)
#   --sums <SHA256SUMS>    the checksum file to check --from-file against (optional, recommended)
#   --no-modify-path       do not add the folder to your shell profile
# Behind a company proxy: HTTPS_PROXY / https_proxy are used by curl and wget. A company CA bundle:
#   SEE_PLAN_CA_BUNDLE=/path/ca.pem (passed to curl --cacert / wget --ca-certificate).
set -eu

VERSION="latest"
INSTALL_SKILL="${SEE_PLAN_INSTALL_SKILL:-0}"
INSTALL_DIR="${SEE_PLAN_INSTALL_DIR:-$HOME/.see-plan/bin}"
FROM_FILE=""
SUMS_FILE=""
MODIFY_PATH="${SEE_PLAN_MODIFY_PATH:-1}"
CA="${SEE_PLAN_CA_BUNDLE:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --install-skill) INSTALL_SKILL=1 ;;
    --version) VERSION="$2"; shift ;;
    --dir) INSTALL_DIR="$2"; shift ;;
    --from-file) FROM_FILE="$2"; shift ;;
    --sums) SUMS_FILE="$2"; shift ;;
    --no-modify-path) MODIFY_PATH=0 ;;
    -h|--help) sed -n '2,14p' "$0" 2>/dev/null || echo "see the header of install.sh"; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

fail() { echo "see-plan install: $*" >&2; exit 1; }

REPO="https://github.com/AliA1997/my-lavish/releases"
if [ "$VERSION" = "latest" ]; then BASE="$REPO/latest/download"; else BASE="$REPO/download/$VERSION"; fi

case "$(uname -s)" in
  Darwin) os=macos ;;
  Linux) os=linux ;;
  *) fail "unsupported OS: $(uname -s). On Windows use install.ps1." ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) fail "unsupported CPU: $(uname -m)" ;;
esac

# The Linux build embeds Node 22, which needs glibc 2.28+ (RHEL/CentOS 8+, Ubuntu 18.10+, Debian 10+).
if [ "$os" = linux ]; then
  glibc="$(getconf GNU_LIBC_VERSION 2>/dev/null | awk '{print $2}')"
  if [ -z "$glibc" ]; then
    echo "warning: glibc not found (Alpine/musl?). The prebuilt binary needs glibc; if it fails, use: npm install -g github:AliA1997/my-lavish" >&2
  else
    major="${glibc%%.*}"; minor="${glibc#*.}"; minor="${minor%%.*}"
    if [ "$major" -lt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -lt 28 ]; }; then
      fail "this system has glibc $glibc; the see-plan binary needs 2.28 or newer (RHEL/CentOS 7 is too old). Ask for a newer image, or run see-plan inside a container or WSL."
    fi
  fi
fi

ASSET="see-plan-$os-$arch.tar.gz"

# A writable temp folder: /tmp can be read-only or full on locked-down machines, so fall back to $HOME.
TMP="$(mktemp -d 2>/dev/null || true)"
if [ -z "$TMP" ] || [ ! -w "$TMP" ]; then
  TMP="$HOME/.see-plan/tmp.$$"
  mkdir -p "$TMP" || fail "cannot create a temp folder (tried mktemp and $TMP)"
fi
trap 'rm -rf "$TMP"' EXIT

download() { # url dest
  if command -v curl >/dev/null 2>&1; then
    if [ -n "$CA" ]; then curl -fsSL --retry 3 --cacert "$CA" "$1" -o "$2"; else curl -fsSL --retry 3 "$1" -o "$2"; fi
  elif command -v wget >/dev/null 2>&1; then
    if [ -n "$CA" ]; then wget -q --tries=3 --ca-certificate="$CA" -O "$2" "$1"; else wget -q --tries=3 -O "$2" "$1"; fi
  else
    fail "neither curl nor wget is installed. Download $ASSET and SHA256SUMS from $REPO in a browser, then run: sh install.sh --from-file $ASSET --sums SHA256SUMS"
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'
  else echo ""
  fi
}

if [ -n "$FROM_FILE" ]; then
  [ -f "$FROM_FILE" ] || fail "--from-file: $FROM_FILE not found"
  cp "$FROM_FILE" "$TMP/$ASSET"
  [ -n "$SUMS_FILE" ] && cp "$SUMS_FILE" "$TMP/SHA256SUMS"
  ASSET_NAME="$(basename "$FROM_FILE")"
else
  ASSET_NAME="$ASSET"
  echo "Downloading $ASSET ..."
  if ! download "$BASE/$ASSET" "$TMP/$ASSET"; then
    fail "download failed from $BASE/$ASSET.
  - Behind a company proxy? export HTTPS_PROXY=http://proxy.host:port and run again.
  - TLS/certificate error? export SEE_PLAN_CA_BUNDLE=/path/to/company-ca.pem and run again.
  - github.com blocked? Download $ASSET and SHA256SUMS on another machine, copy them here, and run:
      sh install.sh --from-file $ASSET --sums SHA256SUMS"
  fi
  download "$BASE/SHA256SUMS" "$TMP/SHA256SUMS" || fail "could not download SHA256SUMS from $BASE"
fi

if [ -f "$TMP/SHA256SUMS" ]; then
  expected="$(grep " \*\{0,1\}$ASSET_NAME\$" "$TMP/SHA256SUMS" | awk '{print $1}' | head -n 1)"
  [ -n "$expected" ] || fail "SHA256SUMS has no entry for $ASSET_NAME"
  actual="$(sha256 "$TMP/$ASSET")"
  if [ -z "$actual" ]; then
    echo "warning: no sha256sum, shasum or openssl found; the checksum was NOT checked." >&2
  else
    [ "$expected" = "$actual" ] || fail "checksum mismatch for $ASSET_NAME: expected $expected, got $actual"
    echo "Checksum OK."
  fi
else
  echo "warning: no SHA256SUMS given; the checksum was NOT checked (pass --sums SHA256SUMS)." >&2
fi

mkdir -p "$TMP/unpacked" "$INSTALL_DIR" || fail "cannot create $INSTALL_DIR. Pick a folder you own with --dir <path>."
[ -w "$INSTALL_DIR" ] || fail "$INSTALL_DIR is not writable. Pick a folder you own with --dir <path>."
tar -xzf "$TMP/$ASSET" -C "$TMP/unpacked" || fail "could not unpack $ASSET_NAME (is it the right file for $os-$arch?)"
for f in see-plan LICENSE NOTICE THIRD_PARTY_LICENSES.txt README.md; do
  [ -f "$TMP/unpacked/$f" ] && cp -f "$TMP/unpacked/$f" "$INSTALL_DIR/"
done
chmod 755 "$INSTALL_DIR/see-plan"

if ! version_out="$("$INSTALL_DIR/see-plan" --version 2>&1)"; then
  fail "the binary did not run: $version_out
  If it says 'Permission denied', $INSTALL_DIR is on a noexec mount; reinstall with --dir to a folder that allows running programs."
fi

if [ "$INSTALL_SKILL" = 1 ]; then
  mkdir -p "$HOME/.claude/skills/my-lavish"
  cp -f "$TMP/unpacked/skills/my-lavish/"* "$HOME/.claude/skills/my-lavish/"
  echo "Installed the Claude Code skill to ~/.claude/skills/my-lavish."
else
  echo "Skill not installed. Re-run with --install-skill to add it to ~/.claude/skills."
fi

echo "see-plan $version_out installed to $INSTALL_DIR."
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    shell_rc="$HOME/.profile"
    line="export PATH=\"$INSTALL_DIR:\$PATH\""
    case "${SHELL:-}" in
      */zsh) shell_rc="$HOME/.zshrc" ;;
      */bash) shell_rc="$HOME/.bashrc" ;;
      */fish) shell_rc="$HOME/.config/fish/config.fish"; line="fish_add_path \"$INSTALL_DIR\"" ;;
    esac
    if [ "$MODIFY_PATH" = 1 ] && { [ ! -e "$shell_rc" ] || [ -w "$shell_rc" ]; } && mkdir -p "$(dirname "$shell_rc")" 2>/dev/null; then
      if ! grep -qsF "$INSTALL_DIR" "$shell_rc"; then
        printf '\n# see-plan\n%s\n' "$line" >> "$shell_rc"
        echo "Added $INSTALL_DIR to your PATH in $shell_rc."
      fi
      echo "Open a new terminal, or run: . $shell_rc"
    else
      echo "Add it to your PATH, for example:"
      echo "  echo '$line' >> $shell_rc"
    fi
    ;;
esac
if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qsi microsoft /proc/version; then
  echo "WSL detected. Keep your projects inside WSL (for example ~/projects), not under /mnt/c: file watching is unreliable there."
  echo "The page opens in your Windows browser. If it does not, run: see-plan url"
fi
echo "Next: see-plan --help"
