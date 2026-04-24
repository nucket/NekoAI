# Creates a portable Windows ZIP: nekoai-vX.Y.Z-portable-windows-x64.zip
#
# Usage (from repo root):
#   pwsh -File scripts/build-portable-windows.ps1
#
# What it does:
#   1. Builds the raw binary (no installer) via `tauri build --no-bundle`
#   2. Assembles a dist-portable/ staging directory with the exe + portable marker
#   3. Zips it and removes the staging directory
#
# The `portable` marker file tells NekoAI to store all data in ./data/ next to
# the exe instead of the user home directory — safe to run from a USB drive.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pkg     = Get-Content package.json -Raw | ConvertFrom-Json
$version = $pkg.version
$zipName = "nekoai-v$version-portable-windows-x64.zip"
$distDir = "dist-portable"
$exePath = "src-tauri/target/release/nekoai.exe"

Write-Host "==> Building NekoAI v$version portable (Windows x64)..."

npm run tauri -- build --no-bundle

if (-not (Test-Path $exePath)) {
    Write-Error "Build succeeded but exe not found at: $exePath"
    exit 1
}

Write-Host "==> Assembling portable package..."

if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
New-Item -ItemType Directory $distDir | Out-Null

Copy-Item $exePath "$distDir/nekoai.exe"
New-Item -ItemType File "$distDir/portable" | Out-Null

if (Test-Path $zipName) { Remove-Item $zipName -Force }
Compress-Archive -Path "$distDir/*" -DestinationPath $zipName
Remove-Item $distDir -Recurse -Force

$size = (Get-Item $zipName).Length / 1MB
Write-Host "==> Done: $zipName ($([math]::Round($size, 1)) MB)"
