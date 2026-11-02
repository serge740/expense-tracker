Add-Type -AssemblyName System.Drawing
$dir = 'D:\project\ABY PROJECTS\expense-tracker\pwa-guides'
$out = Join-Path $dir 'marked'
New-Item -ItemType Directory -Force $out | Out-Null

$accent = [System.Drawing.Color]::FromArgb(255, 76, 195, 227)    # #4CC3E3
$deep   = [System.Drawing.Color]::FromArgb(255, 0, 98, 127)      # #00627F
$white  = [System.Drawing.Color]::White

function New-Rounded([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# Darken everything except a rounded window, and outline the window.
function Add-Spotlight($g, $bmp, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r, [int]$dim) {
  $hole = New-Rounded $x $y $w $h $r
  $all = New-Object System.Drawing.Drawing2D.GraphicsPath
  $all.AddRectangle((New-Object System.Drawing.RectangleF 0, 0, $bmp.Width, $bmp.Height))
  $all.AddPath($hole, $false)
  $all.FillMode = [System.Drawing.Drawing2D.FillMode]::Alternate
  $shade = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($dim, 3, 14, 20))
  $g.FillPath($shade, $all)
  # soft glow, then the crisp outline
  foreach ($k in 14, 9, 5) {
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(38, 76, 195, 227)), $k
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawPath($pen, $hole)
  }
  $line = New-Object System.Drawing.Pen $accent, 4
  $line.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($line, $hole)
}

# A white circle with a teal ring and a number (or a tick when $tick).
function Add-Badge($g, [float]$cx, [float]$cy, [string]$text, [bool]$tick, [float]$size) {
  $rect = New-Object System.Drawing.RectangleF ($cx - $size), ($cy - $size), ($size * 2), ($size * 2)
  $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
  $g.FillEllipse($shadow, ($rect.X + 2), ($rect.Y + 4), $rect.Width, $rect.Height)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $accent), $rect)
  $inner = New-Object System.Drawing.RectangleF ($rect.X + 4), ($rect.Y + 4), ($rect.Width - 8), ($rect.Height - 8)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $white), $inner)
  if ($tick) {
    $pen = New-Object System.Drawing.Pen $deep, ($size * 0.28)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round; $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pts = @((New-Object System.Drawing.PointF ($cx - $size * 0.42), ($cy + $size * 0.02)), (New-Object System.Drawing.PointF ($cx - $size * 0.1), ($cy + $size * 0.36)), (New-Object System.Drawing.PointF ($cx + $size * 0.46), ($cy - $size * 0.34)))
    $g.DrawLines($pen, $pts)
  } else {
    $font = New-Object System.Drawing.Font 'Segoe UI', ($size * 1.05), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
    $g.DrawString($text, $font, (New-Object System.Drawing.SolidBrush $deep), (New-Object System.Drawing.RectangleF ($cx - $size), ($cy - $size + 1), ($size * 2), ($size * 2)), $fmt)
  }
}

# A bold arrow from (x1,y1) ending with the head at (x2,y2).
function Add-Arrow($g, [float]$x1, [float]$y1, [float]$x2, [float]$y2, [float]$width) {
  $dark = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 0, 0, 0)), ($width + 4)
  $pen = New-Object System.Drawing.Pen $accent, $width
  $dark.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $pen.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 4.2, 4.6, $true
  $g.DrawLine($dark, $x1 + 2, $y1 + 3, $x2 + 2, $y2 + 3)
  $g.DrawLine($pen, $x1, $y1, $x2, $y2)
}

# A tap marker: rings spreading from a solid dot (where a finger should press).
function Add-Tap($g, [float]$cx, [float]$cy, [float]$size) {
  foreach ($i in 3, 2, 1) {
    $r = $size * (0.55 + $i * 0.42)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb((70 + (3 - $i) * 40), 255, 255, 255)), 3
    $g.DrawEllipse($pen, ($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
  }
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 0, 0))), ($cx - $size * 0.55 + 2), ($cy - $size * 0.55 + 3), ($size * 1.1), ($size * 1.1))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $white), ($cx - $size * 0.55), ($cy - $size * 0.55), ($size * 1.1), ($size * 1.1))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $accent), ($cx - $size * 0.38), ($cy - $size * 0.38), ($size * 0.76), ($size * 0.76))
}

