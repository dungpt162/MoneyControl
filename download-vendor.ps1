# Tải Vue 3 và Chart.js về thư mục vendor/ (chạy một lần, từ thư mục gốc dự án):
#   powershell -ExecutionPolicy Bypass -File .\download-vendor.ps1
$ErrorActionPreference = 'Stop'
$vendor = Join-Path $PSScriptRoot 'vendor'
New-Item -ItemType Directory -Force $vendor | Out-Null

$files = @(
  @{ Url = 'https://cdn.jsdelivr.net/npm/vue@3.5.13/dist/vue.esm-browser.prod.js'; Out = 'vue.esm-browser.prod.js' },
  @{ Url = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js';         Out = 'chart.umd.js' }
)
foreach ($f in $files) {
  $dest = Join-Path $vendor $f.Out
  Write-Host "Tải $($f.Url)"
  Invoke-WebRequest -Uri $f.Url -OutFile $dest -UseBasicParsing
  Write-Host ("  -> {0} ({1:N0} KB)" -f $dest, ((Get-Item $dest).Length / 1KB))
}
Write-Host 'Xong.'
