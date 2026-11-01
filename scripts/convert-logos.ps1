Add-Type -AssemblyName System.Drawing

function Convert-ToPng($src, $dest) {
    $img = [System.Drawing.Image]::FromFile($src)
    $img.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
    Write-Host "Saved $dest"
}

$dir = "C:\Users\Asus\.gemini\antigravity\brain\3d200846-c133-4045-9575-c7422fbc73f2"

Convert-ToPng "$dir\milk_bill_app_icon_v2_1793509184393.jpg" "assets\images\icon.png"
Convert-ToPng "$dir\milk_bill_app_icon_v2_1793509184393.jpg" "assets\images\android-icon-foreground.png"
Convert-ToPng "$dir\milk_bill_logo_vertical_1793509249504.jpg" "assets\images\splash-icon.png"
Convert-ToPng "$dir\milk_bill_logo_vertical_1793509249504.jpg" "assets\images\milk-bill-logo-vertical.png"
Convert-ToPng "$dir\milk_bill_logo_horizontal_1793509232495.jpg" "assets\images\milk-bill-logo-horizontal.png"
Convert-ToPng "$dir\milk_bill_app_icon_v3_white_1793509199475.jpg" "assets\images\milk-bill-icon-white.png"

Write-Host "All logo PNG conversions completed successfully."