# A label on the picture: white text on a deep teal pill, anchored by its top-left corner (or its right edge when $right).
function Add-Pill($g, [string]$text, [float]$x, [float]$y, [float]$px, [bool]$right) {
  $font = New-Object System.Drawing.Font 'Segoe UI Semibold', $px, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
  $m = $g.MeasureString($text, $font)
  $w = $m.Width + $px * 1.4; $h = $px * 2.1
  if ($right) { $x = $x - $w }
  $shadow = New-Rounded ($x + 2) ($y + 4) $w $h ($h / 2)
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 0, 0, 0))), $shadow)
  $pill = New-Rounded $x $y $w $h ($h / 2)
  $g.FillPath((New-Object System.Drawing.SolidBrush $deep), $pill)
  $g.DrawPath((New-Object System.Drawing.Pen $accent, 2), $pill)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString($text, $font, (New-Object System.Drawing.SolidBrush $white), (New-Object System.Drawing.RectangleF $x, $y, $w, $h), $fmt)
}

function Open-Canvas([string]$name) {
  $src = [System.Drawing.Image]::FromFile((Join-Path $dir $name))
  $bmp = New-Object System.Drawing.Bitmap $src.Width, $src.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
  $src.Dispose()
  return @{ Bmp = $bmp; G = $g }
}

# ── Step 1: the Share row ──
$c = Open-Canvas 'step-1.jpeg'
Add-Spotlight $c.G $c.Bmp 170 684 274 48 14 150
Add-Badge $c.G 168 686 '1' $false 20
Add-Tap $c.G 400 708 14
Add-Pill $c.G 'Tap Share' 30 600 22 $false
Add-Arrow $c.G 110 646 158 690 6
Add-Pill $c.G 'First tap the three dots in Safari' 488 1030 16 $true
$c.Bmp.Save((Join-Path $out 'step-1-marked.png'), [System.Drawing.Imaging.ImageFormat]::Png); $c.G.Dispose(); $c.Bmp.Dispose()

# ── Step 2: Add to Home Screen ──
$c = Open-Canvas 'step-2.jpeg'
Add-Spotlight $c.G $c.Bmp 58 578 964 92 24 150
Add-Badge $c.G 80 580 '2' $false 30
Add-Tap $c.G 930 624 26
Add-Pill $c.G 'Look for: Add to Home Screen' 1030 468 34 $true
Add-Arrow $c.G 760 540 760 574 8
Add-Pill $c.G 'Then tap "Add" at the top right' 58 704 28 $false
$c.Bmp.Save((Join-Path $out 'step-2-marked.png'), [System.Drawing.Imaging.ImageFormat]::Png); $c.G.Dispose(); $c.Bmp.Dispose()

# ── Step 3: the AbyEx icon; the other apps are blurred (they are not ours to show) ──
$src = [System.Drawing.Image]::FromFile((Join-Path $dir 'step-3.jpeg'))
$W = $src.Width; $H = $src.Height
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'HighQuality'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.DrawImage($src, 0, 0, $W, $H)
# a blurred copy (shrink, then enlarge smoothly) laid over the app area, except the icon window
$small = New-Object System.Drawing.Bitmap ([int]($W / 14)), ([int]($H / 14))
$gs = [System.Drawing.Graphics]::FromImage($small); $gs.InterpolationMode = 'HighQualityBicubic'; $gs.DrawImage($src, 0, 0, $small.Width, $small.Height); $gs.Dispose()
$blur = New-Object System.Drawing.Bitmap $W, $H
$gb = [System.Drawing.Graphics]::FromImage($blur); $gb.InterpolationMode = 'HighQualityBicubic'; $gb.DrawImage($small, 0, 0, $W, $H); $gb.Dispose()
$hole = New-Rounded 372 76 102 122 22
$area = New-Object System.Drawing.Drawing2D.GraphicsPath
$area.AddRectangle((New-Object System.Drawing.RectangleF 0, 62, $W, ($H - 62)))
$area.AddPath($hole, $false)
$area.FillMode = [System.Drawing.Drawing2D.FillMode]::Alternate
$g.SetClip($area)
$g.DrawImage($blur, 0, 0, $W, $H)
$g.ResetClip()
$src.Dispose()
Add-Spotlight $g $bmp 372 76 102 122 22 70
Add-Badge $g 372 80 '3' $true 22
Add-Tap $g 423 128 14
Add-Pill $g 'Look for the AbyEx icon' 488 236 21 $true
Add-Arrow $g 410 232 424 204 6
Add-Pill $g 'Tap it to open the app' 488 290 17 $true
$bmp.Save((Join-Path $out 'step-3-marked.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()

Get-ChildItem $out | ForEach-Object { "$($_.Name) $([int]($_.Length/1KB)) KB" }
