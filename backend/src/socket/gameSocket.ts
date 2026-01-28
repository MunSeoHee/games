import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import GameRoom from '../models/GameRoom';
import User from '../models/User';
import { GameRoomStatus, GameType, Card } from '../shared/types/game';
import { initializeSeotdaGame, createDeck } from '../services/seotdaService';
import { calculateSeotdaScore, checkGusaDraw, compareSeotdaHands } from '../shared/utils/seotdaUtils';
import { calculateBetAmount, checkBettingRoundComplete, getNextAlivePlayerIndex } from '../services/bettingService';
import { BettingAction } from '../shared/types/game';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

// 게임 상태 저장소 (메모리)
const gameStates = new Map<string, {
  gameData: any;
  playerCards: Record<string, Card[]>;
  playerBets: Record<string, number>;
  playerBetsCoins: Record<string, number>; // 실제 베팅한 코인
  playerMoney?: Record<string, number>; // 각 플레이어의 현재 보유 금액 (코인 단위)
  currentPlayerIndex: number;
  phase: 'initial' | 'betting' | 'second-card' | 'showdown' | 'finished';
  bettingRound: number;
  baseBet: number; // 게임 내 기본 배팅금 (원 단위)
  baseBetCoins: number; // 실제 기본 배팅금 (코인 단위)
  currentBet: number;
  playerBettingStates: Record<string, any>;
  lastRaisePlayerIndex?: number;
}>();

// Socket.io 인증 미들웨어
const authenticateSocket = (socket: AuthenticatedSocket, next: any) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('인증 토큰이 필요합니다.'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as { userId: string };
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error('유효하지 않은 토큰입니다.'));
  }
};

