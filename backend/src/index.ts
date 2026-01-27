import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
import gameRoutes from './routes/game';
import userRoutes from './routes/user';
import { setupSocketIO } from './socket/gameSocket';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const allowedOrigins = process.env.FRONTEND_URL 
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:3000', 'http://localhost:3001'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

const PORT = process.env.PORT || 3002;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/game-platform';

// 미들웨어
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// 라우트
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/game', gameRoutes);

// Socket.io 설정
setupSocketIO(io);

// 데이터베이스 연결
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB 연결 성공');
    httpServer.listen(PORT, () => {
      console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    });
  })
  .catch((error) => {
    console.error('MongoDB 연결 실패:', error);
    process.exit(1);
  });
