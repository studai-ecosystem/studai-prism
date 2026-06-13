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
  $rel = $_.FullName.Substring($srcFull.Length + 1) -replace '\\','/'
  $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
  $es = $entry.Open()
  $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
  $es.Write($bytes, 0, $bytes.Length)
  $es.Close()
  $count++
}
$archive.Dispose()
$fs.Close()
Write-Host "Entries: $count"
Write-Host ("Zip MB: " + [math]::Round((Get-Item $Zip).Length/1MB,1))
