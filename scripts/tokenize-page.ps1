# One-shot token mapper: swaps the legacy palette for design-system CSS vars.
# Ordered rules: button PAIRS first (so dark-on-gold doesn't become dark-on-ink),
# then flat hex -> var() mappings. Idempotent; targeted files only.
param([string[]]$Files)

$pairRules = [ordered]@{
  # gold CTA buttons -> ink buttons with paper text
  'bg-[#C9A84C] text-[#0A0D14]'                = 'bg-[var(--color-ink)] text-[var(--color-paper)]'
  'bg-[#C9A84C] hover:bg-[#E8C96A] text-[#0A0D14]' = 'bg-[var(--color-ink)] hover:opacity-90 text-[var(--color-paper)]'
  # navy buttons with gold label -> ink buttons with paper label
  'text-[#C9A84C] tracking-wide hover:bg-[#252A3A]' = 'text-[var(--color-paper)] tracking-wide hover:opacity-90'
  'text-[#C9A84C] hover:bg-[#252A3A]'          = 'text-[var(--color-paper)] hover:opacity-90'
}

$flatRules = [ordered]@{
  '#C9A84C' = 'var(--color-accent)'
  '#E8C96A' = 'var(--color-accent-bright)'
  '#B8902F' = 'var(--color-accent)'
  '#9A7724' = 'var(--color-accent)'
  '#9A7B20' = 'var(--color-accent)'
  '#0A0D14' = 'var(--color-ink)'
  '#111520' = 'var(--color-ink)'
  '#1A1A2E' = 'var(--color-ink)'
  '#1A1F2E' = 'var(--color-ink)'
  '#1A2A6C' = 'var(--color-ink)'
  '#252A3A' = 'var(--color-line)'
  '#2A2A3E' = 'var(--color-ink)'
  '#3A3A4A' = 'var(--color-ink)'
  '#3A4055' = 'var(--color-line)'
  '#64687A' = 'var(--color-ink-muted)'
  '#8A8FA0' = 'var(--color-ink-muted)'
  '#5A5F70' = 'var(--color-ink-muted)'
  '#7A7E90' = 'var(--color-ink-muted)'
  '#A0A4B0' = 'var(--color-ink-muted)'
  '#C5C9D6' = 'var(--color-ink-muted)'
  '#C9CDD8' = 'var(--color-ink-muted)'
  '#F0EDE6' = 'var(--color-paper)'
  '#F5F5FA' = 'var(--color-paper)'
  '#FAFAF8' = 'var(--color-paper)'
  '#F7F5F0' = 'var(--color-paper)'
  '#F8F6F1' = 'var(--color-paper)'
  '#FBF7EC' = 'var(--color-paper)'
  '#EEEEF4' = 'var(--color-paper)'
  '#EDEDF2' = 'var(--color-paper)'
  '#E0E0E8' = 'var(--color-line)'
  '#E8E8F0' = 'var(--color-line)'
  '#E8E0D0' = 'var(--color-line)'
  '#D0D0DC' = 'var(--color-line)'
  '#FFFFFF' = 'var(--color-surface)'
  '#E05252' = 'var(--color-danger)'
  '#C0392B' = 'var(--color-danger)'
  '#DC2626' = 'var(--color-danger)'
  '#E8C3BC' = 'var(--color-danger)'
  '#16A34A' = 'var(--color-success)'
  '#3CB97A' = 'var(--color-success)'
  '#047857' = 'var(--color-success)'
  '#1E7A45' = 'var(--color-success)'
  '#059669' = 'var(--color-success)'
  '#EAF7EE' = 'var(--color-success-surface)'
  '#BFE6CC' = 'var(--color-success)'
  '#7C6ADE' = 'var(--color-info)'
  '#4A9EE8' = 'var(--color-info)'
  '#3B5CA8' = 'var(--color-info)'
  '#1E3A8A' = 'var(--color-info)'
  '#9BB4E8' = 'var(--color-info)'
  '#C27803' = 'var(--color-reliability-moderate)'
  '#FCD34D' = 'var(--color-reliability-moderate)'
}

foreach ($f in $Files) {
  if (-not (Test-Path $f)) { Write-Host "MISSING $f"; continue }
  $text = [IO.File]::ReadAllText($f)
  foreach ($k in $pairRules.Keys) { $text = $text.Replace($k, $pairRules[$k]) }
  foreach ($k in $flatRules.Keys) {
    $text = $text.Replace($k, $flatRules[$k])
    $text = $text.Replace($k.ToLower(), $flatRules[$k])
  }
  [IO.File]::WriteAllText($f, $text)
  $left = ([regex]::Matches($text, '#[0-9a-fA-F]{3,8}\b') | ForEach-Object Value | Select-Object -Unique) -join ','
  Write-Host "$([IO.Path]::GetFileName($f)) leftover-hex: $(if ($left) { $left } else { 'NONE' })"
}
