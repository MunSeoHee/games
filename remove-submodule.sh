#!/bin/bash
# frontend 서브모듈 완전 제거 스크립트

echo "frontend 서브모듈 완전 제거 중..."

# 1. .gitmodules 파일에서 frontend 제거 (있다면)
if [ -f ".gitmodules" ]; then
    echo "⚠ .gitmodules 파일 발견! frontend 항목 제거 중..."
    # frontend 관련 라인 제거
    sed -i '/\[submodule "frontend"\]/,/^$/d' .gitmodules 2>/dev/null || true
    # 빈 파일이면 삭제
    if [ ! -s ".gitmodules" ]; then
        rm .gitmodules
    fi
fi

# 2. Git 캐시에서 frontend 제거
echo "Git 캐시에서 frontend 제거 중..."
git rm --cached frontend 2>/dev/null || true
git rm --cached -r frontend 2>/dev/null || true

# 3. .git/config에서 서브모듈 설정 제거
echo ".git/config에서 서브모듈 설정 제거 중..."
git config --file=.git/config --remove-section submodule.frontend 2>/dev/null || true

# 4. frontend/.git 폴더 제거 (서브모듈의 .git 파일 또는 폴더)
if [ -f "frontend/.git" ]; then
    echo "⚠ frontend/.git 파일 발견! 제거 중..."
    rm -f frontend/.git
elif [ -d "frontend/.git" ]; then
    echo "⚠ frontend/.git 폴더 발견! 제거 중..."
    rm -rf frontend/.git
fi

# 5. .git/modules/frontend 제거 (서브모듈 메타데이터)
if [ -d ".git/modules/frontend" ]; then
    echo "⚠ .git/modules/frontend 발견! 제거 중..."
    rm -rf .git/modules/frontend
fi

# 6. frontend 폴더를 일반 폴더로 추가
echo ""
echo "frontend 폴더를 일반 폴더로 추가 중..."
git add frontend/

# 7. .gitmodules 커밋 (변경사항이 있다면)
if [ -f ".gitmodules" ]; then
    git add .gitmodules
fi

echo ""
echo "✓ 완료!"
echo ""
echo "다음 단계:"
echo "1. git status  # 상태 확인"
echo "2. git commit -m 'Remove frontend submodule, add as regular folder'"
echo "3. git push"
