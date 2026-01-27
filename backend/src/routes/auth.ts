import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 회원가입
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '사용자명과 비밀번호를 입력해주세요.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' });
    }

    // 중복 확인
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: '이미 사용 중인 사용자명입니다.' });
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // 사용자 생성
    const user = new User({
      username,
      password: hashedPassword,
      money: 10000, // 초기 머니
    });

    await user.save();

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        money: user.money,
        characterLevel: user.characterLevel,
        characterExp: user.characterExp,
      },
    });
  } catch (error: any) {
    console.error('회원가입 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '사용자명과 비밀번호를 입력해주세요.' });
    }

    // 사용자 찾기
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: '잘못된 사용자명 또는 비밀번호입니다.' });
    }

    // 비밀번호 확인
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: '잘못된 사용자명 또는 비밀번호입니다.' });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        money: user.money,
        characterLevel: user.characterLevel,
        characterExp: user.characterExp,
      },
    });
  } catch (error: any) {
    console.error('로그인 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 현재 사용자 정보 조회
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    res.json({
      id: user._id,
      username: user.username,
      money: user.money,
      characterLevel: user.characterLevel,
      characterExp: user.characterExp,
      totalGames: user.totalGames,
      wins: user.wins,
    });
  } catch (error: any) {
    console.error('사용자 정보 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

export default router;
