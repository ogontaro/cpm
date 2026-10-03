#!/usr/bin/env bash
# Homebrew formula (Formula/cpm.rb) を標準出力へ生成する。
# usage: render-formula.sh <version> <checksums.txt>
set -euo pipefail

version="${1:?version (先頭のvなし) を指定してください}"
checksums="${2:?checksums.txt を指定してください}"
template="$(dirname "$0")/../homebrew/cpm.rb.in"

sha_of() {
  local sha
  sha="$(awk -v f="cpm-$1.tar.gz" '$2 == f { print $1 }' "$checksums")"
  if [[ ! "$sha" =~ ^[0-9a-f]{64}$ ]]; then
    echo "checksums.txt に cpm-$1.tar.gz の sha256 がありません" >&2
    exit 1
  fi
  echo "$sha"
}

darwin_arm64="$(sha_of darwin-arm64)"
darwin_amd64="$(sha_of darwin-amd64)"
linux_arm64="$(sha_of linux-arm64)"
linux_amd64="$(sha_of linux-amd64)"

sed \
  -e "s/@VERSION@/${version}/" \
  -e "s/@SHA_DARWIN_ARM64@/${darwin_arm64}/" \
  -e "s/@SHA_DARWIN_AMD64@/${darwin_amd64}/" \
  -e "s/@SHA_LINUX_ARM64@/${linux_arm64}/" \
  -e "s/@SHA_LINUX_AMD64@/${linux_amd64}/" \
  "$template"
