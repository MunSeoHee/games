# 모든 Git 문제 해결 스크립트

Write-Host "Git 문제 해결 중..." -ForegroundColor Yellow

# 1. backend/src/shared 서브모듈 제거 (빌드 산출물이므로 Git에서 제외)
Write-Host "`nbackend/src/shared 서브모듈 제거 중..." -ForegroundColor Yellow
git rm --cached backend/src/shared 2>$null
git rm --cached -r backend/src/shared 2>$null

# 2. frontend 폴더 강제 추가
Write-Host "`nfrontend 폴더 추가 중..." -ForegroundColor Yellow
git add -f frontend/

# 3. .gitignore에 backend/src/shared 추가 (빌드 산출물이므로)
Write-Host "`n.gitignore 업데이트 중..." -ForegroundColor Yellow
$gitignoreContent = Get-Content .gitignore -Raw
if ($gitignoreContent -notmatch "backend/src/shared") {
    Add-Content .gitignore "`n# Build outputs (copied from shared)`nbackend/src/shared`nfrontend/src/shared"
    Write-Host "✓ .gitignore 업데이트 완료" -ForegroundColor Green
} else {
    Write-Host "✓ .gitignore에 이미 포함됨" -ForegroundColor Gray
}

Write-Host "`n다음 단계:" -ForegroundColor Cyan
Write-Host "1. git add .gitignore" -ForegroundColor White
Write-Host "2. git commit -m 'Fix: Add frontend folder and exclude build outputs'" -ForegroundColor White
Write-Host "3. git push" -ForegroundColor White
