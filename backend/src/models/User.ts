import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  password: string;
  money: number;
  characterLevel: number;
  characterExp: number;
  totalGames: number;
  wins: number;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  money: {
    type: Number,
    default: 10000, // 초기 머니
    min: 0,
  },
  characterLevel: {
    type: Number,
    default: 1,
    min: 1,
  },
  characterExp: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalGames: {
    type: Number,
    default: 0,
  },
  wins: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 인덱스 생성 (성능 최적화)
UserSchema.index({ username: 1 }); // unique: true로 이미 인덱스 생성됨
UserSchema.index({ createdAt: -1 }); // 최신 사용자 조회용

export default mongoose.model<IUser>('User', UserSchema);
