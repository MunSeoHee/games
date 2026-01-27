# Git 폴더 문제 해결 스크립트
# backend, frontend, shared 폴더를 Git에 제대로 추가

Write-Host "Git 폴더 문제 해결 중..." -ForegroundColor Yellow

# 1. 중첩된 Git 저장소 제거 확인
$folders = @("backend", "frontend", "shared")

foreach ($folder in $folders) {
    $gitPath = Join-Path $folder ".git"
    if (Test-Path $gitPath) {
        Write-Host "⚠ $folder/.git 발견! 제거 중..." -ForegroundColor Red
        Remove-Item -Path $gitPath -Recurse -Force
        Write-Host "✓ $folder/.git 제거 완료" -ForegroundColor Green
    }
}

# 2. Git 캐시에서 제거 (서브모듈로 인식된 경우)
Write-Host "`nGit 캐시에서 폴더 제거 중..." -ForegroundColor Yellow
foreach ($folder in $folders) {
    git rm --cached -r $folder 2>$null
}

Write-Host "`n다음 단계:" -ForegroundColor Cyan
Write-Host "1. git add backend/ frontend/ shared/" -ForegroundColor White
Write-Host "2. git commit -m 'Fix: Add backend, frontend, shared folders'" -ForegroundColor White
Write-Host "3. git push" -ForegroundColor White
