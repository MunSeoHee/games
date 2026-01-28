import { useEffect, useState, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { Card, GameRoom, Player, GameRoomStatus } from '../shared/types/game';
import { useAuthStore } from '../store/authStore';
import CardComponent from './Card';
import { calculatePossibleHands, calculateSeotdaScore } from '../shared/utils/seotdaUtils';
import { formatSeotdaMoney, coinsToWon } from '../utils/formatMoney';

interface SeotdaGameProps {
  roomId: string;
  socket: Socket | null;
  room: GameRoom;
}

interface GameState {
  phase: 'initial' | 'betting' | 'second-card' | 'showdown' | 'reveal' | 'finished';
  bettingRound: number;
  currentPlayerIndex: number;
  pot: number;
  baseBet: number;
  currentBet: number;
  playerCards: Record<string, Card[]>;
  playerBets: Record<string, number>;
  playerBettingStates: Record<string, any>;
  playerMoney?: Record<string, number>; // 각 플레이어의 현재 보유 금액 (코인 단위)
  dealerIndex: number;
}

export default function SeotdaGame({ roomId, socket, room }: SeotdaGameProps) {
  const { user } = useAuthStore();
  const [gameState, setGameState] = useState<GameState>({
    phase: 'betting',
    bettingRound: 1,
    currentPlayerIndex: 0,
    pot: 0,
    baseBet: 100,
    currentBet: 100,
    playerCards: {},
    playerBets: {},
    playerBettingStates: {},
    dealerIndex: 0,
  });
  const [myCards, setMyCards] = useState<Card[]>([]);
  const [revealedCards, setRevealedCards] = useState<Record<string, Card[]>>({});
  const [partiallyRevealedCards, setPartiallyRevealedCards] = useState<Record<string, Card>>({}); // 각 플레이어가 공개한 카드 1장
  const [gameResults, setGameResults] = useState<any>(null);
  const [selectedCards, setSelectedCards] = useState<Card[]>([]); // 쇼다운에서 선택한 2장
  const [cardsSelected, setCardsSelected] = useState(false); // 카드 선택 완료 여부
  const [revealCardSelected, setRevealCardSelected] = useState<Card | null>(null); // 게임 시작 시 선택한 공개 카드
  
  // 이미지 사용 여부 (이미지 파일이 있으면 true로 변경)
  const useCardImages = true; // 이미지 파일 추가 완료

  useEffect(() => {
    if (!socket) return;

    socket.on('game:state', (data: any) => {
      if (data.myCards) {
        setMyCards(data.myCards);
      }
      if (data.gameState) {
        // 새로운 게임 시작 시 게임 결과 초기화
        if (data.gameState.phase === 'initial') {
          setGameResults(null);
          setRevealedCards({});
          setPartiallyRevealedCards({});
          setSelectedCards([]);
          setCardsSelected(false);
          setRevealCardSelected(null);
        }
        setGameState((prev) => ({
          ...prev,
          ...data.gameState,
        }));
      }
    });

    socket.on('error', (error: any) => {
      console.error('소켓 오류:', error);
      alert(error.message || '오류가 발생했습니다.');
    });

    socket.on('game:action', (data: any) => {
      if (data.gameState) {
        setGameState((prev) => ({
          ...prev,
          ...data.gameState,
        }));
      }

      if (data.action?.type === 'betting-action') {
        // 베팅 액션 처리
        if (data.gameState) {
          setGameState((prev) => ({
            ...prev,
            ...data.gameState,
          }));
        }
      } else if (data.action?.type === 'card-revealed') {
        // 플레이어가 카드 1장 선택하여 공개
        if (data.action.partiallyRevealedCards) {
          setPartiallyRevealedCards(data.action.partiallyRevealedCards);
        }
        if (data.action.userId === user?.id && data.action.card) {
          setRevealCardSelected(data.action.card);
        }
      } else if (data.action?.type === 'betting-round-start') {
        // 모든 플레이어가 카드를 선택했고 베팅 라운드 시작
        if (data.action.partiallyRevealedCards) {
          setPartiallyRevealedCards(data.action.partiallyRevealedCards);
        }
        if (data.gameState) {
          setGameState((prev) => ({
            ...prev,
            ...data.gameState,
          }));
        }
      } else if (data.action?.type === 'second-card-dealt') {
        // 두 번째 카드 지급 (비공개)
      } else if (data.action?.type === 'gusa-draw') {
        // 구사 무승부 - 재경기 시작
        setSelectedCards([]);
        setCardsSelected(false);
        if (data.gameState) {
          setGameState((prev) => ({
            ...prev,
            ...data.gameState,
            phase: 'betting',
            playerBettingStates: data.gameState.playerBettingStates || prev.playerBettingStates, // 베팅 상태 업데이트
          }));
        }
        // 재경기 알림 표시
        alert(data.action?.message || '구사로 인한 무승부! 재경기를 시작합니다.');
      } else if (data.action?.type === 'showdown-start') {
        // 쇼다운 시작
        setSelectedCards([]);
        setCardsSelected(false); // 선택 상태 초기화
        // gameState 업데이트 보장
        if (data.gameState) {
          setGameState((prev) => ({
            ...prev,
            ...data.gameState,
            phase: 'showdown', // 명시적으로 쇼다운 단계 설정
          }));
        }
      } else if (data.action?.type === 'cards-selected') {
        // 다른 플레이어가 카드 선택 완료 또는 자신이 선택 완료
        if (data.userId === user?.id) {
          // 자신이 선택 완료
          setCardsSelected(true);
          console.log('카드 선택 완료:', selectedCards);
        }
      } else if (data.action?.type === 'reveal-card') {
        // 카드 1장 공개
        if (data.userId && data.card) {
          setPartiallyRevealedCards((prev) => ({
            ...prev,
            [data.userId]: data.card,
          }));
        }
      } else if (data.action?.type === 'game-end') {
        // 게임 종료 (기권승 등)
        console.log('게임 종료:', data);
        const winnerId = data.action?.winnerId;
        
        // 백엔드에서 보낸 results가 있으면 사용, 없으면 room.players로 생성
        const results = data.action?.results || room.players.map((p: Player) => ({
          userId: p.userId.toString(),
          username: p.username,
          description: String(p.userId) === String(winnerId) ? '승리' : '패배',
        }));
        
        // 게임 결과 설정
        setGameResults({
          results: results.map((r: any) => ({
            userId: r.userId || r.userId?.toString(),
            username: r.username,
            description: r.description || (String(r.userId) === String(winnerId) ? '승리' : '패배'),
          })),
          winner: winnerId,
          pot: data.gameState?.pot || gameState.pot,
          reason: data.action?.reason || '기권승',
        });
        
        // 게임 종료 상태 업데이트
        if (data.gameState) {
          setGameState((prev) => ({
            ...prev,
            ...data.gameState,
            phase: 'finished',
          }));
        } else {
          setGameState((prev) => ({
            ...prev,
            phase: 'finished',
          }));
        }
      } else if (data.action?.type === 'reveal') {
        // 모든 카드 공개 (게임 종료)
        console.log('게임 결과 수신:', data);
        const results = data.action?.results || data.results || [];
        if (results && results.length > 0) {
          const revealed: Record<string, Card[]> = {};
          results.forEach((result: any) => {
            revealed[result.userId] = result.cards;
          });
          setRevealedCards(revealed);
          setGameResults({
            results,
            winner: data.action?.winnerId || data.winnerId || data.winner,
            pot: data.action?.pot || data.pot || gameState.pot,
            moneyChanges: data.action?.moneyChanges || data.moneyChanges,
          });
          // 게임 종료 상태 업데이트
          setGameState((prev) => ({
            ...prev,
            phase: 'finished',
          }));
        } else {
          console.error('게임 결과 데이터가 올바르지 않음:', data);
        }
      }
    });

    return () => {
      socket.off('game:action');
      socket.off('game:state');
      socket.off('error');
    };
  }, [socket]);

  const handleBettingAction = (bettingAction: string) => {
    if (socket) {
      socket.emit('game:action', roomId, {
        type: 'betting-action',
        bettingAction,
      });
    }
  };


  const currentPlayerIdx = room.players.findIndex(
    (p: { userId: string; username: string }) => (p.userId && p.userId === user?.id) || p.username === user?.username
  );
  const isMyTurn = currentPlayerIdx === gameState.currentPlayerIndex && 
                   (gameState.phase === 'betting' || gameState.phase === 'second-card');
  
  // 현재 플레이어의 베팅 상태
  const myBettingState = user?.id ? gameState.playerBettingStates?.[user.id] : null;
  // 레이즈 가능 조건: 체크하지 않았고, totalBet이 currentBet보다 작거나 같으면 레이즈 가능
  // 단, 새 라운드 시작 시: totalBet은 이전 라운드 값(큰 값), currentBet은 baseBet(작은 값)
  // 이 경우 roundBet이 0이면 라운드 시작 직후이므로 레이즈 가능
  const hasChecked = myBettingState?.action === 'check';
  const myTotalBet = myBettingState?.totalBet || 0;
  const myRoundBet = myBettingState?.roundBet || 0;
  const currentBet = gameState.currentBet || 0;
  const baseBet = gameState.baseBet || 0;
  
  // 라운드 시작 직후 (roundBet = 0, currentBet = baseBet): 레이즈 가능
  // 이번 라운드에서 베팅 후: totalBet <= currentBet이면 레이즈 가능
  const isRoundStart = myRoundBet === 0 && currentBet === baseBet;
  const canRaiseFromBetting = myTotalBet <= currentBet;
  const canRaise = !hasChecked && (isRoundStart || canRaiseFromBetting);
  const isFirstAction = myBettingState?.action === undefined; // 아직 액션을 하지 않은 상태
  // const isDealer = currentPlayerIdx === gameState.dealerIndex;
  // 선(딜러 다음 플레이어)인지 확인: 1장째 또는 2장째 라운드의 첫 번째 플레이어
  const isFirstPlayer = currentPlayerIdx === ((gameState.dealerIndex + 1) % room.players.length);

  // 현재 패의 족보 계산 (2장 또는 3장일 때 표시)
  const currentHand = useMemo(() => {
    if (myCards.length === 2) {
      try {
        return calculateSeotdaScore(myCards);
      } catch (e) {
        return null;
      }
    } else if (myCards.length === 3) {
      // 3장일 때는 가능한 조합 중 최고의 족보를 선택
      try {
        const hands = calculatePossibleHands(myCards);
        if (hands.length === 0) return null;
        
        // 족보 타입 우선순위로 정렬하여 최고의 족보 선택
        const typeOrder: Record<string, number> = {
          'gwangttang': 5,
          'ttang': 4,
          'special': 3,
          'kkeut': 2,
          'mangtong': 1,
        };
        
        const sortedHands = [...hands].sort((a, b) => {
          const orderA = typeOrder[a.handType] || 0;
          const orderB = typeOrder[b.handType] || 0;
          if (orderA !== orderB) return orderB - orderA;
          return b.description.localeCompare(a.description);
        });
        
        return sortedHands[0]; // 최고의 족보 반환
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [myCards]);

  // 가능한 패 조합 계산 (3장일 때)
  const possibleHands = useMemo(() => {
    if (myCards.length === 3) {
      const hands = calculatePossibleHands(myCards);
      // 족보 타입 우선순위로 정렬 (광땡 > 땡 > 특수패 > 끗 > 망통)
      const typeOrder: Record<string, number> = {
        'gwangttang': 5,
        'ttang': 4,
        'special': 3,
        'kkeut': 2,
        'mangtong': 1,
      };
      return [...hands].sort((a, b) => {
        const orderA = typeOrder[a.handType] || 0;
        const orderB = typeOrder[b.handType] || 0;
        if (orderA !== orderB) return orderB - orderA;
        // 같은 타입이면 description으로 비교 (간단한 정렬)
        return b.description.localeCompare(a.description);
      });
    }
    return [];
  }, [myCards]);

  // 카드 선택 핸들러 (게임 시작 시 2장 중 1장 선택)
  const handleSelectRevealCard = (card: Card) => {
    if (socket && gameState.phase === 'initial' && myCards.length === 2 && !revealCardSelected) {
      socket.emit('game:action', roomId, {
        type: 'select-reveal-card',
        selectedCard: card,
      });
      setRevealCardSelected(card);
    }
  };

  // 방 상태가 WAITING이고 게임이 종료되지 않았으면 null 반환 (대기실은 부모에서 처리)
  // 게임 종료 결과는 표시해야 하므로, WAITING 상태일 때는 게임 결과만 표시
  if (room.status === GameRoomStatus.WAITING && gameState.phase !== 'finished') {
    return null;
  }

  // WAITING 상태이고 게임이 종료되었을 때는 게임 결과만 표시
  if (room.status === GameRoomStatus.WAITING && gameState.phase === 'finished') {
    return (
      <div className="mt-6">
        {gameResults && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-500 rounded-lg">
            <h3 className="text-xl font-bold mb-2">게임 결과</h3>
            <div className="space-y-2">
              {gameResults.results?.map((result: any, idx: number) => {
                const player = room.players.find((p: Player) => p.userId === result.userId || p.username === result.username);
                return (
                  <div key={idx} className={`p-2 rounded ${result.userId === gameResults.winner ? 'bg-green-100 font-bold' : 'bg-gray-100'}`}>
                    {player?.username}: {result.description}
                    {result.userId === gameResults.winner && ' 🏆 승리!'}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-lg font-semibold">
              승자: {room.players.find((p: Player) => p.userId === gameResults.winner || p.username === gameResults.winner)?.username}
              <br />
              판돈: {formatSeotdaMoney(gameResults.pot || 0)}
            </div>
            {(() => {
              const isHost = typeof room.hostId === 'object' && room.hostId !== null
                ? (room.hostId as { username: string }).username === user?.username 
                : String(room.hostId) === user?.id;
              return isHost && (
                <div className="mt-4">
                  <button
                    onClick={() => {
                      if (socket) {
                        socket.emit('game:start', roomId);
                      }
                    }}
                    className="w-full py-2 px-4 bg-purple-600 text-white rounded-md font-semibold hover:bg-purple-700"
                  >
                    다음 게임 시작
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">섯다 게임</h2>

      {/* 판돈 및 라운드 정보 */}
      <div className="text-center mb-6">
        <div className="text-lg font-semibold">💰 판돈: {formatSeotdaMoney(gameState.pot)}</div>
        <div className="text-sm text-gray-600 mt-1">
          {gameState.phase === 'initial' && '카드 선택 중...'}
          {gameState.bettingRound === 1 && gameState.phase !== 'initial' && '첫 번째 라운드'}
          {gameState.bettingRound === 2 && '두 번째 라운드'}
          {gameState.phase === 'showdown' && '쇼다운'}
        </div>
      </div>

      {/* 게임 시작 시 카드 선택 UI */}
      {gameState.phase === 'initial' && myCards.length === 2 && !revealCardSelected && (
        <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-500 rounded-lg">
          <h3 className="text-lg font-bold mb-4 text-center">공개할 카드를 선택하세요</h3>
          <div className="flex justify-center gap-4">
            {myCards.map((card: Card) => (
              <div
                key={card.id}
                onClick={() => handleSelectRevealCard(card)}
                className="cursor-pointer transform transition-transform hover:scale-110"
              >
                <CardComponent card={card} size="large" useImage={useCardImages} />
                <div className="text-center mt-2 text-sm font-semibold">선택</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 플레이어 카드 영역 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {room.players.map((player: Player, idx: number) => {
          const cards = revealedCards[player.userId] || [];
          const isCurrentPlayer = idx === gameState.currentPlayerIndex;
          const playerUserId = String(player.userId);
          const isCurrentUser = user && (playerUserId === user.id || player.username === user.username);
          
          // 선택 단계에서 선택 여부 확인
          let needsSelection = false;
          if (gameState.phase === 'initial') {
            // initial 단계: 카드를 선택하지 않은 플레이어
            const revealedCard = partiallyRevealedCards[playerUserId];
            needsSelection = !revealedCard;
          } else if (gameState.phase === 'showdown') {
            // showdown 단계: 살아있는 플레이어 중 카드를 선택하지 않은 플레이어
            const playerBettingState = gameState.playerBettingStates?.[playerUserId] || gameState.playerBettingStates?.[player.userId];
            const isAlive = playerBettingState?.isAlive !== false;
            const hasSelectedCards = revealedCards[playerUserId] && revealedCards[playerUserId].length > 0;
            needsSelection = isAlive && !hasSelectedCards;
          }
          
          // 테두리 스타일 결정
          let borderClass = 'border-2 border-gray-200';
          if (needsSelection) {
            // 선택해야 하는 플레이어: 굵은 테두리
            borderClass = 'border-4 border-purple-500';
          } else if (isCurrentPlayer && gameState.phase !== 'initial' && gameState.phase !== 'showdown') {
            // 일반 턴에서 현재 플레이어: 굵은 테두리
            borderClass = 'border-4 border-purple-500';
          }

          return (
            <div
              key={player.userId}
              className={`rounded-lg p-4 ${
                isCurrentUser 
                  ? 'bg-purple-50' 
                  : 'bg-gray-50'
              } ${borderClass}`}
            >
              <div className="font-semibold mb-2 flex items-center gap-2 flex-wrap">
                <span>
                  {player.username}
                  {isCurrentUser && ' (나)'}
                </span>
                {/* 현재 플레이어의 족보 라벨 (2장 또는 3장일 때) */}
                {isCurrentUser && myCards.length >= 2 && (
                  <div className="flex flex-wrap gap-1">
                    {myCards.length === 2 && currentHand && (
                      <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded">
                        {currentHand.description}
                      </span>
                    )}
                    {myCards.length === 3 && possibleHands.length > 0 && (
                      possibleHands.map((hand, idx) => (
                        <span key={idx} className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded">
                          {hand.description}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* 라운드별 배팅 금액 표시 */}
              {(() => {
                const playerUserId = String(player.userId);
                const playerBettingState = gameState.playerBettingStates?.[playerUserId] || gameState.playerBettingStates?.[player.userId];
                const roundBets = playerBettingState?.roundBets || [];
                const currentRoundBet = playerBettingState?.roundBet || 0;
                
                if (roundBets.length > 0 || currentRoundBet > 0) {
                  return (
                    <div className="text-xs text-gray-600 mb-2 space-y-0.5">
                      {roundBets.map((bet: number, idx: number) => (
                        <div key={idx} className="text-blue-600">
                          {idx + 1}라운드: {formatSeotdaMoney(bet)}
                        </div>
                      ))}
                      {currentRoundBet > 0 && (
                        <div className="text-blue-600 font-semibold">
                          {gameState.bettingRound}라운드: {formatSeotdaMoney(currentRoundBet)}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
              <div className="flex gap-2">
                {gameResults && cards.length > 0 ? (
                  // 게임 종료 시 모든 카드 공개
                  cards.map((card, cardIdx) => (
                    <CardComponent key={cardIdx} card={card} size="medium" useImage={useCardImages} />
                  ))
                ) : isCurrentUser && myCards.length > 0 ? (
                  // 현재 플레이어는 자신의 카드 모두 보기 (2장 또는 3장)
                  // 항상 자신의 카드는 앞면으로 표시
                  myCards.map((card, cardIdx) => (
                    <CardComponent key={cardIdx} card={card} size="medium" useImage={useCardImages} />
                  ))
                ) : (() => {
                  // 다른 플레이어는 라운드에 따라 카드 개수 결정
                  const revealedCard = partiallyRevealedCards[playerUserId];
                  
                  if (!revealedCard) {
                    // 카드 공개 전: 뒷면 카드 2장 표시
                    return (
                      <>
                        {Array.from({ length: 2 }).map((_, idx) => (
                          <CardComponent 
                            key={`back-${idx}-${playerUserId}`} 
                            card={null} 
                            isRevealed={false} 
                            size="medium" 
                            useImage={useCardImages} 
                          />
                        ))}
                      </>
                    );
                  }
                  
                  // bettingRound에 따라 표시할 카드 개수 결정
                  // 게임 시작: 2장 지급
                  // Round 1: 2장 (1장 공개 + 1장 뒷면)
                  // Round 2: 3장 (1장 공개 + 2장 뒷면)
                  // 쇼다운: 3장 모두 보여야 함
                  const totalCards = gameState.bettingRound === 1 ? 2 : 3; // Round 1은 2장, Round 2는 3장
                  const backCardsCount = totalCards - 1; // 공개된 카드 1장 제외
                  
                  return (
                    <>
                      {/* 공개된 첫 번째 카드 */}
                      <CardComponent card={revealedCard} size="medium" useImage={useCardImages} />
                      {/* 뒷면 카드들 (라운드에 따라 추가) */}
                      {Array.from({ length: backCardsCount }).map((_, idx) => (
                        <CardComponent 
                          key={`back-${idx}-${playerUserId}`} 
                          card={null} 
                          isRevealed={false} 
                          size="medium" 
                          useImage={useCardImages} 
                        />
                      ))}
                    </>
                  );
                })()}
              </div>
              {/* 보유 금액 표시 */}
              {(() => {
                const playerUserId = typeof player.userId === 'object' 
                  ? String(player.userId) 
                  : player.userId;
                
                const currentMoney = gameState.playerMoney?.[playerUserId] || gameState.playerMoney?.[player.userId];
                const initialMoney = player.money || 0;
                const displayMoney = currentMoney !== undefined ? currentMoney : initialMoney;
                
                if (displayMoney >= 0) {
                  return (
                    <div className="text-sm text-gray-600 mt-2">
                      보유: {formatSeotdaMoney(coinsToWon(displayMoney))} <span className="text-gray-400">({displayMoney.toLocaleString()}코인)</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          );
        })}
      </div>


      {/* 게임 결과 */}
      {gameResults && gameState.phase === 'finished' && (
        <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-500 rounded-lg">
          <h3 className="text-xl font-bold mb-2">게임 결과</h3>
          <div className="space-y-2">
            {gameResults.results?.map((result: any, idx: number) => {
              const player = room.players.find((p: Player) => p.userId === result.userId || p.username === result.username);
              return (
                <div key={idx} className={`p-2 rounded ${result.userId === gameResults.winner ? 'bg-green-100 font-bold' : 'bg-gray-100'}`}>
                  {player?.username}: {result.description}
                  {result.userId === gameResults.winner && ' 🏆 승리!'}
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-lg font-semibold">
            승자: {room.players.find((p: Player) => p.userId === gameResults.winner || p.username === gameResults.winner)?.username}
            <br />
            판돈: {formatSeotdaMoney(gameResults.pot || 0)}
          </div>
          {(() => {
            const isHost = typeof room.hostId === 'object' 
              ? room.hostId.username === user?.username 
              : room.hostId.toString() === user?.id;
            return isHost && (
              <div className="mt-4">
                <button
                  onClick={() => {
                    if (socket) {
                      socket.emit('game:start', roomId);
                    }
                  }}
                  className="w-full py-2 px-4 bg-purple-600 text-white rounded-md font-semibold hover:bg-purple-700"
                >
                  다음 게임 시작
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* 게임 액션 - 한국 섯다 베팅 옵션 */}
      {(gameState.phase === 'betting' || gameState.phase === 'second-card') && isMyTurn && !gameResults && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center mb-4">
            <div className="text-sm text-gray-600 mb-1">
              현재 베팅: {formatSeotdaMoney(gameState.currentBet || 0)} | 판돈: {formatSeotdaMoney(gameState.pot || 0)}
            </div>
            <div className="text-xs text-gray-500">
              {gameState.bettingRound === 1 ? '첫 번째 라운드' : '두 번째 라운드'}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {/* 항상 사용 가능 */}
            <button
              onClick={() => handleBettingAction('die')}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
            >
              다이 (기권)
            </button>
            
            {canRaise && (
              <button
                onClick={() => handleBettingAction('call')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                콜
              </button>
            )}
            
            {/* 레이즈 옵션 (콜/체크 하지 않은 경우만) */}
            {canRaise && (
              <>
                <button
                  onClick={() => handleBettingAction('half')}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                >
                  하프 (판돈 50%)
                </button>
                <button
                  onClick={() => handleBettingAction('ddadang')}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                >
                  따당 (2배)
                </button>
                <button
                  onClick={() => handleBettingAction('allin')}
                  className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm"
                >
                  올인
                </button>
              </>
            )}
            
            {/* 체크: 선만 가능 (1장째 또는 2장째 라운드의 첫 액션) */}
            {isFirstPlayer && isFirstAction && (gameState.bettingRound === 1 || gameState.bettingRound === 2) && (
              <button
                onClick={() => handleBettingAction('check')}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
              >
                체크
              </button>
            )}
            
            {/* 삥: 선만 가능 (1장째 또는 2장째 라운드의 첫 액션) */}
            {isFirstPlayer && isFirstAction && (gameState.bettingRound === 1 || gameState.bettingRound === 2) && (
              <button
                onClick={() => handleBettingAction('bbing')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
              >
                삥 ({formatSeotdaMoney(gameState.baseBet || 100)})
              </button>
            )}
            
            {/* 콜한 후 사용 가능 */}
            {!canRaise && (
              <button
                onClick={() => handleBettingAction('call')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm col-span-2"
              >
                콜
              </button>
            )}
          </div>
        </div>
      )}

      {/* 쇼다운: 낼 수 있는 패 조합 표시 */}
      {gameState.phase === 'showdown' && myCards.length === 3 && possibleHands.length > 0 && !gameResults && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-lg font-bold mb-4">
              {gameState.phase === 'showdown' ? '쇼다운: 낼 수 있는 패를 선택하세요' : '낼 수 있는 패 조합'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {possibleHands.map((hand, idx) => {
                const isSelected = selectedCards.length === 2 && 
                  selectedCards.some(c => c.id === hand.cards[0].id) && 
                  selectedCards.some(c => c.id === hand.cards[1].id);
                
                // 족보 색상 결정
                const getDescriptionColor = (description: string) => {
                  // 광땡 계열
                  if (description.includes('광땡')) {
                    return 'bg-red-600 text-white';
                  } 
                  // 땡 계열
                  else if (description.includes('땡')) {
                    return 'bg-orange-500 text-white';
                  } 
                  // 하위 특수 규칙
                  else if (description === '암행어사') {
                    return 'bg-pink-600 text-white';
                  } else if (description === '땡잡이') {
                    return 'bg-indigo-600 text-white';
                  } else if (description === '구사') {
                    return 'bg-yellow-600 text-white';
                  }
                  // 특수 족보
                  else if (['알리', '독사', '구삥', '장삥', '장사', '세륙'].includes(description)) {
                    return 'bg-purple-500 text-white';
                  } 
                  // 끗
                  else if (description.includes('끗')) {
                    const kkeut = parseInt(description.replace('끗', ''));
                    if (kkeut >= 7) return 'bg-blue-500 text-white';
                    if (kkeut >= 5) return 'bg-green-500 text-white';
                    return 'bg-gray-500 text-white';
                  }
                  // 망통
                  else if (description === '망통') {
                    return 'bg-gray-400 text-white';
                  }
                  return 'bg-gray-400 text-white';
                };

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (!cardsSelected && socket && gameState.phase === 'showdown') {
                        console.log('카드 선택 요청 전송:', hand.cards);
                        setSelectedCards(hand.cards);
                        socket.emit('game:action', roomId, {
                          type: 'select-cards',
                          selectedCards: hand.cards,
                        });
                      }
                    }}
                    className={`transition-all rounded-lg p-4 border-2 ${
                      gameState.phase === 'showdown' ? (
                        isSelected 
                          ? 'border-green-500 bg-green-100 scale-105 ring-4 ring-green-300' 
                          : cardsSelected
                          ? 'border-gray-300 bg-gray-50 opacity-50 cursor-not-allowed'
                          : 'border-gray-300 bg-white hover:border-blue-400 hover:shadow-lg cursor-pointer'
                      ) : 'border-gray-300 bg-white'
                    }`}
                    style={{ cursor: gameState.phase === 'showdown' ? 'pointer' : 'default' }}
                  >
                    <div className={`${getDescriptionColor(hand.description)} text-center font-bold text-lg py-2 px-4 rounded mb-3`}>
                      {hand.description}
                    </div>
                    <div className="flex justify-center gap-2">
                      {hand.cards.map((card: Card, cardIdx: number) => (
                        <div key={cardIdx}>
                          <CardComponent card={card} size="medium" useImage={useCardImages} />
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 text-center mt-2">
                      {hand.cards[0].month}월 + {hand.cards[1].month}월
                    </div>
                  </div>
                );
              })}
            </div>
            {gameState.phase === 'showdown' && (
              <>
                {cardsSelected && (
                  <div className="text-sm text-green-600 mb-4 text-center font-semibold">
                    ✓ 패 선택 완료 - 다른 플레이어를 기다리는 중...
                  </div>
                )}
                {!cardsSelected && (
                  <div className="text-sm text-gray-600 mb-4 text-center">
                    낼 패를 선택하세요
                  </div>
                )}
              </>
            )}
          </div>
      )}
      
      {gameState.phase === 'showdown' && myCards.length === 3 && selectedCards.length === 2 && (
        <div className="text-center text-gray-600 mb-4">
          다른 플레이어가 카드를 선택할 때까지 기다려주세요...
        </div>
      )}
    </div>
  );
}

