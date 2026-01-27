# 온라인 멀티플레이어 게임 플랫폼

친구들과 함께 즐길 수 있는 온라인 멀티플레이어 게임 플랫폼입니다.

## 게임 목록

- 섯다 (현재 구현 중)
- 포커 (예정)
- 부루마불 (예정)

## 기능

- 계정 시스템 (회원가입/로그인)
- 공용 머니 시스템
- 캐릭터 시스템
- 실시간 멀티플레이어 게임
- 게임 방 시스템

## 기술 스택

- **프론트엔드**: React, TypeScript, Vite, Tailwind CSS, Socket.io-client
- **백엔드**: Node.js, Express, TypeScript, Socket.io, MongoDB
- **인증**: JWT

## 설치 및 실행

### 백엔드

```bash
cd backend
npm install
cp .env.example .env
# .env 파일을 편집하여 MongoDB URI와 JWT_SECRET 설정
npm run dev
```

### 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

## 환경 변수

### 백엔드 (.env)

```
PORT=3001
NODE_ENV=development
JWT_SECRET=your-secret-key
MONGODB_URI=mongodb://localhost:27017/game-platform
```
