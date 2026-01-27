# frontend 폴더 Git 문제 해결 스크립트

Write-Host "frontend 폴더 Git 문제 해결 중..." -ForegroundColor Yellow

# 1. .git 폴더 확인 및 제거
$gitPath = "frontend\.git"
if (Test-Path $gitPath) {
    Write-Host "⚠ frontend/.git 발견! 제거 중..." -ForegroundColor Red
    Remove-Item -Path $gitPath -Recurse -Force
    Write-Host "✓ frontend/.git 제거 완료" -ForegroundColor Green
} else {
    Write-Host "✓ frontend/.git 없음" -ForegroundColor Gray
}

# 2. Git 캐시에서 frontend 제거
Write-Host "`nGit 캐시에서 frontend 제거 중..." -ForegroundColor Yellow
git rm --cached -r frontend 2>$null

Write-Host "`n다음 단계:" -ForegroundColor Cyan
Write-Host "1. git add frontend/" -ForegroundColor White
Write-Host "2. git commit -m 'Fix: Add frontend folder'" -ForegroundColor White
Write-Host "3. git push" -ForegroundColor White
