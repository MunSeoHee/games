#!/bin/bash
# 중첩된 Git 저장소 제거 스크립트
# backend, frontend, shared 폴더의 .git 폴더를 제거하여 모노레포로 통합

echo "중첩된 Git 저장소 제거 중..."

folders=("backend" "frontend" "shared")

for folder in "${folders[@]}"; do
    if [ -d "$folder/.git" ]; then
        echo "제거 중: $folder/.git"
        rm -rf "$folder/.git"
        echo "✓ $folder/.git 제거 완료"
    else
        echo "✓ $folder/.git 없음 (건너뜀)"
    fi
done

echo ""
echo "완료! 이제 'git add .' 명령어를 다시 실행하세요."
