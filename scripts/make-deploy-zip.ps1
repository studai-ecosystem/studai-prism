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
Get-ChildItem -Path $srcFull -Recurse -File -Force | ForEach-Object {
  # TrimStart guards against off-by-one prefix math (e.g. 8.3 short paths in
  # $env:TEMP) that produced entries like "/package.json" — Linux unzip then
  # extracts NOTHING usable and Kudu deploys 0 files (2026-07-05 incident).
  $rel = $_.FullName.Substring($srcFull.Length).TrimStart('\','/') -replace '\\','/'
  $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open()
  $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
  $es.Write($bytes, 0, $bytes.Length)
  $es.Close()
  $count++
}
$archive.Dispose()
$fs.Close()
if ($count -eq 0) { throw "Zip is empty — refusing to produce a no-op deploy artifact." }
$check = [System.IO.Compression.ZipFile]::OpenRead($Zip)
$bad = $check.Entries | Where-Object { $_.FullName.StartsWith('/') -or $_.FullName.Contains('\') } | Select-Object -First 1
$check.Dispose()
if ($bad) { throw "Zip entry '$($bad.FullName)' has a leading slash or backslash — Azure Linux cannot extract it." }
Write-Host "Entries: $count"
Write-Host ("Zip MB: " + [math]::Round((Get-Item $Zip).Length/1MB,1))
