#!/bin/bash
# 모든 서브모듈 제거 스크립트 (frontend, shared, backend/src/shared 등)

echo "모든 서브모듈 제거 중..."

# 제거할 서브모듈 목록
SUBMODULES=("frontend" "shared" "backend/src/shared" "frontend/src/shared")

# 1. .gitmodules 파일 확인 및 정리
if [ -f ".gitmodules" ]; then
    echo "⚠ .gitmodules 파일 발견!"
    cat .gitmodules
    echo ""
    echo ".gitmodules 파일 삭제 중..."
    rm .gitmodules
fi

# 2. 각 서브모듈 처리
for submodule in "${SUBMODULES[@]}"; do
    if [ -d "$submodule" ] || [ -f "$submodule" ]; then
        echo ""
        echo "처리 중: $submodule"
        
        # Git 캐시에서 제거
        git rm --cached "$submodule" 2>/dev/null || true
        git rm --cached -r "$submodule" 2>/dev/null || true
        
        # .git/config에서 서브모듈 설정 제거
        git config --file=.git/config --remove-section "submodule.$submodule" 2>/dev/null || true
        
        # .git 파일/폴더 제거
        if [ -f "$submodule/.git" ]; then
            echo "  ⚠ $submodule/.git 파일 제거 중..."
            rm -f "$submodule/.git"
        elif [ -d "$submodule/.git" ]; then
            echo "  ⚠ $submodule/.git 폴더 제거 중..."
            rm -rf "$submodule/.git"
        fi
        
        # .git/modules에서 제거
        MODULE_NAME=$(echo "$submodule" | tr '/' '-')
        if [ -d ".git/modules/$MODULE_NAME" ]; then
            echo "  ⚠ .git/modules/$MODULE_NAME 제거 중..."
            rm -rf ".git/modules/$MODULE_NAME"
        fi
        
        # 슬래시를 언더스코어로 변환한 이름도 확인
        MODULE_NAME2=$(echo "$submodule" | tr '/' '_')
        if [ -d ".git/modules/$MODULE_NAME2" ]; then
            echo "  ⚠ .git/modules/$MODULE_NAME2 제거 중..."
            rm -rf ".git/modules/$MODULE_NAME2"
        fi
    fi
done

# 3. 모든 폴더를 일반 폴더로 추가
echo ""
echo "모든 폴더를 일반 폴더로 추가 중..."
git add -f frontend/ shared/ backend/src/shared/ frontend/src/shared/ 2>/dev/null || true

# 4. .gitmodules 제거 (변경사항이 있다면)
if [ -f ".gitmodules" ]; then
    git add .gitmodules
fi

echo ""
echo "✓ 완료!"
echo ""
echo "다음 단계:"
echo "1. git status  # 상태 확인"
echo "2. git add .  # 모든 변경사항 추가"
echo "3. git commit -m 'Remove all submodules, add as regular folders'"
echo "4. git push"
