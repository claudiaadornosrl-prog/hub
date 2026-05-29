$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

Write-Host "Deploy Claude Adorno hub -> GitHub Pages" -ForegroundColor Cyan
Write-Host ""

# git add + commit (si no hay cambios, no falla)
git add -A
$msg = Read-Host "Mensaje de commit (Enter para usar default)"
if ([string]::IsNullOrWhiteSpace($msg)) {
    $msg = "update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}
$diff = git diff --cached --stat
if ([string]::IsNullOrWhiteSpace($diff)) {
    Write-Host "Nada para commitear." -ForegroundColor Yellow
} else {
    git commit -m $msg
}

Write-Host ""
Write-Host "Pusheando..." -ForegroundColor Cyan
git push

Write-Host ""
Write-Host "Deploy OK." -ForegroundColor Green
Write-Host "URL: https://claudiaadornosrl-prog.github.io/hub/"
Write-Host "(puede tardar 1-2 min en GitHub Pages)"