export const setupSocketIO = (io: Server) => {
  // 인증 미들웨어 적용
  io.use(authenticateSocket);

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`사용자 연결: ${socket.userId}`);

    // 방 참가
    socket.on('room:join', async (roomId: string) => {
      try {
        const room = await GameRoom.findById(roomId);
        if (!room) {
          socket.emit('error', { message: '방을 찾을 수 없습니다.' });
          return;
        }

        // 게임이 이미 시작된 방이고, 플레이어가 방에 없으면 참가 불가
        if (room.status === GameRoomStatus.PLAYING) {
          const isPlayerInRoom = room.players.some(
            (p) => p.userId.toString() === socket.userId
          );
          if (!isPlayerInRoom) {
            socket.emit('error', { message: '이미 게임이 시작된 방입니다.' });
            return;
          }
        }

        socket.join(roomId);
        socket.emit('room:joined', { roomId });

        // 방의 모든 클라이언트에게 플레이어 목록 업데이트 전송
        const updatedRoom = await GameRoom.findById(roomId).populate('hostId', 'username');
        io.to(roomId).emit('room:update', updatedRoom);
      } catch (error: any) {
        console.error('방 참가 오류:', error);
        socket.emit('error', { message: '방 참가 중 오류가 발생했습니다.' });
      }
    });

    // 방 나가기
    socket.on('room:leave', async (roomId: string) => {
      try {
        socket.leave(roomId);
        socket.emit('room:left', { roomId });

        const room = await GameRoom.findById(roomId);
        if (room) {
          const updatedRoom = await GameRoom.findById(roomId).populate('hostId', 'username');
          io.to(roomId).emit('room:update', updatedRoom);
        }
      } catch (error: any) {
        console.error('방 나가기 오류:', error);
        socket.emit('error', { message: '방 나가기 중 오류가 발생했습니다.' });
      }
    });

    // 준비 상태 토글
    socket.on('room:ready', async (roomId: string) => {
      try {
        const room = await GameRoom.findById(roomId);
        if (!room) {
          socket.emit('error', { message: '방을 찾을 수 없습니다.' });
          return;
        }

        const player = room.players.find(
          (p) => p.userId.toString() === socket.userId
        );

        if (player) {
          player.isReady = !player.isReady;
          await room.save();

          const updatedRoom = await GameRoom.findById(roomId).populate('hostId', 'username');
          io.to(roomId).emit('room:update', updatedRoom);
        }
      } catch (error: any) {
        console.error('준비 상태 변경 오류:', error);
        socket.emit('error', { message: '준비 상태 변경 중 오류가 발생했습니다.' });
      }
    });

    // 채팅 메시지
    socket.on('room:chat', async (roomId: string, message: string) => {
      try {
        const user = await User.findById(socket.userId);
        if (!user) {
          socket.emit('error', { message: '사용자를 찾을 수 없습니다.' });
          return;
        }

        io.to(roomId).emit('room:chat', {
          userId: socket.userId,
          username: user.username,
          message,
          timestamp: new Date(),
        });
      } catch (error: any) {
        console.error('채팅 메시지 오류:', error);
        socket.emit('error', { message: '메시지 전송 중 오류가 발생했습니다.' });
      }
    });

    // 게임 시작 요청 (방장만 가능)
    socket.on('game:start', async (roomId: string) => {
      try {
        const room = await GameRoom.findById(roomId);
        if (!room) {
          socket.emit('error', { message: '방을 찾을 수 없습니다.' });
          return;
        }

        if (room.hostId.toString() !== socket.userId) {
          socket.emit('error', { message: '방장만 게임을 시작할 수 있습니다.' });
          return;
        }

        if (room.status !== GameRoomStatus.WAITING) {
          socket.emit('error', { message: '이미 게임이 진행 중입니다.' });
          return;
        }

        if (room.players.length < 2) {
          socket.emit('error', { message: '최소 2명 이상 필요합니다.' });
          return;
        }

        const allReady = room.players.every((p) => p.isReady);
        if (!allReady) {
          socket.emit('error', { message: '모든 플레이어가 준비되어야 합니다.' });
          return;
        }

        room.status = GameRoomStatus.PLAYING;
        await room.save();

        // 방 상태 업데이트 전송
        const updatedRoom = await GameRoom.findById(roomId).populate('hostId', 'username');
        io.to(roomId).emit('room:update', updatedRoom);

        // 섯다 게임 초기화
        if (room.gameType === GameType.SEOTDA) {
          // 코인을 원으로 변환 (1코인 = 10,000원)
          const baseBetCoins = room.baseBetCoins || 10; // 기본값 10코인
          const baseBet = baseBetCoins * 10000; // 게임 내 기본 배팅금 (원 단위)
          const gameData = initializeSeotdaGame(room.players.length, baseBet);
          const deck = gameData.deck;
          
          // 1단계: 기본 단위 금액을 모두 내고 시작 (코인 단위로 차감)
          const initialPotCoins = baseBetCoins * room.players.length;
          const playerBettingStates: Record<string, any> = {};
          
          for (const player of room.players) {
            const user = await User.findById(player.userId);
            if (!user || user.money < baseBetCoins) {
              socket.emit('error', { message: `${player.username}의 코인이 부족합니다. (필요: ${baseBetCoins}코인)` });
              return;
            }
            // 코인 단위로 차감
            user.money -= baseBetCoins;
            await user.save();
            
            playerBettingStates[player.userId.toString()] = {
              userId: player.userId.toString(),
              action: undefined,
              amount: 0,
              totalBet: baseBet, // 게임 내에서는 원 단위로 표시
              roundBet: 0, // 첫 번째 라운드 베팅 금액 (기본 베팅금은 포함하지 않음)
              roundBets: [], // 각 라운드별 배팅 금액 배열
              totalBetCoins: baseBetCoins, // 실제 차감되는 코인
              hasCalled: false,
              hasRaised: false,
              isAlive: true,
            };
            
          }
          
          // 게임 시작 시 각 플레이어가 건 기본 베팅금을 playerBets에 기록 및 보유 금액 초기화
          const initialPlayerBets: Record<string, number> = {};
          const initialPlayerBetsCoins: Record<string, number> = {};
          const initialPlayerMoney: Record<string, number> = {};
          
          // 각 플레이어의 베팅 후 보유 금액 기록 (위에서 이미 user.money 업데이트됨)
          for (const player of room.players) {
            const user = await User.findById(player.userId);
            if (user) {
              initialPlayerMoney[player.userId.toString()] = user.money; // 베팅 차감 후 보유 금액
              initialPlayerBets[player.userId.toString()] = baseBet;
              initialPlayerBetsCoins[player.userId.toString()] = baseBetCoins; // 게임 시작 시 기본 베팅 코인
            }
          }
          
          // 게임 상태에 코인 단위 저장
          const initialState = {
            gameData: {
              ...gameData,
              pot: baseBet * room.players.length, // 게임 내 포트 (원 단위)
              potCoins: initialPotCoins, // 실제 포트 (코인 단위)
              baseBetCoins, // 기본 배팅금 (코인 단위)
              phase: 'initial' as const, // 카드 선택 단계로 시작
              bettingRound: 1,
              playerBettingStates,
              playerSelectedRevealCard: {}, // 각 플레이어가 선택한 공개 카드
            },
            playerCards: {},
            playerBets: initialPlayerBets, // 게임 시작 시 기본 베팅금 기록
            playerBetsCoins: initialPlayerBetsCoins, // 게임 시작 시 기본 베팅 코인 기록
            playerMoney: initialPlayerMoney, // 게임 시작 시 각 플레이어의 보유 금액
            currentPlayerIndex: gameData.currentPlayerIndex,
            phase: 'initial' as const, // 카드 선택 단계로 시작
            bettingRound: 1,
            baseBet, // 게임 내 기본 배팅금 (원 단위)
            currentBet: baseBet,
            baseBetCoins, // 코인 단위 저장
            playerBettingStates,
            lastRaisePlayerIndex: undefined,
          };
          gameStates.set(roomId, initialState);

          // 2단계: 각 플레이어에게 카드 2장씩 나눠주기 (비공개, 선택 대기)
          const playerCards: Record<string, Card[]> = {};
          const playerSelectedRevealCard: Record<string, Card | null> = {}; // 각 플레이어가 선택한 공개 카드
          room.players.forEach((player, idx) => {
            playerCards[player.userId.toString()] = [deck[idx * 2], deck[idx * 2 + 1]]; // 2장 지급
            playerSelectedRevealCard[player.userId.toString()] = null; // 아직 선택 안 함
          });

          // 게임 상태 업데이트 (카드 추가)
          const currentState = gameStates.get(roomId);
          if (currentState) {
            currentState.playerCards = playerCards;
            currentState.phase = 'initial'; // 카드 선택 단계
            // playerBets는 이미 initialPlayerBets로 설정되었으므로 초기화하지 않음
            // playerSelectedRevealCard는 이미 초기화됨
          }

          // 각 플레이어에게 자신의 카드 2장 전송 (비공개)
          room.players.forEach((player) => {
            const playerSocket = Array.from(io.sockets.sockets.values()).find(
              (s: any) => s.userId === player.userId.toString()
            );
            if (playerSocket) {
              playerSocket.emit('game:state', {
                myCards: playerCards[player.userId.toString()],
                gameState: {
                  phase: 'initial', // 카드 선택 단계
                  bettingRound: 1,
                  currentPlayerIndex: gameData.currentPlayerIndex,
                  pot: baseBet * room.players.length, // 게임 내 포트 (원 단위)
                  baseBet,
                  currentBet: baseBet,
                  playerBets: { ...initialPlayerBets }, // 게임 시작 시 기본 베팅금
                  playerMoney: { ...initialPlayerMoney }, // 베팅 차감 후 보유 금액
                  dealerIndex: gameData.dealerIndex,
                },
              });
            }
          });

          // 게임 상태에 선택된 카드 정보 저장 (이미 초기화되어 있으므로 업데이트만)
          if (currentState) {
            if (!currentState.gameData.playerSelectedRevealCard) {
              currentState.gameData.playerSelectedRevealCard = {};
            }
            Object.assign(currentState.gameData.playerSelectedRevealCard, playerSelectedRevealCard);
          }
        }

        io.to(roomId).emit('game:started', { roomId });
      } catch (error: any) {
        console.error('게임 시작 오류:', error);
        socket.emit('error', { message: '게임 시작 중 오류가 발생했습니다.' });
      }
    });

    // 게임 액션 (섯다 등)
    socket.on('game:action', async (roomId: string, action: any) => {
      try {
        const room = await GameRoom.findById(roomId);
        if (!room) {
          socket.emit('error', { message: '방을 찾을 수 없습니다.' });
          return;
        }

        const gameState = gameStates.get(roomId);
        if (!gameState) {
          socket.emit('error', { message: '게임 상태를 찾을 수 없습니다.' });
          return;
        }

        if (room.gameType === GameType.SEOTDA) {
          if (action.type === 'select-reveal-card') {
            // 게임 시작 시 2장 중 1장 선택하여 공개
            const userId = socket.userId!;
            const selectedCard = action.selectedCard as Card;
            
            if (!selectedCard) {
              socket.emit('error', { message: '카드를 선택해야 합니다.' });
              return;
            }

            const playerCards = gameState.playerCards[userId];
            if (!playerCards || playerCards.length !== 2) {
              socket.emit('error', { message: '카드가 2장이 아닙니다.' });
              return;
            }

            // 선택한 카드가 플레이어의 카드에 포함되어 있는지 확인
            const isValidSelection = playerCards.some(card => card.id === selectedCard.id);
            if (!isValidSelection) {
              socket.emit('error', { message: '선택한 카드가 유효하지 않습니다.' });
              return;
            }

            // 선택한 카드 저장
            if (!gameState.gameData.playerSelectedRevealCard) {
              gameState.gameData.playerSelectedRevealCard = {};
            }
            gameState.gameData.playerSelectedRevealCard[userId] = selectedCard;

            // 모든 살아있는 플레이어에게 선택한 카드 공개 정보 전송
            const partiallyRevealed: Record<string, Card> = {};
            room.players.forEach((player) => {
              const pUserId = player.userId.toString();
              // 살아있는 플레이어만 확인
              if (gameState.playerBettingStates[pUserId]?.isAlive !== false) {
                const selectedCard = gameState.gameData.playerSelectedRevealCard?.[pUserId];
                if (selectedCard) {
                  partiallyRevealed[pUserId] = selectedCard;
                }
              }
            });

            io.to(roomId).emit('game:action', {
              action: {
                type: 'card-revealed',
                userId,
                card: selectedCard,
                partiallyRevealedCards: partiallyRevealed,
              },
              timestamp: new Date(),
            });

            // 모든 살아있는 플레이어가 카드를 선택했는지 확인
            const alivePlayers = room.players.filter((player) => {
              const pUserId = player.userId.toString();
              return gameState.playerBettingStates[pUserId]?.isAlive !== false;
            });
            const allSelected = alivePlayers.every((player) => {
              const pUserId = player.userId.toString();
              const selectedCard = gameState.gameData.playerSelectedRevealCard?.[pUserId];
              return selectedCard !== null && selectedCard !== undefined;
            });

            if (allSelected) {
              // 모든 플레이어가 카드를 선택했으면 베팅 라운드 시작
              gameState.phase = 'betting';
              
              // 모든 플레이어에게 베팅 라운드 시작 알림
              io.to(roomId).emit('game:action', {
                action: {
                  type: 'betting-round-start',
                  partiallyRevealedCards: partiallyRevealed,
                },
                gameState: {
                  phase: 'betting',
                  bettingRound: 1,
                  currentPlayerIndex: gameState.currentPlayerIndex,
                  pot: gameState.baseBet * room.players.length,
                  baseBet: gameState.baseBet,
                  currentBet: gameState.baseBet,
                  playerBets: gameState.playerBets,
                  playerMoney: gameState.playerMoney,
                  dealerIndex: gameState.gameData.dealerIndex,
                },
                timestamp: new Date(),
              });
            }

            return;
          } else if (action.type === 'betting-action') {
            // 한국 섯다 베팅 액션 처리
            const bettingAction = action.bettingAction as BettingAction;
            const playerIndex = room.players.findIndex(
              (p) => p.userId.toString() === socket.userId
            );

            if (playerIndex !== gameState.currentPlayerIndex) {
              socket.emit('error', { message: '당신의 턴이 아닙니다.' });
              return;
            }

            const userId = socket.userId!;
            const user = await User.findById(userId);
            if (!user) {
              socket.emit('error', { message: '사용자를 찾을 수 없습니다.' });
              return;
            }

            const playerBettingState = gameState.playerBettingStates[userId] || {
              userId,
              action: undefined,
              amount: 0,
              totalBet: gameState.baseBet,
              hasCalled: false,
              hasRaised: false,
              isAlive: true,
            };

            // 다이 처리
            if (bettingAction === 'die') {
              playerBettingState.isAlive = false;
              playerBettingState.action = 'die';
              gameState.playerBettingStates[userId] = playerBettingState;
              
              // 1인만 남았는지 확인
              const checkResult = checkBettingRoundComplete(
                room.players,
                gameState.playerBettingStates,
                gameState.lastRaisePlayerIndex,
                gameState.currentBet
              );
              
              if (checkResult.winnerId) {
                // 기권승 처리 (원을 코인으로 변환)
                const winnerUser = await User.findById(checkResult.winnerId);
                if (winnerUser) {
                  const potCoins = gameState.gameData.potCoins || Math.ceil(gameState.gameData.pot / 10000);
                  winnerUser.money += potCoins;
                  await winnerUser.save();
                }
                
                // 게임 종료 및 결과 전송
                const winnerId = checkResult.winnerId;
                const winnerPlayer = room.players.find((p) => String(p.userId) === String(winnerId));
                
                // 방 상태를 WAITING으로 변경하고 플레이어 준비 상태 초기화
                room.status = GameRoomStatus.WAITING;
                room.players.forEach((p) => (p.isReady = false));
                await room.save();
                gameStates.delete(roomId);
                
                const updatedRoom = await GameRoom.findById(roomId).populate('hostId', 'username');
                io.to(roomId).emit('room:update', updatedRoom);
                
                io.to(roomId).emit('game:action', {
                  action: {
                    type: 'game-end',
                    winnerId: winnerId,
                    reason: '기권승',
                    results: room.players.map((p) => ({
                      userId: p.userId.toString(),
                      username: p.username,
                      description: String(p.userId) === String(winnerId) ? '승리' : '패배',
                    })),
                  },
                  gameState: {
                    phase: 'finished',
                    pot: gameState.gameData.pot,
                    playerBettingStates: gameState.playerBettingStates,
                  },
                  timestamp: new Date(),
                });
                
                gameState.phase = 'finished';
                return;
              }
              
              // 다이 후 다음 플레이어로 턴 넘기기
              const nextPlayerIndex = getNextAlivePlayerIndex(
                playerIndex,
                room.players,
                gameState.playerBettingStates
              );
              
              if (nextPlayerIndex !== -1) {
                gameState.currentPlayerIndex = nextPlayerIndex;
              }
              
              // 모든 플레이어에게 게임 상태 업데이트 전송
              io.to(roomId).emit('game:action', {
                action: {
                  type: 'betting-action',
                  bettingAction: 'die',
                  userId,
                  username: user.username,
                },
                gameState: {
                  phase: gameState.phase,
                  bettingRound: gameState.bettingRound,
                  currentPlayerIndex: gameState.currentPlayerIndex,
                  pot: gameState.gameData.pot,
                  baseBet: gameState.baseBet,
                  currentBet: gameState.currentBet,
                  dealerIndex: gameState.gameData.dealerIndex,
                  playerBettingStates: gameState.playerBettingStates,
                  playerMoney: gameState.playerMoney,
                },
                timestamp: new Date(),
              });
              
              return; // 다이 처리 완료, 함수 종료
            } else {
              // 베팅 금액 계산 (게임 내에서는 원 단위로 계산)
              // 현재 라운드에서의 총 베팅 금액 = playerBettingState.totalBet (현재 라운드의 총 베팅)
              // 게임 시작 시 totalBet은 baseBet으로 초기화되고, 각 베팅 시 누적됨
              const playerTotalBet = playerBettingState.totalBet || gameState.baseBet;
              const betAmount = calculateBetAmount(
                bettingAction,
                gameState.currentBet,
                gameState.gameData.pot,
                gameState.baseBet,
                playerTotalBet
              );
              
              // 올인인 경우: 플레이어의 모든 코인을 원으로 변환
              const playerCoinsToWon = user.money * 10000; // 코인을 원으로 변환
              const actualBetAmount = betAmount === -1 ? playerCoinsToWon : betAmount;
              
              // 원을 코인으로 변환 (1코인 = 10,000원)
              const actualBetAmountCoins = Math.ceil(actualBetAmount / 10000);
              
              if (user.money < actualBetAmountCoins) {
                socket.emit('error', { message: '코인이 부족합니다.' });
                return;
              }

              // 코인 단위로 차감
              user.money -= actualBetAmountCoins;
              await user.save();
              
              // 플레이어 보유 금액 업데이트 (게임 상태에 저장)
              if (!gameState.playerMoney) {
                gameState.playerMoney = {};
              }
              gameState.playerMoney[userId] = user.money; // 현재 보유 코인

              // 베팅 상태 업데이트 (게임 내에서는 원 단위로 저장)
              playerBettingState.action = bettingAction;
              playerBettingState.amount = actualBetAmount; // 이번에 추가로 베팅한 금액 (원)
              // totalBet은 게임 시작부터 현재까지의 총 베팅 금액으로 업데이트 (누적)
              playerBettingState.totalBet = playerTotalBet + actualBetAmount;
              // roundBet은 현재 라운드에서 베팅한 금액 (라운드별로 누적)
              if (playerBettingState.roundBet === undefined) {
                playerBettingState.roundBet = 0;
              }
              playerBettingState.roundBet += actualBetAmount;
              
              // roundBets 배열 초기화 (없는 경우)
              if (!playerBettingState.roundBets) {
                playerBettingState.roundBets = [];
              }
              if (!playerBettingState.totalBetCoins) {
                playerBettingState.totalBetCoins = 0;
              }
              playerBettingState.totalBetCoins += actualBetAmountCoins; // 실제 베팅 코인
              
              if (bettingAction === 'call' || bettingAction === 'check') {
                // 콜/체크: 판 끝내기 신청, 이후 리레이즈 불가
                playerBettingState.hasCalled = true;
              } else if (bettingAction === 'half' || bettingAction === 'ddadang' || bettingAction === 'bbing' || bettingAction === 'allin') {
                // 레이즈 액션 (하프, 따당, 삥, 올인 등) - 콜로 취급되지 않음
                // 삥도 리레이즈로 취급 (선만 가능하지만 리레이즈임)
                playerBettingState.hasRaised = true;
                gameState.lastRaisePlayerIndex = playerIndex;
                // 새로운 베팅 금액 = 플레이어 총 베팅 금액
                gameState.currentBet = Math.max(gameState.currentBet, playerBettingState.totalBet);
              }
              // die는 이미 위에서 처리됨 (361번째 줄)
              
              gameState.playerBettingStates[userId] = playerBettingState;
              gameState.playerBets[userId] = (gameState.playerBets[userId] || 0) + actualBetAmount; // 게임 내 베팅 (원)
              // playerBetsCoins가 없으면 초기화 (게임 시작 시 이미 초기화되어 있지만 안전을 위해)
              if (!gameState.playerBetsCoins) {
                gameState.playerBetsCoins = {};
              }
              // 이번에 베팅한 코인을 누적 (게임 시작 시 baseBetCoins가 이미 기록되어 있음)
              const currentBetCoins = gameState.playerBetsCoins[userId] || 0;
              gameState.playerBetsCoins[userId] = currentBetCoins + actualBetAmountCoins; // 실제 베팅 코인
              gameState.gameData.pot += actualBetAmount; // 게임 내 포트 (원)
              // potCoins는 게임 시작 시 이미 initialPotCoins로 초기화되어 있으므로, 없으면 초기화만 하고 누적
              if (gameState.gameData.potCoins === undefined || gameState.gameData.potCoins === null) {
                // potCoins가 없으면 게임 시작 시 초기값으로 설정 (initialPotCoins는 이미 게임 시작 시 설정됨)
                // 하지만 여기서는 베팅 중이므로 0으로 시작하고 누적하는 것이 맞음
                // 게임 시작 시 potCoins가 설정되어 있으므로 이 블록은 실행되지 않아야 함
                gameState.gameData.potCoins = 0;
              }
              gameState.gameData.potCoins += actualBetAmountCoins; // 실제 포트 코인
            }

            // 베팅 라운드 완료 확인
            const checkResult = checkBettingRoundComplete(
              room.players,
              gameState.playerBettingStates,
              gameState.lastRaisePlayerIndex,
              gameState.currentBet // 현재 베팅 금액 전달
            );

            if (checkResult.winnerId) {
              // 기권승 처리
              const winnerUser = await User.findById(checkResult.winnerId);
              if (winnerUser) {
                winnerUser.money += gameState.gameData.pot;
                await winnerUser.save();
              }
              
              // 방 상태를 WAITING으로 변경하고 플레이어 준비 상태 초기화
              room.status = GameRoomStatus.WAITING;
              room.players.forEach((p) => (p.isReady = false));
              await room.save();
              gameStates.delete(roomId);
              
              const updatedRoom = await GameRoom.findById(roomId).populate('hostId', 'username');
              io.to(roomId).emit('room:update', updatedRoom);
              
              io.to(roomId).emit('game:action', {
                action: {
                  type: 'game-end',
                  winnerId: checkResult.winnerId,
                  reason: '기권승',
                },
                timestamp: new Date(),
              });
              
              gameState.phase = 'finished';
            } else if (checkResult.allCalled) {
              // 라운드 종료: 현재 라운드에서 베팅한 금액을 판돈에 합치기
              // (이미 베팅할 때마다 pot에 추가되고 있지만, 명확하게 처리)
              // 라운드별 베팅 금액은 각 플레이어의 totalBet에서 게임 시작/baseBet을 뺀 값
              
              // 모두 콜 완료
              if (gameState.bettingRound === 1) {
                // 첫 번째 라운드 완료 → 세 번째 패 나눠주기 (비공개, 2장→3장)
                const deck = gameState.gameData.deck;
                let cardIndex = room.players.length * 2; // 첫 번째, 두 번째 카드 다음부터
                
                room.players.forEach((player, idx) => {
                  const userId = player.userId.toString();
                  if (gameState.playerBettingStates[userId]?.isAlive) {
                    const cards = gameState.playerCards[userId] || [];
                    if (cards.length === 2) {
                      // 세 번째 카드 추가 (비공개)
                      cards.push(deck[cardIndex]);
                      cardIndex++;
                    }
                    gameState.playerCards[userId] = cards;
                  }
                });

                // 두 번째 베팅 라운드 시작
                gameState.bettingRound = 2;
                gameState.phase = 'betting';
                // currentBet은 1라운드 종료 시의 값으로 유지 (새 라운드 시작 시 초기화하지 않음)
                // 모든 플레이어가 같은 totalBet을 가지므로, currentBet도 그 값을 유지
                // gameState.currentBet = gameState.baseBet; // 제거: currentBet은 1라운드 종료 시 값 유지
                gameState.lastRaisePlayerIndex = undefined;
                
                // 새로운 라운드는 딜러 다음 플레이어부터 시작 (첫 번째 살아있는 플레이어)
                const dealerIndex = gameState.gameData.dealerIndex;
                gameState.currentPlayerIndex = getNextAlivePlayerIndex(
                  dealerIndex,
                  room.players,
                  gameState.playerBettingStates
                );
                
                // 모든 플레이어의 베팅 상태 초기화 (두 번째 라운드용)
                Object.keys(gameState.playerBettingStates).forEach((uid) => {
                  const state = gameState.playerBettingStates[uid];
                  if (state.isAlive) {
                    // 1라운드 배팅 금액을 roundBets 배열에 저장
                    if (state.roundBet !== undefined && state.roundBet > 0) {
                      if (!state.roundBets) {
                        state.roundBets = [];
                      }
                      state.roundBets.push(state.roundBet);
                    }
                    
                    state.hasCalled = false;
                    state.hasRaised = false;
                    state.action = undefined;
                    state.amount = 0;
                    // totalBet은 게임 시작부터 현재까지의 누적 베팅 금액 (유지)
                    // roundBet은 새로운 라운드이므로 0으로 초기화
                    state.roundBet = 0;
                    // totalBet은 이전 라운드까지의 베팅 금액을 유지 (현재 playerBets 값)
                    state.totalBet = gameState.playerBets[uid] || gameState.baseBet;
                  }
                });

                // 각 플레이어에게 자신의 카드 업데이트 전송 (두 번째 카드는 비공개)
                room.players.forEach((player) => {
                  const playerSocket = Array.from(io.sockets.sockets.values()).find(
                    (s: any) => s.userId === player.userId.toString()
                  );
                  if (playerSocket && gameState.playerBettingStates[player.userId.toString()]?.isAlive) {
                    playerSocket.emit('game:state', {
                      myCards: gameState.playerCards[player.userId.toString()],
                      gameState: {
                        phase: 'betting',
                        bettingRound: 2,
                        currentPlayerIndex: gameState.currentPlayerIndex,
                        pot: gameState.gameData.pot,
                        baseBet: gameState.baseBet,
                        currentBet: gameState.currentBet,
                        dealerIndex: gameState.gameData.dealerIndex,
                      },
                    });
                  }
                });

                io.to(roomId).emit('game:action', {
                  action: {
                    type: 'second-card-dealt',
                  },
                  timestamp: new Date(),
                });
              } else if (gameState.bettingRound === 2) {
                // 두 번째 라운드 완료 → 쇼다운 (각 플레이어가 3장 중 2장 선택)
                console.log('두 번째 라운드 완료 - 쇼다운 단계로 전환', { roomId, phase: gameState.phase });
                gameState.phase = 'showdown';
                
                // 각 플레이어에게 쇼다운 상태 업데이트 전송
                room.players.forEach((player) => {
                  const playerSocket = Array.from(io.sockets.sockets.values()).find(
                    (s: any) => s.userId === player.userId.toString()
                  );
                  if (playerSocket && gameState.playerBettingStates[player.userId.toString()]?.isAlive) {
                    playerSocket.emit('game:state', {
                      myCards: gameState.playerCards[player.userId.toString()],
                      gameState: {
                        phase: 'showdown',
                        bettingRound: 2,
                        currentPlayerIndex: gameState.currentPlayerIndex,
                        pot: gameState.gameData.pot,
                        baseBet: gameState.baseBet,
                        currentBet: gameState.currentBet,
                        dealerIndex: gameState.gameData.dealerIndex,
                      },
                    });
                  }
                });
                
                // 쇼다운 시작 알림 (각 플레이어가 카드 선택하도록)
                io.to(roomId).emit('game:action', {
                  action: {
                    type: 'showdown-start',
                    message: '3장 중 2장을 선택하세요',
                  },
                  gameState: {
                    phase: 'showdown',
                    bettingRound: 2,
                    currentPlayerIndex: gameState.currentPlayerIndex,
                    pot: gameState.gameData.pot,
                    baseBet: gameState.baseBet,
                    currentBet: gameState.currentBet,
                    dealerIndex: gameState.gameData.dealerIndex,
                  },
                  timestamp: new Date(),
                });
              }
            } else {
              // 다음 플레이어로 이동
              gameState.currentPlayerIndex = getNextAlivePlayerIndex(
                playerIndex,
                room.players,
                gameState.playerBettingStates
              );
            }

            // 게임 상태 업데이트 전송
            io.to(roomId).emit('game:action', {
              userId: socket.userId,
              action: {
                type: 'betting-action',
                bettingAction: bettingAction,
                amount: playerBettingState.amount,
              },
              gameState: {
                phase: gameState.phase,
                bettingRound: gameState.bettingRound,
                currentPlayerIndex: gameState.currentPlayerIndex,
                pot: gameState.gameData.pot,
                currentBet: gameState.currentBet,
                baseBet: gameState.baseBet,
                playerBets: { ...gameState.playerBets },
                playerBettingStates: { ...gameState.playerBettingStates },
                playerMoney: gameState.playerMoney ? { ...gameState.playerMoney } : undefined,
                dealerIndex: gameState.gameData.dealerIndex,
              },
              timestamp: new Date(),
            });
          }
          
          if (action.type === 'select-cards') {
            // 쇼다운: 플레이어가 3장 중 2장 선택
            // phase 확인 - 'showdown' 또는 bettingRound가 2이고 모두 콜 완료 상태
            const isShowdownPhase = gameState.phase === 'showdown' || 
                                  (gameState.bettingRound === 2 && 
                                   checkBettingRoundComplete(room.players, gameState.playerBettingStates, gameState.lastRaisePlayerIndex, gameState.currentBet).allCalled);
            
            if (!isShowdownPhase) {
              console.error('쇼다운 단계 오류:', {
                phase: gameState.phase,
                bettingRound: gameState.bettingRound,
                userId: socket.userId
              });
              socket.emit('error', { message: `쇼다운 단계가 아닙니다. 현재 단계: ${gameState.phase}, 라운드: ${gameState.bettingRound}` });
              return;
            }
            
            // phase가 'showdown'이 아니면 설정
            if (gameState.phase !== 'showdown') {
              gameState.phase = 'showdown';
            }

            const userId = socket.userId!;
            const selectedCards = action.selectedCards as Card[];
            
            if (!selectedCards || selectedCards.length !== 2) {
              socket.emit('error', { message: '정확히 2장을 선택해야 합니다.' });
              return;
            }

            const playerCards = gameState.playerCards[userId];
            if (!playerCards || playerCards.length !== 3) {
              socket.emit('error', { message: '카드가 3장이 아닙니다.' });
              return;
            }

            // 선택한 카드가 플레이어의 카드에 포함되어 있는지 확인
            const isValidSelection = selectedCards.every(selectedCard => 
              playerCards.some(card => card.id === selectedCard.id)
            );

            if (!isValidSelection) {
              socket.emit('error', { message: '선택한 카드가 유효하지 않습니다.' });
              return;
            }

            // 선택한 카드 저장
            if (!gameState.gameData.playerSelectedCards) {
              gameState.gameData.playerSelectedCards = {};
            }
            gameState.gameData.playerSelectedCards[userId] = selectedCards;
            
            console.log('카드 선택 완료:', { userId, selectedCards, roomId });

            // 모든 플레이어가 카드를 선택했는지 확인
            const allPlayersSelected = room.players.every((player) => {
              const pUserId = player.userId.toString();
              return !gameState.playerBettingStates[pUserId]?.isAlive || 
                     gameState.gameData.playerSelectedCards?.[pUserId];
            });
            
            console.log('모든 플레이어 선택 여부:', { allPlayersSelected, roomId });

            if (allPlayersSelected) {
              // 모든 플레이어가 선택 완료 → 족보 비교 및 게임 종료
              console.log('모든 플레이어 선택 완료 - 게임 결과 계산 시작', { roomId });
              const results: Array<{ userId: string; cards: Card[]; description: string; handType: string }> = [];
              room.players.forEach((player) => {
                const pUserId = player.userId.toString();
                if (gameState.playerBettingStates[pUserId]?.isAlive) {
                  const selectedCards = gameState.gameData.playerSelectedCards?.[pUserId];
                  if (selectedCards && selectedCards.length === 2) {
                    try {
                      const handResult = calculateSeotdaScore(selectedCards);
                      results.push({
                        userId: pUserId,
                        cards: selectedCards,
                        description: handResult.description,
                        handType: handResult.handType,
                      });
                      console.log('플레이어 족보 계산:', { userId: pUserId, description: handResult.description, handType: handResult.handType });
                    } catch (error) {
                      console.error('족보 계산 오류:', { userId: pUserId, selectedCards, error });
                    }
                  } else {
                    console.warn('플레이어의 선택한 카드가 없거나 올바르지 않음:', { userId: pUserId, selectedCards });
                  }
                }
              });

              if (results.length === 0) {
                console.error('결과가 없습니다!', { roomId, playerSelectedCards: gameState.gameData.playerSelectedCards });
                socket.emit('error', { message: '게임 결과를 계산할 수 없습니다.' });
                return;
              }

              // 구사/멍텅구리 구사 무승부 체크
              const drawCheck = checkGusaDraw(results);
              
              if (drawCheck.isDraw) {
                // 무승부 처리 - 재경기
                console.log('구사 무승부 발생:', { drawType: drawCheck.drawType, roomId });
                
                // 다이한 사람 제외하고 재경기 참가자만 필터링
                const alivePlayerIds = new Set(
                  results.map(r => r.userId)
                );
                
                // 재경기: 판돈 유지, 살아있는 플레이어만 참가
                // 게임 상태 초기화 (베팅 라운드 1로)
                gameState.bettingRound = 1;
                gameState.phase = 'betting';
                gameState.currentBet = gameState.baseBet;
                gameState.lastRaisePlayerIndex = undefined;
                
                // 살아있는 플레이어의 베팅 상태 초기화
                Object.keys(gameState.playerBettingStates).forEach((uid) => {
                  if (alivePlayerIds.has(uid)) {
                    const state = gameState.playerBettingStates[uid];
                    state.hasCalled = false;
                    state.hasRaised = false;
                    state.action = undefined;
                    state.amount = 0;
                    state.roundBet = 0; // 현재 라운드 배팅 금액 초기화
                    state.roundBets = []; // 라운드별 배팅 금액 배열 초기화
                    state.totalBet = gameState.baseBet; // 총 배팅 금액을 baseBet으로 초기화 (재경기 시작)
                    // isAlive는 유지 (다이한 사람은 이미 false)
                  }
                });
                
                // 새로운 덱 생성 및 카드 배분 (2장씩 배분)
                const newDeck = createDeck();
                gameState.gameData.deck = newDeck;
                gameState.gameData.playerSelectedCards = {}; // 선택한 카드 초기화
                gameState.gameData.playerSelectedRevealCard = {}; // 공개 카드 선택 초기화
                // 살아있는 플레이어의 선택 상태를 null로 초기화
                room.players.forEach((player) => {
                  const pUserId = player.userId.toString();
                  if (alivePlayerIds.has(pUserId)) {
                    gameState.gameData.playerSelectedRevealCard[pUserId] = null;
                  }
                });
                
                // 살아있는 플레이어에게만 카드 2장씩 배분
                const newPlayerCards: Record<string, Card[]> = {};
                let cardIndex = 0;
                room.players.forEach((player) => {
                  const pUserId = player.userId.toString();
                  if (alivePlayerIds.has(pUserId)) {
                    newPlayerCards[pUserId] = [newDeck[cardIndex], newDeck[cardIndex + 1]];
                    cardIndex += 2;
                  }
                });
                gameState.playerCards = newPlayerCards;
                
                // 딜러 인덱스는 유지, 현재 플레이어는 딜러 다음 살아있는 플레이어
                const dealerIndex = gameState.gameData.dealerIndex;
                gameState.currentPlayerIndex = getNextAlivePlayerIndex(
                  dealerIndex,
                  room.players,
                  gameState.playerBettingStates
                );
                
                // 각 플레이어에게 재경기 시작 알림 (game:state 이벤트)
                room.players.forEach((player) => {
                  const pUserId = player.userId.toString();
                  if (!alivePlayerIds.has(pUserId)) {
                    return; // 살아있지 않은 플레이어는 스킵
                  }
                  
                  const playerSocket = Array.from(io.sockets.sockets.values()).find(
                    (s: any) => s.userId === pUserId
                  );
                  
                  if (playerSocket) {
                    const playerCards = newPlayerCards[pUserId] || [];
                    console.log(`구사 재경기: ${pUserId}에게 game:state 전송`, { 
                      myCardsCount: playerCards.length, 
                      cards: playerCards.map(c => c.id) 
                    });
                    playerSocket.emit('game:state', {
                      myCards: playerCards,
                      gameState: {
                        phase: 'initial', // 재경기는 initial 페이즈부터 시작
                        bettingRound: 1,
                        currentPlayerIndex: gameState.currentPlayerIndex,
                        pot: gameState.gameData.pot, // 판돈 유지
                        baseBet: gameState.baseBet,
                        currentBet: gameState.baseBet, // 재경기 시작 시 currentBet 초기화
                        dealerIndex: gameState.gameData.dealerIndex,
                        playerBettingStates: gameState.playerBettingStates, // 베팅 상태도 함께 전송
                        playerCards: newPlayerCards, // 카드 정보도 함께 전송
                      },
                    });
                  } else {
                    console.warn(`구사 재경기: ${pUserId}의 소켓을 찾을 수 없습니다`);
                  }
                });
                
                // 재경기 시작 알림 (각 플레이어에게 개별적으로 전송하여 myCards 포함)
                room.players.forEach((player) => {
                  const pUserId = player.userId.toString();
                  if (!alivePlayerIds.has(pUserId)) {
                    return; // 살아있지 않은 플레이어는 스킵
                  }
                  
                  const playerSocket = Array.from(io.sockets.sockets.values()).find(
                    (s: any) => s.userId === pUserId
                  );
                  
                  if (playerSocket) {
                    const playerCards = newPlayerCards[pUserId] || [];
                    console.log(`구사 재경기: ${pUserId}에게 gusa-draw 전송`, { 
                      myCardsCount: playerCards.length, 
                      cards: playerCards.map(c => c.id) 
                    });
                    playerSocket.emit('game:action', {
                      action: {
                        type: 'gusa-draw',
                        drawType: drawCheck.drawType,
                        message: drawCheck.drawType === 'gusa' 
                          ? '구사로 인한 무승부! 재경기를 시작합니다.' 
                          : '멍텅구리 구사로 인한 무승부! 재경기를 시작합니다.',
                        alivePlayers: Array.from(alivePlayerIds),
                        userId: pUserId, // 각 플레이어의 ID 포함
                      },
                      gameState: {
                        phase: 'initial', // 재경기는 initial 페이즈부터 시작
                        bettingRound: 1,
                        currentPlayerIndex: gameState.currentPlayerIndex,
                        pot: gameState.gameData.pot,
                        baseBet: gameState.baseBet,
                        currentBet: gameState.baseBet, // 재경기 시작 시 currentBet 초기화
                        dealerIndex: gameState.gameData.dealerIndex,
                        playerBettingStates: gameState.playerBettingStates, // 베팅 상태도 함께 전송
                        playerCards: newPlayerCards, // 카드 정보도 함께 전송
                      },
                      myCards: playerCards, // 각 플레이어의 카드 포함
                      timestamp: new Date(),
                    });
                  } else {
                    console.warn(`구사 재경기: ${pUserId}의 소켓을 찾을 수 없습니다 (gusa-draw)`);
                  }
                });
                
                return; // 재경기 시작, 게임 종료하지 않음
              }
              
              // 일반 승자 결정 (새로운 룰 사용)
              let winner = results[0];
              for (let i = 1; i < results.length; i++) {
                const comparison = compareSeotdaHands(
                  { cards: winner.cards, description: winner.description, handType: winner.handType },
                  { cards: results[i].cards, description: results[i].description, handType: results[i].handType }
                );
                if (comparison < 0) {
                  // results[i]가 winner보다 강함
                  winner = results[i];
                }
              }
              const winnerId = winner.userId;
              console.log('승자 결정:', { winnerId, winner, allResults: results });

              // 머니 분배 (게임 내에서는 원 단위로 표시, 실제는 코인 단위)
              const moneyChanges: Record<string, number> = {};
              // potCoins가 제대로 계산되었는지 확인 (모든 플레이어의 베팅 코인 합계와 일치해야 함)
              // 항상 모든 플레이어의 베팅 코인 합계로 다시 계산하여 정확성 보장
              let potCoins = 0;
              room.players.forEach((player) => {
                const userId = player.userId.toString();
                const totalBetCoins = gameState.playerBetsCoins?.[userId] || 0;
                potCoins += totalBetCoins;
              });
              console.log('potCoins 계산 (정확성 확인):', { potCoins, playerBetsCoins: gameState.playerBetsCoins, gameStatePotCoins: gameState.gameData.potCoins });
              
              room.players.forEach((player) => {
                const userId = player.userId.toString();
                const totalBet = gameState.playerBets[userId] || 0; // 게임 내 베팅 (원)
                const totalBetCoins = gameState.playerBetsCoins?.[userId] || Math.ceil(totalBet / 10000); // 실제 베팅 코인
                
                if (userId === winnerId) {
                  // 승자: 포트 - 본인이 건 베팅 = 수익 (원 단위로 표시)
                  moneyChanges[userId] = gameState.gameData.pot - totalBet;
                } else {
                  // 패자: 본인이 건 베팅만큼 손실 (원 단위로 표시)
                  moneyChanges[userId] = -totalBet;
                }
              });

              // 승자에게 머니 지급 (코인 단위)
              // potCoins는 모든 플레이어의 베팅 코인 합계이므로, 승자는 potCoins 전체를 받음
              const winnerUser = await User.findById(winnerId);
              if (winnerUser) {
                console.log('승자 머니 지급:', { winnerId, potCoins, beforeMoney: winnerUser.money });
                winnerUser.money += potCoins; // 코인 단위로 추가
                winnerUser.totalGames += 1;
                winnerUser.wins += 1;
                winnerUser.characterExp += 100;
                
                // 레벨 업 체크
                const expNeededForNextLevel = winnerUser.characterLevel * 1000;
                while (winnerUser.characterExp >= expNeededForNextLevel) {
                  winnerUser.characterExp -= expNeededForNextLevel;
                  winnerUser.characterLevel += 1;
                }
                
                await winnerUser.save();
                console.log('승자 머니 지급 후:', { winnerId, afterMoney: winnerUser.money });
              }
              
              // 패자들 게임 결과 업데이트
              for (const player of room.players) {
                const userId = player.userId.toString();
                if (userId !== winnerId) {
                  const loserUser = await User.findById(userId);
                  if (loserUser) {
                    loserUser.totalGames += 1;
                    loserUser.characterExp += 30; // 패자는 경험치 30 추가
                    
                    // 레벨 업 체크 (승자와 동일한 로직)
                    const expNeededForNextLevel = loserUser.characterLevel * 1000;
                    while (loserUser.characterExp >= expNeededForNextLevel) {
                      loserUser.characterExp -= expNeededForNextLevel;
                      loserUser.characterLevel += 1;
                    }
                    
                    await loserUser.save();
                  }
                }
              }

              // 게임 종료 및 결과 전송
              // 모든 플레이어의 최신 money 값 가져오기
              const updatedPlayerMoney: Record<string, number> = {};
              for (const player of room.players) {
                const userId = player.userId.toString();
                const user = await User.findById(userId);
                if (user) {
                  updatedPlayerMoney[userId] = user.money;
                }
              }
              
              const revealData = {
                action: {
                  type: 'reveal',
                  results: results.map((r) => ({
                    userId: r.userId,
                    cards: r.cards,
                    description: r.description,
                  })),
                  winnerId,
                  moneyChanges,
                  pot: gameState.gameData.pot,
                },
                results: results.map((r) => ({
                  userId: r.userId,
                  cards: r.cards,
                  description: r.description,
                })),
                winner: winnerId,
                winnerId,
                pot: gameState.gameData.pot,
                moneyChanges,
                gameState: {
                  phase: 'finished',
                  playerMoney: updatedPlayerMoney, // 업데이트된 플레이어 보유 금액
                },
                timestamp: new Date(),
              };
              
              console.log('게임 결과 전송:', { roomId, revealData });
              io.to(roomId).emit('game:action', revealData);

              // 방 상태를 WAITING으로 변경하고 플레이어 준비 상태 초기화
              room.status = GameRoomStatus.WAITING;
              room.players.forEach((p) => (p.isReady = false));
              await room.save();
              gameStates.delete(roomId);
              
              // room:update 전송 전에 플레이어의 money 업데이트
              const updatedRoom = await GameRoom.findById(roomId).populate('hostId', 'username');
              if (updatedRoom) {
                // 플레이어의 money 업데이트
                for (let i = 0; i < updatedRoom.players.length; i++) {
                  const userId = updatedRoom.players[i].userId.toString();
                  if (updatedPlayerMoney[userId] !== undefined) {
                    updatedRoom.players[i].money = updatedPlayerMoney[userId];
                  }
                }
              }
              io.to(roomId).emit('room:update', updatedRoom);
              
              gameState.phase = 'finished';
              console.log('게임 종료 완료:', { roomId, phase: gameState.phase });
            } else {
              // 아직 선택하지 않은 플레이어가 있음
              // 선택 완료한 플레이어에게 확인 응답 전송
              socket.emit('game:action', {
                action: {
                  type: 'cards-selected',
                  userId,
                  message: '카드 선택이 완료되었습니다. 다른 플레이어를 기다리는 중...',
                },
                timestamp: new Date(),
              });
              
              // 다른 플레이어들에게도 선택 완료 알림
              io.to(roomId).emit('game:action', {
                action: {
                  type: 'cards-selected',
                  userId,
                },
                timestamp: new Date(),
              });
              
              console.log('카드 선택 완료 알림 전송:', { userId, roomId });
            }
          }
          
          if (action.type === 'reveal-card') {
            // 카드 1장 공개 처리
            io.to(roomId).emit('game:action', {
              userId: socket.userId,
              action: {
                type: 'reveal-card',
                card: action.card,
              },
              timestamp: new Date(),
            });
          }
          
          if (action.type === 'reveal') {
            // 모든 카드 공개 처리 (승부 결정)
            gameState.phase = 'showdown';

            // 모든 플레이어의 카드와 점수 계산
            const results: Array<{ userId: string; cards: Card[]; description: string; handType: string }> = [];
            room.players.forEach((player) => {
              const cards = gameState.playerCards[player.userId.toString()];
              if (cards && cards.length === 2) {
                const scoreResult = calculateSeotdaScore(cards);
                results.push({
                  userId: player.userId.toString(),
                  cards,
                  description: scoreResult.description,
                  handType: scoreResult.handType,
                });
              }
            });

            // 승자 결정 (compareSeotdaHands 사용)
            if (results.length === 0) {
              socket.emit('error', { message: '결과를 계산할 수 없습니다.' });
              return;
            }
            
            let winner = results[0];
            for (let i = 1; i < results.length; i++) {
              const comparison = compareSeotdaHands(
                { cards: winner.cards, description: winner.description, handType: winner.handType },
                { cards: results[i].cards, description: results[i].description, handType: results[i].handType }
              );
              if (comparison < 0) {
                winner = results[i];
              }
            }

            // 머니 분배 및 게임 결과 업데이트
            const pot = gameState.gameData.pot;
            const winnerUser = await User.findById(winner.userId);
            if (winnerUser) {
              // pot은 원 단위이므로 코인으로 변환하여 지급
              // 하지만 이 코드는 사용되지 않는 것 같음 (select-cards에서 처리)
              // 안전을 위해 potCoins를 계산하여 사용
              const potCoinsForReveal = Math.ceil(pot / 10000);
              winnerUser.money += potCoinsForReveal;
              winnerUser.totalGames += 1;
              winnerUser.wins += 1;
              winnerUser.characterExp += 100;
              
              // 레벨 업 체크
              const expNeededForNextLevel = winnerUser.characterLevel * 1000;
              while (winnerUser.characterExp >= expNeededForNextLevel) {
                winnerUser.characterExp -= expNeededForNextLevel;
                winnerUser.characterLevel += 1;
              }
              
              await winnerUser.save();
            }

            // 패자들 게임 결과 업데이트
            for (const player of room.players) {
              if (player.userId.toString() !== winner.userId) {
                const loserUser = await User.findById(player.userId);
                if (loserUser) {
                  loserUser.totalGames += 1;
                  loserUser.characterExp += 30; // 패자는 경험치 30 추가
                  
                  // 레벨 업 체크 (승자와 동일한 로직)
                  const expNeededForNextLevel = loserUser.characterLevel * 1000;
                  while (loserUser.characterExp >= expNeededForNextLevel) {
                    loserUser.characterExp -= expNeededForNextLevel;
                    loserUser.characterLevel += 1;
                  }
                  
                  await loserUser.save();
                }
              }
            }

            gameState.phase = 'finished';

            // 결과 전송
            io.to(roomId).emit('game:action', {
              userId: socket.userId,
              action: {
                type: 'reveal',
                cards: action.cards,
              },
              results,
              winner: winner.userId,
              pot,
              gameState: {
                phase: 'finished',
              },
              timestamp: new Date(),
            });

            // 게임 종료 후 방 상태 변경
            setTimeout(async () => {
              room.status = GameRoomStatus.WAITING;
              room.players.forEach((p) => (p.isReady = false));
              await room.save();
              gameStates.delete(roomId);
              io.to(roomId).emit('room:update', room);
            }, 5000);
          }
        } else {
          // 다른 게임 타입은 기본 처리
          socket.to(roomId).emit('game:action', {
            userId: socket.userId,
            action,
            timestamp: new Date(),
          });
        }
      } catch (error: any) {
        console.error('게임 액션 오류:', error);
        socket.emit('error', { message: '게임 액션 처리 중 오류가 발생했습니다.' });
      }
    });

    // 연결 해제
    socket.on('disconnect', () => {
      console.log(`사용자 연결 해제: ${socket.userId}`);
    });
  });
};
