# Build a deploy zip with FORWARD-SLASH entry names (Linux-compatible).
# .NET Framework's ZipFile.CreateFromDirectory writes backslash separators,
# which Azure Linux cannot extract into directories. We add entries manually.
param(
  [string]$Source = "$env:TEMP\prism-stage",
  [string]$Zip    = "$env:TEMP\prism-prebuilt.zip"
)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $Zip) { Remove-Item $Zip -Force }
$srcFull = (Resolve-Path $Source).Path.TrimEnd('\')
$fs = [System.IO.File]::Open($Zip, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
$count = 0
# Enumerate with -Name so PowerShell hands us RELATIVE paths directly - no
# prefix/substring math. Substring-based math corrupted entry names twice
# (leading "/" 2026-07-05 AM; stray "e/" prefix 2026-07-05 PM) and Kudu then
# deployed 0 files / a garbage tree while reporting success.
Get-ChildItem -Path $srcFull -Recurse -File -Force -Name | ForEach-Object {
  $rel = ($_ -replace '\\','/').TrimStart('/')
  $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open()
  $bytes = [System.IO.File]::ReadAllBytes((Join-Path $srcFull $_))
  $es.Write($bytes, 0, $bytes.Length)
  $es.Close()
  $count++
}
$archive.Dispose()
$fs.Close()
if ($count -eq 0) { throw "Zip is empty - refusing to produce a no-op deploy artifact." }
# Structural verification: the app cannot run without these exact root paths.
$check = [System.IO.Compression.ZipFile]::OpenRead($Zip)
$names = @($check.Entries | ForEach-Object { $_.FullName })
$check.Dispose()
foreach ($required in @('package.json', 'server/index.js', 'dist/index.html')) {
  if ($names -notcontains $required) {
    throw "Zip is malformed: required entry '$required' missing (found e.g. '$($names[0])'). Refusing to deploy."
  }
}
$bad = $names | Where-Object { $_.StartsWith('/') -or $_.Contains('\') } | Select-Object -First 1
if ($bad) { throw "Zip entry '$bad' has a leading slash or backslash - Azure Linux cannot extract it." }
Write-Host "Entries: $count (verified: package.json, server/index.js, dist/index.html at root)"
Write-Host ("Zip MB: " + [math]::Round((Get-Item $Zip).Length/1MB,1))
