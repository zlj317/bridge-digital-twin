# 下载桥梁数字孪生可免费商用（CC0）GLB 资产到 public/assets/models
# 直链格式：https://cdn.3dassets.dev/assets/{编号}/v1/model.glb
# 用法：powershell -ExecutionPolicy Bypass -File scripts/download_assets.ps1
$ErrorActionPreference = 'Continue'
$base = 'https://cdn.3dassets.dev/assets'
$dest = Join-Path $PSScriptRoot '..' 'frontend' 'public' 'assets' 'models'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# 编号 → 文件名（与 frontend/src/config/index.ts 的 ASSETS 及 ASSETS.md 保持一致）
$map = @{
  '25138' = '25138.glb'   # V05 小型厢式货车 → car_a
  '13964' = '13964.glb'   # V02 厢式货车 → car_b
  '15210' = '15210.glb'   # G01 直段双波形护栏 → railing
  '32550' = '32550.glb'   # G03 升降臂道闸 → gate
  '27843' = '27843.glb'   # G04 厂房钢柱（候选，未默认接入）
  '32487' = '32487.glb'   # V01 城市轿车（候选，未默认接入）
  '13967' = '13967.glb'   # V03 平板救援车（候选）
  '13969' = '13969.glb'   # V04 后装垃圾车（候选）
}

foreach ($id in $map.Keys) {
  $out = Join-Path $dest $map[$id]
  if (Test-Path $out) { Write-Host "skip -> $($map[$id])"; continue }
  $url = "$base/$id/v1/model.glb"
  Write-Host "GET $url"
  try {
    curl.exe -L --fail -o $out $url
    Write-Host "  ok -> $($map[$id])"
  } catch {
    Write-Warning "  failed: $_"
  }
}
Write-Host 'done'
