import { BettingAction, PlayerBettingState } from '../shared/types/game';

// 베팅 금액 계산
// 핵심 원칙: 모든 추가 배팅(레이즈)은 [콜 비용 + 추가 금액]으로 이루어진다.
// 콜 비용 = 앞사람이 배팅한 금액(currentBet)과 내가 이미 낸 금액(playerTotalBet)의 차액
export const calculateBetAmount = (
  action: BettingAction,
  currentBet: number, // 앞사람(기권 제외)이 건 총 배팅 금액
  pot: number, // 현재 판돈
  baseBet: number, // 기본 판돈(참가비)
  playerTotalBet: number // 플레이어가 이번 턴에 이미 건 총 베팅 금액
): number => {
  // 콜 비용 계산: 앞사람이 건 금액에 맞추기 위해 필요한 금액
  // playerTotalBet이 currentBet보다 크면 (이미 더 많이 베팅한 경우) 콜 비용은 0
  const callCost = Math.max(0, currentBet - playerTotalBet);
  
  switch (action) {
    case 'die':
      return 0; // 기권
      
    case 'call':
      // 콜: 앞사람의 배팅 금액과 똑같이 맞춘다 (추가 금액 없음)
      return callCost;
      
    case 'ddadang':
      // 따당: 바로 앞사람이 건 금액의 '딱 2배'를 건다
      // 총 배팅 금액 = currentBet * 2
      // 추가로 낼 금액 = (currentBet * 2) - playerTotalBet
      return Math.max(0, currentBet * 2 - playerTotalBet);
      
    case 'half':
      // 하프: [현재 판돈 + 내가 낼 콜 비용]을 합친 금액의 1/2(50%)을 더 얹는다
      // 하프로 배팅할 총 금액 = currentBet + [(pot + callCost) / 2]
      // 추가로 낼 금액 = [currentBet + (pot + callCost) / 2] - playerTotalBet
      // 단, 베팅 계산 시점의 pot은 아직 이번 베팅 금액이 반영되기 전의 값이어야 함
      // 따라서 베팅 전 pot 값을 사용 (베팅 후에는 pot += actualBetAmount로 업데이트됨)
      // callCost를 먼저 계산한 후, pot + callCost의 50%를 더 얹음
      const halfAdditional = Math.floor((pot + callCost) / 2);
      const halfTotalBet = currentBet + halfAdditional;
      const additionalBet = halfTotalBet - playerTotalBet;
      return Math.max(0, additionalBet);
      
    case 'check':
      return 0; // 돈을 걸지 않음
      
    case 'bbing':
      // 삥: 기본 판돈(참가비)만큼만 배팅한다 (선만 가능)
      // 총 배팅 금액 = baseBet (기본 판돈과 똑같이)
      // 추가로 낼 금액 = baseBet - playerTotalBet
      return Math.max(0, baseBet - playerTotalBet);
      
    case 'allin':
      return -1; // 최대 베팅 (실제 금액은 플레이어 잔액으로 결정)
      
    default:
      return 0;
  }
};

// 베팅 라운드 종료 조건 확인
// 종료 조건:
// 1. 생존자가 1명만 남았을 때 (나머지 전부 다이) → 부전승
// 2. 생존한 모든 플레이어가 낸 금액이 동일할 때
export const checkBettingRoundComplete = (
  players: Array<{ userId: string | any }>,
  playerBettingStates: Record<string, PlayerBettingState>,
  lastRaisePlayerIndex?: number,
  currentBet?: number // 현재 베팅 금액 (옵션)
): { isComplete: boolean; winnerId?: string; allCalled: boolean } => {
  const alivePlayers = players.filter((p) => {
    const userId = typeof p.userId === 'object' ? p.userId.toString() : p.userId;
    return playerBettingStates[userId]?.isAlive;
  });

  // 1인만 남으면 자동 승리 (부전승)
  if (alivePlayers.length === 1) {
    const winnerId = typeof alivePlayers[0].userId === 'object' 
      ? alivePlayers[0].userId.toString() 
      : alivePlayers[0].userId;
    return { isComplete: true, winnerId, allCalled: false };
  }

  // 생존한 모든 플레이어가 낸 금액이 동일한지 확인
  if (alivePlayers.length > 1) {
    const alivePlayerBets: number[] = [];
    const alivePlayerRoundBets: number[] = [];
    let allRoundBetsZero = true;
    let allPlayersCalled = true;
    
    alivePlayers.forEach((p) => {
      const userId = typeof p.userId === 'object' ? p.userId.toString() : p.userId;
      const state = playerBettingStates[userId];
      if (state?.isAlive && state.totalBet !== undefined) {
        alivePlayerBets.push(state.totalBet);
        // roundBet이 있으면 사용 (라운드별 베팅 확인)
        const roundBet = state.roundBet ?? 0;
        alivePlayerRoundBets.push(roundBet);
        if (roundBet > 0) {
          allRoundBetsZero = false;
        }
        // hasCalled가 false면 아직 베팅하지 않았거나 레이즈 가능
        if (!state.hasCalled) {
          allPlayersCalled = false;
        }
      }
    });

    // 모든 생존한 플레이어의 총 베팅 금액이 동일한지 확인
    if (alivePlayerBets.length === alivePlayers.length) {
      const firstBet = alivePlayerBets[0];
      const allSameBet = alivePlayerBets.every(bet => bet === firstBet);
      
      // 새 라운드 시작 직후 방지: 모든 플레이어의 roundBet이 0이고 아직 아무도 콜하지 않았으면 라운드 계속
      if (allRoundBetsZero && alivePlayerRoundBets.length > 0 && !allPlayersCalled) {
        return { isComplete: false, allCalled: false };
      }
      
      // 모든 생존 플레이어가 동일한 금액을 베팅함
      if (allSameBet && firstBet > 0) {
        // currentBet이 제공되면, 모든 플레이어가 currentBet 이상을 베팅했는지 확인
        if (currentBet !== undefined) {
          // 모든 플레이어가 currentBet 이상을 베팅했는지 확인
          if (firstBet >= currentBet) {
            // 모든 생존 플레이어가 currentBet 이상을 베팅하고, 모두 동일한 금액 → 라운드 종료
            // 추가 확인: 모든 플레이어가 콜을 했거나, roundBet이 0이 아니거나
            return { isComplete: true, allCalled: true };
          } else {
            // 아직 currentBet에 도달하지 않았음 → 라운드 계속
            return { isComplete: false, allCalled: false };
          }
        }
        // currentBet이 제공되지 않으면 (하위 호환성)
        // 모든 생존 플레이어가 동일한 금액을 베팅함 → 라운드 종료
        return { isComplete: true, allCalled: true };
      }
    }
  }

  return { isComplete: false, allCalled: false };
};

// 다음 플레이어 인덱스 찾기 (살아있는 플레이어만)
export const getNextAlivePlayerIndex = (
  currentIndex: number,
  players: Array<{ userId: string | any }>,
  playerBettingStates: Record<string, PlayerBettingState>
): number => {
  let nextIndex = (currentIndex + 1) % players.length;
  let attempts = 0;
  
  while (attempts < players.length) {
    const player = players[nextIndex];
    const userId = typeof player.userId === 'object' ? player.userId.toString() : player.userId;
    const state = playerBettingStates[userId];
    
    if (state?.isAlive) {
      return nextIndex;
    }
    
    nextIndex = (nextIndex + 1) % players.length;
    attempts++;
  }
  
  return currentIndex; // 살아있는 플레이어가 없으면 현재 인덱스 반환
};
