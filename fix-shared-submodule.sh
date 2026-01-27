#!/bin/bash
# backend/src/shared 서브모듈 문제 해결 스크립트

echo "backend/src/shared 서브모듈 문제 해결 중..."

# 1. 서브모듈로 인식된 경우 제거
echo ""
echo "서브모듈 상태 제거 중..."
git rm --cached backend/src/shared 2>/dev/null
git rm --cached -r backend/src/shared 2>/dev/null

# 2. .git 폴더 확인 및 제거 (있다면)
if [ -d "backend/src/shared/.git" ]; then
    echo "⚠ backend/src/shared/.git 발견! 제거 중..."
    rm -rf backend/src/shared/.git
    echo "✓ backend/src/shared/.git 제거 완료"
fi

# 3. frontend/src/shared도 확인
if [ -d "frontend/src/shared/.git" ]; then
    echo "⚠ frontend/src/shared/.git 발견! 제거 중..."
    rm -rf frontend/src/shared/.git
    echo "✓ frontend/src/shared/.git 제거 완료"
fi

# 4. frontend 폴더 강제 추가
echo ""
echo "frontend 폴더 추가 중..."
git add -f frontend/

# 5. shared 폴더들 추가
echo ""
echo "shared 폴더들 추가 중..."
git add backend/src/shared/
git add frontend/src/shared/ 2>/dev/null

echo ""
echo "다음 단계:"
echo "1. git add backend/src/shared frontend/"
echo "2. git commit -m 'Fix: Add frontend and shared folders'"
echo "3. git push"
