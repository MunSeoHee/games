import mongoose, { Schema, Document } from 'mongoose';

export interface IGameSession extends Document {
  roomId: mongoose.Types.ObjectId;
  players: Array<{
    userId: mongoose.Types.ObjectId;
    username: string;
    cards?: Array<{ month: number; type: string }>;
    bet?: number;
    score?: number;
  }>;
  gameData: any; // 게임별 데이터 (섯다, 포커 등)
  result?: {
    winnerId: mongoose.Types.ObjectId;
    scores: Record<string, number>;
    moneyChanges: Record<string, number>;
  };
  createdAt: Date;
}

const GameSessionSchema = new Schema<IGameSession>({
  roomId: {
    type: Schema.Types.ObjectId,
    ref: 'GameRoom',
    required: true,
  },
  players: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    cards: [{
      month: Number,
      type: String,
      id: String,
    }],
    bet: Number,
    score: Number,
  }],
  gameData: {
    type: Schema.Types.Mixed,
    default: {},
  },
  result: {
    winnerId: Schema.Types.ObjectId,
    scores: Schema.Types.Mixed,
    moneyChanges: Schema.Types.Mixed,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 인덱스 생성 (성능 최적화)
GameSessionSchema.index({ roomId: 1 }); // 방 ID로 조회
GameSessionSchema.index({ createdAt: -1 }); // 최신 게임 조회
GameSessionSchema.index({ 'players.userId': 1 }); // 플레이어로 게임 찾기

export default mongoose.model<IGameSession>('GameSession', GameSessionSchema);
