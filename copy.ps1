$srcDir = "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b"
$destDir = "c:\Users\user\Documents\app\ai_tycoon\public\images"

function Ensure-Dir($dir) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
}

Ensure-Dir $destDir
Ensure-Dir "$destDir\characters"
Ensure-Dir "$destDir\avatars"
Ensure-Dir "$destDir\logos"
Ensure-Dir "$destDir\flags"

$files = Get-ChildItem -Path $srcDir -File -Force

# 1. Copy game_logo_candidates
$logoFiles = $files | Where-Object { $_.Name -like "game_logo_candidates_*.png" }
if ($logoFiles) {
    $latestLogo = $logoFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Copy-Item -Path $latestLogo.FullName -Destination "$destDir\game_logo_candidates.png" -Force
    Write-Host "Copied game_logo_candidates"
}

# 2. Copy characters
$charFiles = $files | Where-Object { $_.Name -like "char_*.png" }
foreach ($f in $charFiles) {
    $parts = $f.Name -split "_"
    if ($parts.Length -ge 2) {
        $name = $parts[1]
        Copy-Item -Path $f.FullName -Destination "$destDir\characters\$name.png" -Force
        Write-Host "Copied character: $name"
    }
}

# 3. Copy chibis
$chibiFiles = $files | Where-Object { $_.Name -like "chibi_*.png" }
foreach ($f in $chibiFiles) {
    $parts = $f.Name -split "_"
    if ($parts.Length -ge 2) {
        $name = $parts[1]
        Copy-Item -Path $f.FullName -Destination "$destDir\avatars\${name}_chibi.png" -Force
        Write-Host "Copied chibi: $name"
    }
}

# 4. Copy logos
$logoBrandFiles = $files | Where-Object { $_.Name -like "logo_*.png" }
foreach ($f in $logoBrandFiles) {
    $parts = $f.Name -split "_"
    if ($parts.Length -ge 2) {
        $name = $parts[1]
        Copy-Item -Path $f.FullName -Destination "$destDir\logos\$name.png" -Force
        Write-Host "Copied logo: $name"
    }
}

# 5. Copy flags
$flagFiles = $files | Where-Object { $_.Name -like "flag_*.png" }
foreach ($f in $flagFiles) {
    $parts = $f.Name -split "_"
    if ($parts.Length -ge 2) {
        $name = $parts[1]
        Copy-Item -Path $f.FullName -Destination "$destDir\flags\flag_$name.png" -Force
        Write-Host "Copied flag: flag_$name.png"
    }
}

Write-Host "Copy complete!"
