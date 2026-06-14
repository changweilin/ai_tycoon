Add-Type -AssemblyName System.Drawing
$src = "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\game_logo_candidates_hitech_coldwar_1781410500716.png"
$dest = "c:\Users\user\Documents\app\ai_tycoon\public\images\game_logo.png"

if (Test-Path $src) {
    $img = [System.Drawing.Image]::FromFile($src)
    $w = $img.Width / 4
    $h = $img.Height / 4
    
    # Row 1, Column 3 (0-indexed: row 0, col 2)
    $left = 2 * $w
    $top = 0 * $h
    
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $rectDest = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $rectSrc = New-Object System.Drawing.Rectangle($left, $top, $w, $h)
    
    $g.DrawImage($img, $rectDest, $rectSrc, [System.Drawing.GraphicsUnit]::Pixel)
    
    # Ensure dest folder exists
    $destFolder = Split-Path $dest
    if (!(Test-Path $destFolder)) {
        New-Item -ItemType Directory -Force -Path $destFolder | Out-Null
    }
    
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
    Write-Output "SUCCESS: Cropped logo saved to $dest"
} else {
    Write-Output "ERROR: Source image not found at $src"
}
