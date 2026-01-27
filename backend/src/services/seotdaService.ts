import { Card, SeotdaRank, SeotdaGameData } from '../shared/types/game';

// 화투패 덱 생성 (섯다: 1~10월만 사용, 총 20장)
export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  
  // 섯다 화투패 구성 (1~10월 × 2장씩 = 20장)
  // 섯다는 각 월에서 2장씩만 사용 (일반적으로 광/띠/열끗 중 하나와 피 하나, 또는 피 2장)
  const hwatuConfig: Array<{
    month: number;
    cards: Array<{ type: 'gwang' | 'yul' | 'tti' | 'pi' }>;
  }> = [
    { month: 1, cards: [{ type: 'gwang' }, { type: 'pi' }] }, // 송학: 광, 피
    { month: 2, cards: [{ type: 'yul' }, { type: 'pi' }] },   // 매화: 열끗, 피
    { month: 3, cards: [{ type: 'gwang' }, { type: 'pi' }] }, // 벚꽃: 광, 피
    { month: 4, cards: [{ type: 'yul' }, { type: 'pi' }] },  // 흑싸리: 열끗, 피
    { month: 5, cards: [{ type: 'yul' }, { type: 'pi' }] },  // 난초: 열끗, 피
    { month: 6, cards: [{ type: 'yul' }, { type: 'pi' }] },  // 나비: 열끗, 피
    { month: 7, cards: [{ type: 'yul' }, { type: 'pi' }] },  // 홍싸리: 열끗, 피
    { month: 8, cards: [{ type: 'gwang' }, { type: 'pi' }] }, // 국화: 광, 피
    { month: 9, cards: [{ type: 'yul' }, { type: 'pi' }] },  // 국화: 열끗, 피
    { month: 10, cards: [{ type: 'yul' }, { type: 'pi' }] }, // 단풍: 열끗, 피
  ];

  // 덱 생성 (3장 섯다: 각 월에서 1장씩, 총 20장)
  // 각 월에서 광/열끗/띠 중 하나와 피 하나를 섞어서 총 20장 만들기
  
  // 각 월의 특수 카드 (광/열끗/띠) 추가
  for (const config of hwatuConfig) {
    deck.push({
      month: config.month,
      type: config.cards[0].type, // 각 월의 첫 번째 카드 (광/열끗/띠)
      id: `${config.month}_${config.cards[0].type}_1`, // 이미지 파일명과 일치하도록 _1 사용
    });
  }
  
  // 각 월의 피 카드 추가 (이미지 파일명과 일치: 1_pi_1, 1_pi_2 등)
  for (let month = 1; month <= 10; month++) {
    deck.push({
      month,
      type: 'pi',
      id: `${month}_pi_1`, // 각 월의 첫 번째 피 카드 (이미지 파일명과 일치)
    });
  }
  
  return shuffleDeck(deck);
};

// 덱 셔플
export const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// 화투패 월 이름
const getMonthName = (month: number): string => {
  const monthNames: Record<number, string> = {
    1: '송학',
    2: '매화',
    3: '벚꽃',
    4: '흑싸리',
    5: '난초',
    6: '나비',
    7: '홍싸리',
    8: '국화',
    9: '국화',
    10: '단풍',
    11: '오동',
    12: '버드나무',
  };
  return monthNames[month] || `${month}월`;
};

