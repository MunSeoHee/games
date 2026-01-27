import express from 'express';
import User from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// 머니 충전
router.post('/money/charge', authenticate, async (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '유효한 금액을 입력해주세요.' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    user.money += amount;
    await user.save();

    res.json({
      money: user.money,
      charged: amount,
    });
  } catch (error: any) {
    console.error('머니 충전 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 머니 사용 (게임에서 사용)
router.post('/money/use', authenticate, async (req: AuthRequest, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '유효한 금액을 입력해주세요.' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    if (user.money < amount) {
      return res.status(400).json({ error: '잔액이 부족합니다.' });
    }

    user.money -= amount;
    await user.save();

    res.json({
      money: user.money,
      used: amount,
    });
  } catch (error: any) {
    console.error('머니 사용 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 경험치 추가 및 레벨 업
router.post('/exp/add', authenticate, async (req: AuthRequest, res) => {
  try {
    const { exp } = req.body;

    if (!exp || exp <= 0) {
      return res.status(400).json({ error: '유효한 경험치를 입력해주세요.' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    user.characterExp += exp;
    
    // 레벨 업 체크 (레벨당 1000 경험치 필요)
    const expNeededForNextLevel = user.characterLevel * 1000;
    while (user.characterExp >= expNeededForNextLevel) {
      user.characterExp -= expNeededForNextLevel;
      user.characterLevel += 1;
    }

    await user.save();

    res.json({
      characterLevel: user.characterLevel,
      characterExp: user.characterExp,
      addedExp: exp,
    });
  } catch (error: any) {
    console.error('경험치 추가 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 게임 결과 업데이트
router.post('/game-result', authenticate, async (req: AuthRequest, res) => {
  try {
    const { won, moneyChange } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    user.totalGames += 1;
    if (won) {
      user.wins += 1;
    }

    if (moneyChange) {
      user.money += moneyChange;
    }

    // 승리 시 경험치 추가
    if (won) {
      user.characterExp += 100;
      const expNeededForNextLevel = user.characterLevel * 1000;
      while (user.characterExp >= expNeededForNextLevel) {
        user.characterExp -= expNeededForNextLevel;
        user.characterLevel += 1;
      }
    }

    await user.save();

    res.json({
      totalGames: user.totalGames,
      wins: user.wins,
      money: user.money,
      characterLevel: user.characterLevel,
      characterExp: user.characterExp,
    });
  } catch (error: any) {
    console.error('게임 결과 업데이트 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

export default router;
