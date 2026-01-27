import express from 'express';
import GameRoom from '../models/GameRoom';
import { authenticate, AuthRequest } from '../middleware/auth';
import { GameType, GameRoomStatus } from '../shared/types/game';

const router = express.Router();

// 방 목록 조회
router.get('/rooms', async (req, res) => {
  try {
    const { gameType, status } = req.query;
    
    const filter: any = {};
    if (gameType) filter.gameType = gameType;
    if (status) filter.status = status;

    const rooms = await GameRoom.find(filter)
      .populate('hostId', 'username')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(rooms);
  } catch (error: any) {
    console.error('방 목록 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 방 생성
router.post('/rooms', authenticate, async (req: AuthRequest, res) => {
  try {
    const { gameType, maxPlayers, baseBetCoins } = req.body;

    if (!gameType || !Object.values(GameType).includes(gameType)) {
      return res.status(400).json({ error: '유효한 게임 타입을 선택해주세요.' });
    }

    // 기본 배팅금 검증 (섯다인 경우 10/50/100 코인만 허용)
    if (gameType === GameType.SEOTDA) {
      if (baseBetCoins && ![10, 50, 100].includes(baseBetCoins)) {
        return res.status(400).json({ error: '섯다는 10코인, 50코인, 100코인 중에서 선택해주세요.' });
      }
    }

    const user = await require('mongoose').model('User').findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    const room = new GameRoom({
      hostId: req.userId,
      players: [{
        userId: req.userId,
        username: user.username,
        money: user.money,
        isReady: false,
      }],
      gameType,
      maxPlayers: maxPlayers || 4,
      baseBetCoins: baseBetCoins || (gameType === GameType.SEOTDA ? 10 : undefined),
      status: GameRoomStatus.WAITING,
    });

    await room.save();
    await room.populate('hostId', 'username');

    res.status(201).json(room);
  } catch (error: any) {
    console.error('방 생성 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 방 조회
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const room = await GameRoom.findById(req.params.roomId)
      .populate('hostId', 'username')
      .populate('players.userId', 'username');

    if (!room) {
      return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    }

    res.json(room);
  } catch (error: any) {
    console.error('방 조회 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 방 참가
router.post('/rooms/:roomId/join', authenticate, async (req: AuthRequest, res) => {
  try {
    const room = await GameRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    }

    if (room.status !== GameRoomStatus.WAITING) {
      return res.status(400).json({ error: '참가할 수 없는 방입니다.' });
    }

    if (room.players.length >= room.maxPlayers) {
      return res.status(400).json({ error: '방이 가득 찼습니다.' });
    }

    // 이미 참가한 플레이어인지 확인 (더 엄격한 체크)
    const alreadyJoined = room.players.some((p) => {
      const playerUserId = p.userId instanceof require('mongoose').Types.ObjectId
        ? p.userId.toString()
        : String(p.userId);
      return playerUserId === String(req.userId);
    });
    if (alreadyJoined) {
      // 이미 참가한 경우 방 정보만 반환
      await room.populate('hostId', 'username');
      return res.json(room);
    }

    const user = await require('mongoose').model('User').findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    }

    room.players.push({
      userId: req.userId as any,
      username: user.username,
      money: user.money,
      isReady: false,
    });

    await room.save();
    await room.populate('hostId', 'username');

    res.json(room);
  } catch (error: any) {
    console.error('방 참가 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 방 나가기
router.post('/rooms/:roomId/leave', authenticate, async (req: AuthRequest, res) => {
  try {
    const room = await GameRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
    }

    if (room.status === GameRoomStatus.PLAYING) {
      return res.status(400).json({ error: '게임 중에는 나갈 수 없습니다.' });
    }

    room.players = room.players.filter(
      (p) => p.userId.toString() !== req.userId
    );

    // 방장이 나간 경우 방 삭제 또는 새로운 방장 지정
    if (room.hostId.toString() === req.userId) {
      if (room.players.length === 0) {
        await GameRoom.findByIdAndDelete(req.params.roomId);
        return res.json({ message: '방이 삭제되었습니다.' });
      } else {
        room.hostId = room.players[0].userId as any;
      }
    }

    await room.save();
    await room.populate('hostId', 'username');

    res.json(room);
  } catch (error: any) {
    console.error('방 나가기 오류:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

export default router;
