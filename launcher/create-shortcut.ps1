# ============================================================
#  다담 접수실 — 바탕화면 아이콘 만들기
#
#  1. 앱 아이콘(dadam.ico)을 그린다. 홈페이지 초록색 바탕에 "다담" 글자.
#  2. 바탕화면에 "다담 접수실" 바로가기를 만든다.
#     크롬을 --app 모드로 열어 주소창·탭 없는 앱 창처럼 뜬다.
#
#  다시 만들려면 이 파일을 PowerShell에서 실행하면 된다:
#     powershell -ExecutionPolicy Bypass -File .\create-shortcut.ps1
# ============================================================

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$icoPath     = Join-Path $launcherDir 'dadam.ico'
$appUrl      = 'https://dadam-reception.vercel.app/'

# ------------------------------------------------------------
# 1. 아이콘 그리기
# ------------------------------------------------------------
function New-DadamBitmap([int]$Size) {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $s = $Size / 256.0
    $g.ScaleTransform($s, $s)

    # 둥근 사각형 배경 — 홈페이지 초록 #16863b
    $r = 52; $x = 8; $y = 8; $w = 240; $h = 240
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x,             $y,             ($r*2), ($r*2), 180, 90)
    $path.AddArc(($x+$w-($r*2)), $y,             ($r*2), ($r*2), 270, 90)
    $path.AddArc(($x+$w-($r*2)), ($y+$h-($r*2)), ($r*2), ($r*2),   0, 90)
    $path.AddArc($x,             ($y+$h-($r*2)), ($r*2), ($r*2),  90, 90)
    $path.CloseFigure()
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0x16, 0x86, 0x3b))
    $g.FillPath($brush, $path)

    # 아래쪽 금색 띠 — 홈페이지 금색 #bfa37a
    $gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0xbf, 0xa3, 0x7a))
    $g.FillRectangle($gold, 72, 196, 112, 10)

    # "다담" 글자 (흰색, 굵게)
    $font = New-Object System.Drawing.Font('Malgun Gothic', 84, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment     = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(8, 0, 240, 236)
    $g.DrawString('다담', $font, [System.Drawing.Brushes]::White, $rect, $fmt)

    $font.Dispose(); $fmt.Dispose(); $gold.Dispose(); $brush.Dispose(); $path.Dispose(); $g.Dispose()
    return $bmp
}

$sizes = @(16, 32, 48, 64, 128, 256)
$pngs = @()
foreach ($size in $sizes) {
    $bmp = New-DadamBitmap -Size $size
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += ,$ms.ToArray()
    $ms.Dispose(); $bmp.Dispose()
}

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = $sizes[$i]
    $byteDim = if ($dim -ge 256) { 0 } else { $dim }
    $bw.Write([Byte]$byteDim); $bw.Write([Byte]$byteDim); $bw.Write([Byte]0); $bw.Write([Byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngs[$i].Length); $bw.Write([UInt32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($png in $pngs) { $bw.Write($png) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()
Write-Output "아이콘 생성: $icoPath"

# ------------------------------------------------------------
# 2. 바탕화면 바로가기
# ------------------------------------------------------------
$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw '크롬을 찾지 못했습니다.' }

$desktop      = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop '다담 접수실.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath       = $chrome
$shortcut.Arguments        = "--app=$appUrl"
$shortcut.WorkingDirectory = $desktop
$shortcut.IconLocation     = "$icoPath,0"
$shortcut.Description      = '다담 접수실 열기'
$shortcut.Save()
Write-Output "바로가기 생성: $shortcutPath"
