# 下载桥梁数字孪生可免费商用（CC0）GLB 资产到 public/assets/models
# 直链格式：https://cdn.3dassets.dev/assets/{编号}/v1/model.glb
# 用法：powershell -ExecutionPolicy Bypass -File scripts/download_assets.ps1
$ErrorActionPreference = 'Continue'
$base = 'https://cdn.3dassets.dev/assets'
$repoRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $repoRoot 'frontend/public/assets/models'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# 编号 → 文件名（与 frontend/src/config/index.ts 的 ASSETS 及 ASSETS.md 保持一致，共 9 个 CC0 资产）
$map = @{
  '25138' = '25138.glb'   # V05 小型厢式货车 → carA
  '13964' = '13964.glb'   # V02 厢式货车 → carB
  '15210' = '15210.glb'   # G01 直段双波形护栏 → railing
  '32550' = '32550.glb'   # G03 升降臂道闸 → gate
  '15211' = '15211.glb'   # G02 转角双波形护栏 → cornerRailing
  '27843' = '27843.glb'   # G04 厂房钢柱 → steelColumn
  '32487' = '32487.glb'   # V01 城市轿车 → cityCar
  '13967' = '13967.glb'   # V03 平板救援车 → rescueTruck
  '13969' = '13969.glb'   # V04 后装垃圾车 → garbageTruck
}

foreach ($id in ($map.Keys | Sort-Object)) {
  $out = Join-Path $dest $map[$id]
  if (Test-Path $out) { Write-Host "skip -> $($map[$id])"; continue }
  $url = "$base/$id/v1/model.glb"
  Write-Host "GET $url"
  curl.exe -sS -L --fail -o $out $url
  $size = if (Test-Path $out) { (Get-Item $out).Length } else { 0 }
  if ($LASTEXITCODE -ne 0 -or $size -eq 0) {
    Remove-Item $out -Force -ErrorAction SilentlyContinue
    Write-Warning "  failed: $($map[$id])"
  } else {
    Write-Host "  ok -> $($map[$id]) ($size bytes)"
  }
}
Write-Host 'done - 9 CC0 assets; failed items retry on next run'
