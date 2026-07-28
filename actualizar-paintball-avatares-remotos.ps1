$ErrorActionPreference = 'Stop'

$source = 'C:\Users\mgo17\Documents\Codex\2026-07-24\qu\paintball\index.html'
$qrTarget = 'C:\Users\mgo17\Documents\QR pagina\paintball-firebase.html'
$gitTarget = 'C:\Users\mgo17\Documents\diadelcolegio-main\paintball-firebase.html'

if (!(Test-Path -LiteralPath $source)) {
    throw "No existe el archivo fuente: $source"
}

Copy-Item -LiteralPath $source -Destination $qrTarget -Force
Write-Host "Actualizado: $qrTarget"

if (Test-Path -LiteralPath (Split-Path -Parent $gitTarget)) {
    Copy-Item -LiteralPath $source -Destination $gitTarget -Force
    Write-Host "Actualizado: $gitTarget"

    Push-Location (Split-Path -Parent $gitTarget)
    git add paintball-firebase.html
    git commit -m "Mostrar avatares remotos en Paintball"
    git push origin main
    Pop-Location
} else {
    Write-Host "No encontre el clon de GitHub en C:\Users\mgo17\Documents\diadelcolegio-main"
    Write-Host "Solo copie el archivo a QR pagina."
}
