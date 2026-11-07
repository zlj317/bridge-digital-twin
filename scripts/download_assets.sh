#!/usr/bin/env bash
# 下载桥梁数字孪生可免费商用（CC0）GLB 资产到 frontend/public/assets/models
# 直链格式：https://cdn.3dassets.dev/assets/{编号}/v1/model.glb
# 用法：bash scripts/download_assets.sh
set -u
base="https://cdn.3dassets.dev/assets"
dest="$(cd "$(dirname "$0")/.." && pwd)/frontend/public/assets/models"
mkdir -p "$dest"

declare -A map=(
  [25138]=25138.glb [13964]=13964.glb [15210]=15210.glb [32550]=32550.glb
  [15211]=15211.glb [27843]=27843.glb [32487]=32487.glb [13967]=13967.glb [13969]=13969.glb
)

for id in "${!map[@]}"; do
  out="$dest/${map[$id]}"
  if [ -f "$out" ]; then echo "skip -> ${map[$id]}"; continue; fi
  url="$base/$id/v1/model.glb"
  echo "GET $url"
  if curl -fsSL -o "$out" "$url" && [ -s "$out" ]; then
    echo "  ok -> ${map[$id]} ($(wc -c < "$out") bytes)"
  else
    rm -f "$out"; echo "  failed: $id（下次运行会重试）"
  fi
done
echo done
