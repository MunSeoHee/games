# backend/src/shared 서브모듈 문제 해결 스크립트

Write-Host "backend/src/shared 서브모듈 문제 해결 중..." -ForegroundColor Yellow

# 1. 서브모듈로 인식된 경우 제거
Write-Host "`n서브모듈 상태 제거 중..." -ForegroundColor Yellow
git rm --cached backend/src/shared 2>$null
git rm --cached -r backend/src/shared 2>$null

# 2. .git 폴더 확인 및 제거 (있다면)
$sharedGitPath = "backend\src\shared\.git"
if (Test-Path $sharedGitPath) {
    Write-Host "⚠ backend/src/shared/.git 발견! 제거 중..." -ForegroundColor Red
    Remove-Item -Path $sharedGitPath -Recurse -Force
    Write-Host "✓ backend/src/shared/.git 제거 완료" -ForegroundColor Green
}

# 3. frontend/src/shared도 확인
$frontendSharedGitPath = "frontend\src\shared\.git"
if (Test-Path $frontendSharedGitPath) {
    Write-Host "⚠ frontend/src/shared/.git 발견! 제거 중..." -ForegroundColor Red
    Remove-Item -Path $frontendSharedGitPath -Recurse -Force
    Write-Host "✓ frontend/src/shared/.git 제거 완료" -ForegroundColor Green
}

# 4. frontend 폴더 강제 추가
Write-Host "`nfrontend 폴더 추가 중..." -ForegroundColor Yellow
git add -f frontend/

# 5. shared 폴더들 추가
Write-Host "`nshared 폴더들 추가 중..." -ForegroundColor Yellow
git add backend/src/shared/
git add frontend/src/shared/ 2>$null

Write-Host "`n다음 단계:" -ForegroundColor Cyan
Write-Host "1. git add backend/src/shared frontend/" -ForegroundColor White
Write-Host "2. git commit -m 'Fix: Add frontend and shared folders'" -ForegroundColor White
Write-Host "3. git push" -ForegroundColor White
