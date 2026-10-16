# Rasterize the M/L monogram paths from the SVG masters. No font or external library required.
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$iconDirectory = Join-Path $projectRoot 'icons'
$exports = @(
    @{Size=192;Name='icon-192.png';Source='logo.svg'},
    @{Size=512;Name='icon-512.png';Source='logo.svg'},
    @{Size=192;Name='icon-maskable-192.png';Source='logo-maskable.svg'},
    @{Size=512;Name='icon-maskable-512.png';Source='logo-maskable.svg'},
    @{Size=180;Name='apple-touch-icon.png';Source='logo.svg'},
    @{Size=32;Name='favicon-32.png';Source='logo.svg'},
    @{Size=16;Name='favicon-16.png';Source='logo.svg'}
)
foreach ($spec in $exports) {
    [xml]$svg = Get-Content -Raw -LiteralPath (Join-Path $iconDirectory $spec.Source)
    $background = [System.Drawing.ColorTranslator]::FromHtml($svg.svg.rect.fill)
    $group = $svg.svg.g
    $glyphScale = 1.0
    $offsetX = 0.0
    $offsetY = 0.0
    if ($group.transform) {
        $transformValues = [regex]::Matches($group.transform, '[-+]?(?:\d*\.)?\d+')
        $offsetX = [double]::Parse($transformValues[0].Value, [cultureinfo]::InvariantCulture)
        $offsetY = [double]::Parse($transformValues[1].Value, [cultureinfo]::InvariantCulture)
        $glyphScale = [double]::Parse($transformValues[2].Value, [cultureinfo]::InvariantCulture)
    }
    $renderSize = $spec.Size * 4
    $pixelScale = $renderSize / 512.0
    $canvas = [System.Drawing.Bitmap]::new($renderSize, $renderSize)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    # Composite only the antialiased white glyph onto the exact solid background below.
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($group.stroke), [single]([double]$group.'stroke-width' * $glyphScale * $pixelScale))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    foreach ($pathElement in $group.path) {
        if ($pathElement.d -match '[^ML0-9.,\s+-]') { throw 'This exporter supports M/L SVG paths only.' }
        $numbers = [regex]::Matches($pathElement.d, '[-+]?(?:\d*\.)?\d+')
        $points = @()
        for ($index = 0; $index -lt $numbers.Count; $index += 2) {
            $x = [double]::Parse($numbers[$index].Value, [cultureinfo]::InvariantCulture)
            $y = [double]::Parse($numbers[$index + 1].Value, [cultureinfo]::InvariantCulture)
            $points += [System.Drawing.PointF]::new([single](($x * $glyphScale + $offsetX) * $pixelScale), [single](($y * $glyphScale + $offsetY) * $pixelScale))
        }
        $graphics.DrawLines($pen, [System.Drawing.PointF[]]$points)
    }
    $bitmap = [System.Drawing.Bitmap]::new($spec.Size, $spec.Size)
    $resizer = [System.Drawing.Graphics]::FromImage($bitmap)
    $resizer.Clear($background)
    $resizer.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $resizer.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $resizer.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $resizer.DrawImage($canvas, [System.Drawing.Rectangle]::new(0, 0, $spec.Size, $spec.Size))
    $bitmap.Save((Join-Path $iconDirectory $spec.Name), [System.Drawing.Imaging.ImageFormat]::Png)
    $resizer.Dispose(); $bitmap.Dispose(); $pen.Dispose(); $graphics.Dispose(); $canvas.Dispose()
}