// 섯다 점수 계산 (한국 섯다 룰)
export const calculateSeotdaScore = (cards: Card[]): { rank: SeotdaRank; score: number; description: string } => {
  if (cards.length !== 2) {
    throw new Error('섯다는 정확히 2장의 카드가 필요합니다.');
  }

  const [card1, card2] = cards;
  
  // 같은 월인지 확인 (땡)
  const isSameMonth = card1.month === card2.month;
  
  // 끗 계산을 위한 값 (월의 일의 자리)
  const getValue = (month: number): number => {
    return month % 10; // 1~10월이므로 그대로 사용
  };

  const value1 = getValue(card1.month);
  const value2 = getValue(card2.month);
  const sum = (value1 + value2) % 10; // 일의 자리만

  // 랭크 결정 (한국 섯다 족보 순위)
  let rank: SeotdaRank;
  let score: number;
  let description: string;

  // 광땡 체크 (다른 월의 광 조합)
  const isGwang1 = card1.type === 'gwang';
  const isGwang2 = card2.type === 'gwang';
  
  if (!isSameMonth && isGwang1 && isGwang2) {
    // 다른 월의 광 조합 = 광땡
    const months = [card1.month, card2.month].sort((a, b) => a - b);
    const [m1, m2] = months;
    
    if (m1 === 3 && m2 === 8) {
      // 삼팔광땡 (최고 족보)
      rank = SeotdaRank.STRAIGHT_FLUSH;
      score = 1000;
      description = '삼팔광땡';
    } else if (m1 === 1 && m2 === 8) {
      // 일팔광땡
      rank = SeotdaRank.FOUR_OF_A_KIND;
      score = 900;
      description = '일팔광땡';
    } else if (m1 === 1 && m2 === 3) {
      // 일삼광땡
      rank = SeotdaRank.FOUR_OF_A_KIND;
      score = 800;
      description = '일삼광땡';
    } else {
      // 기타 광땡 (1광+3광, 1광+8광, 3광+8광 외의 조합은 일반 광땡으로 처리)
      rank = SeotdaRank.FULL_HOUSE;
      score = 700;
      description = '광땡';
    }
  } else if (isSameMonth) {
    // 같은 월 = 땡
    rank = SeotdaRank.FULL_HOUSE;
    score = 300 + card1.month; // 10땡=310, 9땡=309, 8땡=308, ... 1땡=301
    description = `${card1.month}땡`;
  } else {
    // 다른 월 = 중간 족보 또는 끗
    const months = [card1.month, card2.month].sort((a, b) => a - b);
    const [m1, m2] = months;
    
    // 하위 특수 규칙 체크 (먼저 체크)
    if (m1 === 4 && m2 === 7) {
      // 암행어사: 4 + 7 → 광땡 잡음
      rank = SeotdaRank.FULL_HOUSE;
      score = 750; // 광땡보다 높게 설정
      description = '암행어사';
    } else if (m1 === 3 && m2 === 7) {
      // 땡잡이: 3 + 7 → 땡 잡음
      rank = SeotdaRank.FULL_HOUSE;
      score = 500; // 땡보다 높게 설정
      description = '땡잡이';
    } else if (m1 === 4 && m2 === 9) {
      // 구사: 9 + 4 → 망통 취급 또는 특수패
      rank = SeotdaRank.HIGH_CARD;
      score = 5; // 망통보다는 높지만 낮게 설정
      description = '구사';
    } else if (m1 === 1 && m2 === 2) {
      // 특수 족보: 알리
      rank = SeotdaRank.TWO_PAIR;
      score = 200;
      description = '알리';
    } else if (m1 === 1 && m2 === 4) {
      // 특수 족보: 독사
      rank = SeotdaRank.TWO_PAIR;
      score = 190;
      description = '독사';
    } else if (m1 === 1 && m2 === 9) {
      // 특수 족보: 구삥
      rank = SeotdaRank.TWO_PAIR;
      score = 180;
      description = '구삥';
    } else if (m1 === 1 && m2 === 10) {
      // 특수 족보: 장삥
      rank = SeotdaRank.TWO_PAIR;
      score = 170;
      description = '장삥';
    } else if (m1 === 4 && m2 === 10) {
      // 특수 족보: 장사
      rank = SeotdaRank.TWO_PAIR;
      score = 160;
      description = '장사';
    } else if (m1 === 4 && m2 === 6) {
      // 특수 족보: 세륙
      rank = SeotdaRank.TWO_PAIR;
      score = 150;
      description = '세륙';
    } else {
      // 끗 (합의 일의 자리)
      if (sum === 9) {
        rank = SeotdaRank.STRAIGHT;
        score = 90;
        description = '9끗';
      } else if (sum === 8) {
        rank = SeotdaRank.STRAIGHT;
        score = 80;
        description = '8끗';
      } else if (sum === 7) {
        rank = SeotdaRank.STRAIGHT;
        score = 70;
        description = '7끗';
      } else if (sum === 6) {
        rank = SeotdaRank.STRAIGHT;
        score = 60;
        description = '6끗';
      } else if (sum === 5) {
        rank = SeotdaRank.STRAIGHT;
        score = 50;
        description = '5끗';
      } else if (sum === 4) {
        rank = SeotdaRank.STRAIGHT;
        score = 40;
        description = '4끗';
      } else if (sum === 3) {
        rank = SeotdaRank.STRAIGHT;
        score = 30;
        description = '3끗';
      } else if (sum === 2) {
        rank = SeotdaRank.STRAIGHT;
        score = 20;
        description = '2끗';
      } else if (sum === 1) {
        rank = SeotdaRank.STRAIGHT;
        score = 10;
        description = '1끗';
      } else {
        // 망통 (0끗)
        rank = SeotdaRank.HIGH_CARD;
        score = 0;
        description = '망통';
      }
    }
  }

  return { rank, score, description };
};

// 게임 초기화
export const initializeSeotdaGame = (playerCount: number, baseBet: number = 100): SeotdaGameData => {
  const deck = createDeck();
  const dealerIndex = Math.floor(Math.random() * playerCount);

  return {
    deck,
    dealerIndex,
    currentPlayerIndex: (dealerIndex + 1) % playerCount,
    bettingRound: 1,
    pot: 0,
    baseBet,
    currentBet: baseBet,
    phase: 'initial',
    playerBettingStates: {},
  };
};

// 승부 판정 (새로운 룰 사용)
export const compareSeotdaHands = (hand1: Card[], hand2: Card[]): number => {
  // shared/utils의 함수 사용
  const { calculateSeotdaScore, compareSeotdaHands: compareHands } = require('../../../shared/utils/seotdaUtils');
  
  const result1 = calculateSeotdaScore(hand1);
  const result2 = calculateSeotdaScore(hand2);
  
  const hand1Data = { cards: hand1, description: result1.description, handType: result1.handType };
  const hand2Data = { cards: hand2, description: result2.description, handType: result2.handType };
  
  return compareHands(hand1Data, hand2Data);
};
