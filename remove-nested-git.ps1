# 중첩된 Git 저장소 제거 스크립트
# backend, frontend, shared 폴더의 .git 폴더를 제거하여 모노레포로 통합

Write-Host "중첩된 Git 저장소 제거 중..." -ForegroundColor Yellow

$folders = @("backend", "frontend", "shared")

foreach ($folder in $folders) {
    $gitPath = Join-Path $folder ".git"
    if (Test-Path $gitPath) {
        Write-Host "제거 중: $gitPath" -ForegroundColor Red
        Remove-Item -Path $gitPath -Recurse -Force
        Write-Host "✓ $folder/.git 제거 완료" -ForegroundColor Green
    } else {
        Write-Host "✓ $folder/.git 없음 (건너뜀)" -ForegroundColor Gray
    }
}

Write-Host "`n완료! 이제 'git add .' 명령어를 다시 실행하세요." -ForegroundColor Green
