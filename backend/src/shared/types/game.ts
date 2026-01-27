// 공용 타입 정의

export enum GameType {
  SEOTDA = 'seotda',
  POKER = 'poker',
  MARBLES = 'marbles',
}

export enum GameRoomStatus {
  WAITING = 'waiting',
  PLAYING = 'playing',
  FINISHED = 'finished',
}

export enum SeotdaRank {
  HIGH_CARD = 'high_card',
  ONE_PAIR = 'one_pair',
  TWO_PAIR = 'two_pair',
  TRIPLE = 'triple',
  STRAIGHT = 'straight',
  FLUSH = 'flush',
  FULL_HOUSE = 'full_house',
  FOUR_OF_A_KIND = 'four_of_a_kind',
  STRAIGHT_FLUSH = 'straight_flush',
}

export interface Card {
  month: number; // 1~12월 (화투패, 총 48장)
  type: 'gwang' | 'yul' | 'tti' | 'pi'; // 광, 열끗, 띠, 피
  id: string; // 고유 ID (같은 월, 같은 타입 카드 구분용)
}

export interface Player {
  userId: string;
  username: string;
  money: number;
  cards?: Card[];
  bet?: number;
  isReady?: boolean;
}

export interface GameRoom {
  id: string;
  hostId: string;
  players: Player[];
  gameType: GameType;
  status: GameRoomStatus;
  createdAt: Date;
  currentGame?: GameSession;
}

export interface GameSession {
  id: string;
  roomId: string;
  players: Player[];
  gameData: any; // 게임별 데이터
  result?: GameResult;
  createdAt: Date;
}

export interface GameResult {
  winnerId: string;
  scores: Record<string, number>;
  moneyChanges: Record<string, number>;
}

export type BettingAction = 'die' | 'call' | 'half' | 'quarter' | 'ddadang' | 'check' | 'bbing' | 'full' | 'allin';

export interface PlayerBettingState {
  userId: string;
  action?: BettingAction;
  amount: number;
  totalBet: number; // 게임 시작부터 현재까지의 총 베팅 금액 (누적)
  roundBet?: number; // 현재 라운드에서 베팅한 금액
  hasCalled: boolean;
  hasRaised: boolean;
  isAlive: boolean;
}

export interface SeotdaGameData {
  deck: Card[];
  dealerIndex: number;
  currentPlayerIndex: number;
  bettingRound: number; // 1: 첫 번째 패 공개 후, 2: 두 번째 패 지급 후, 3: 세 번째 패 지급 후
  pot: number;
  baseBet: number; // 기본 단위 금액
  currentBet: number; // 현재 베팅 금액
  phase: 'initial' | 'betting' | 'second-card' | 'showdown' | 'finished';
  playerBettingStates: Record<string, PlayerBettingState>;
  lastRaisePlayerIndex?: number; // 마지막으로 레이즈한 플레이어
  playerSelectedCards?: Record<string, Card[]>; // 쇼다운 시 각 플레이어가 선택한 2장
  playerSelectedRevealCard?: Record<string, Card | null>; // 게임 시작 시 각 플레이어가 선택한 공개 카드
}
