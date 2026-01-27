import mongoose, { Schema, Document } from 'mongoose';
import { GameType, GameRoomStatus } from '../shared/types/game';

export interface IGameRoom extends Document {
  hostId: mongoose.Types.ObjectId;
  players: Array<{
    userId: mongoose.Types.ObjectId;
    username: string;
    money: number;
    isReady: boolean;
  }>;
  gameType: GameType;
  status: GameRoomStatus;
  maxPlayers: number;
  baseBetCoins?: number; // 기본 배팅금 (코인 단위, 섯다는 10/50/100 코인 선택 가능)
  createdAt: Date;
}

const GameRoomSchema = new Schema<IGameRoom>({
  hostId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
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
    money: {
      type: Number,
      required: true,
    },
    isReady: {
      type: Boolean,
      default: false,
    },
  }],
  gameType: {
    type: String,
    enum: Object.values(GameType),
    required: true,
  },
  status: {
    type: String,
    enum: Object.values(GameRoomStatus),
    default: GameRoomStatus.WAITING,
  },
  maxPlayers: {
    type: Number,
    default: 4,
  },
  baseBetCoins: {
    type: Number,
    default: 10, // 기본값 10코인 (10만원)
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 인덱스 생성 (성능 최적화)
GameRoomSchema.index({ gameType: 1, status: 1 }); // 게임 타입과 상태로 필터링
GameRoomSchema.index({ hostId: 1 }); // 방장으로 조회
GameRoomSchema.index({ createdAt: -1 }); // 최신 방 조회
GameRoomSchema.index({ 'players.userId': 1 }); // 플레이어로 방 찾기

export default mongoose.model<IGameRoom>('GameRoom', GameRoomSchema);
