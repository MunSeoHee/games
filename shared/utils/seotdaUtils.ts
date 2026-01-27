import { Card } from '../types/game';

// 화투패 월 이름 (현재 사용하지 않음)
// const getMonthName = (month: number): string => {
//   const monthNames: Record<number, string> = {
//     1: '송학',
//     2: '매화',
//     3: '벚꽃',
//     4: '흑싸리',
//     5: '난초',
//     6: '나비',
//     7: '홍싸리',
//     8: '국화',
//     9: '국화',
//     10: '단풍',
//     11: '오동',
//     12: '버드나무',
//   };
//   return monthNames[month] || `${month}월`;
// };

// 섯다 족보 판정 (한국 섯다 룰)
export const calculateSeotdaScore = (cards: Card[]): { description: string; handType: 'gwangttang' | 'ttang' | 'special' | 'kkeut' | 'mangtong' } => {
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

  // 족보 판정
  let description: string;
  let handType: 'gwangttang' | 'ttang' | 'special' | 'kkeut' | 'mangtong';

  // 광땡 체크 (다른 월의 광 조합)
  const isGwang1 = card1.type === 'gwang';
  const isGwang2 = card2.type === 'gwang';
  
  if (!isSameMonth && isGwang1 && isGwang2) {
    // 다른 월의 광 조합 = 광땡
    const months = [card1.month, card2.month].sort((a, b) => a - b);
    const [m1, m2] = months;
    
    if (m1 === 3 && m2 === 8) {
      description = '삼팔광땡';
      handType = 'gwangttang';
    } else if (m1 === 1 && m2 === 8) {
      description = '일팔광땡';
      handType = 'gwangttang';
    } else if (m1 === 1 && m2 === 3) {
      description = '일삼광땡';
      handType = 'gwangttang';
    } else {
      description = '광땡';
      handType = 'gwangttang';
    }
  } else if (isSameMonth) {
    // 같은 월 = 땡
    description = `${card1.month}땡`;
    handType = 'ttang';
  } else {
    // 다른 월 = 중간 족보 또는 끗
    const months = [card1.month, card2.month].sort((a, b) => a - b);
    const [m1, m2] = months;
    
    // 하위 특수 규칙 체크 (먼저 체크)
    if (m1 === 4 && m2 === 7) {
      // 암행어사: 4 + 7 → 광땡 잡음
      description = '암행어사';
      handType = 'special';
    } else if (m1 === 3 && m2 === 7) {
      // 땡잡이: 3 + 7 → 땡 잡음
      description = '땡잡이';
      handType = 'special';
    } else if (m1 === 4 && m2 === 9) {
      // 구사 또는 멍텅구리 구사 판별
      // 멍텅구리 구사: 4월 열끗 + 9월 열끗
      if (card1.type === 'yul' && card2.type === 'yul') {
        description = '멍텅구리 구사';
        handType = 'special';
      } else {
        // 일반 구사: 4월 + 9월 (타입 상관없이)
        description = '구사';
        handType = 'special';
      }
    } else if (m1 === 1 && m2 === 2) {
      // 특수 족보: 알리
      description = '알리';
      handType = 'special';
    } else if (m1 === 1 && m2 === 4) {
      // 특수 족보: 독사
      description = '독사';
      handType = 'special';
    } else if (m1 === 1 && m2 === 9) {
      // 특수 족보: 구삥
      description = '구삥';
      handType = 'special';
    } else if (m1 === 1 && m2 === 10) {
      // 특수 족보: 장삥
      description = '장삥';
      handType = 'special';
    } else if (m1 === 4 && m2 === 10) {
      // 특수 족보: 장사
      description = '장사';
      handType = 'special';
    } else if (m1 === 4 && m2 === 6) {
      // 특수 족보: 세륙
      description = '세륙';
      handType = 'special';
    } else {
      // 끗 (합의 일의 자리)
      if (sum === 9) {
        description = '9끗';
        handType = 'kkeut';
      } else if (sum === 8) {
        description = '8끗';
        handType = 'kkeut';
      } else if (sum === 7) {
        description = '7끗';
        handType = 'kkeut';
      } else if (sum === 6) {
        description = '6끗';
        handType = 'kkeut';
      } else if (sum === 5) {
        description = '5끗';
        handType = 'kkeut';
      } else if (sum === 4) {
        description = '4끗';
        handType = 'kkeut';
      } else if (sum === 3) {
        description = '3끗';
        handType = 'kkeut';
      } else if (sum === 2) {
        description = '2끗';
        handType = 'kkeut';
      } else if (sum === 1) {
        description = '1끗';
        handType = 'kkeut';
      } else {
        // 망통 (0끗)
        description = '망통';
        handType = 'mangtong';
      }
    }
  }

  return { description, handType };
};

// 구사/멍텅구리 구사 무승부 조건 체크
export const checkGusaDraw = (
  results: Array<{ userId: string; cards: Card[]; description: string; handType: string }>
): { isDraw: boolean; drawType: 'gusa' | 'mungtungguri_gusa' | null } => {
  // 구사 또는 멍텅구리 구사가 있는지 확인
  const hasGusa = results.some(r => r.description === '구사');
  const hasMungtungguriGusa = results.some(r => r.description === '멍텅구리 구사');
  
  if (!hasGusa && !hasMungtungguriGusa) {
    return { isDraw: false, drawType: null };
  }
  
  // 구사인 경우: 최고패가 세륙 이하인지 확인 (알리, 독사, 구삥, 장삥, 장사, 세륙까지)
  if (hasGusa) {
    // 최고패 찾기 (구사 제외)
    const otherResults = results.filter(r => r.description !== '구사');
    if (otherResults.length === 0) {
      return { isDraw: true, drawType: 'gusa' };
    }
    
    // 최고패 찾기
    let bestHand = otherResults[0];
    for (let i = 1; i < otherResults.length; i++) {
      const comparison = compareSeotdaHands(
        { cards: bestHand.cards, description: bestHand.description, handType: bestHand.handType },
        { cards: otherResults[i].cards, description: otherResults[i].description, handType: otherResults[i].handType }
      );
      if (comparison < 0) {
        bestHand = otherResults[i];
      }
    }
    
    // 최고패가 세륙 이하인지 확인 (알리, 독사, 구삥, 장삥, 장사, 세륙까지 재경기)
    const specialHandsOrder: Record<string, number> = {
      '알리': 6,
      '독사': 5,
      '구삥': 4,
      '장삥': 3,
      '장사': 2,
      '세륙': 1,
    };
    
    if (bestHand.handType === 'special' && specialHandsOrder[bestHand.description] !== undefined) {
      // 특수패 중 알리~세륙까지는 재경기
      return { isDraw: true, drawType: 'gusa' };
    }
    if (bestHand.handType === 'kkeut' || bestHand.handType === 'mangtong') {
      // 끗이나 망통도 재경기
      return { isDraw: true, drawType: 'gusa' };
    }
    // 땡이나 광땡이 있으면 구사가 지고 재경기 없음
  }
  
  // 멍텅구리 구사인 경우: 최대 구땡까지 무승부 (광땡 제외)
  if (hasMungtungguriGusa) {
    // 최고패 찾기 (멍텅구리 구사 제외)
    const otherResults = results.filter(r => r.description !== '멍텅구리 구사');
    if (otherResults.length === 0) {
      return { isDraw: true, drawType: 'mungtungguri_gusa' };
    }
    
    // 최고패 찾기
    let bestHand = otherResults[0];
    for (let i = 1; i < otherResults.length; i++) {
      const comparison = compareSeotdaHands(
        { cards: bestHand.cards, description: bestHand.description, handType: bestHand.handType },
        { cards: otherResults[i].cards, description: otherResults[i].description, handType: otherResults[i].handType }
      );
      if (comparison < 0) {
        bestHand = otherResults[i];
      }
    }
    
    // 광땡은 무승부 불가능
    if (bestHand.handType === 'gwangttang') {
      return { isDraw: false, drawType: null };
    }
    
    // 구땡(9땡) 이하인지 확인
    if (bestHand.handType === 'ttang') {
      const ttangNum = parseInt(bestHand.description.replace('땡', '')) || 0;
      if (ttangNum <= 9) {
        return { isDraw: true, drawType: 'mungtungguri_gusa' };
      }
      // 10땡(장땡)은 무승부 불가
      return { isDraw: false, drawType: null };
    }
    
    // 땡 이하의 모든 패는 무승부
    return { isDraw: true, drawType: 'mungtungguri_gusa' };
  }
  
  return { isDraw: false, drawType: null };
};

// 두 패 비교 (새로운 룰)
export const compareSeotdaHands = (
  hand1: { cards: Card[]; description: string; handType: string },
  hand2: { cards: Card[]; description: string; handType: string }
): number => {
  // 1: hand1 승리, -1: hand2 승리, 0: 무승부
  
  const desc1 = hand1.description;
  const desc2 = hand2.description;
  const type1 = hand1.handType;
  const type2 = hand2.handType;
  
  // 특수 조건 체크: 암행어사와 땡잡이
  // 암행어사 조건: 광땡만 이김
  if (desc1 === '암행어사' && type2 === 'gwangttang') {
    return 1; // 암행어사 승리
  }
  if (desc2 === '암행어사' && type1 === 'gwangttang') {
    return -1; // 암행어사 승리
  }
  if (desc1 === '암행어사' && type2 !== 'gwangttang') {
    // 암행어사가 광땡이 아닌 상대를 만나면 망통 취급
    return compareHandsByType('mangtong', type2, desc1, desc2);
  }
  if (desc2 === '암행어사' && type1 !== 'gwangttang') {
    // 암행어사가 광땡이 아닌 상대를 만나면 망통 취급
    return -compareHandsByType('mangtong', type1, desc2, desc1);
  }
  
  // 땡잡이 조건: 땡만 이김
  if (desc1 === '땡잡이' && type2 === 'ttang') {
    return 1; // 땡잡이 승리
  }
  if (desc2 === '땡잡이' && type1 === 'ttang') {
    return -1; // 땡잡이 승리
  }
  if (desc1 === '땡잡이' && type2 !== 'ttang') {
    // 땡잡이가 땡이 아닌 상대를 만나면 망통 취급
    return compareHandsByType('mangtong', type2, desc1, desc2);
  }
  if (desc2 === '땡잡이' && type1 !== 'ttang') {
    // 땡잡이가 땡이 아닌 상대를 만나면 망통 취급
    return -compareHandsByType('mangtong', type1, desc2, desc1);
  }
  
  // 일반 비교
  return compareHandsByType(type1, type2, desc1, desc2);
};

// 패 타입별 비교 헬퍼 함수
function compareHandsByType(
  type1: string,
  type2: string,
  desc1: string,
  desc2: string
): number {
  // 기본 서열: 광땡 > 땡 > 특수패 > 끗 > 망통
  const typeOrder: Record<string, number> = {
    'gwangttang': 5,
    'ttang': 4,
    'special': 3,
    'kkeut': 2,
    'mangtong': 1,
  };
  
  const order1 = typeOrder[type1] || 0;
  const order2 = typeOrder[type2] || 0;
  
  if (order1 !== order2) {
    return order1 > order2 ? 1 : -1;
  }
  
  // 같은 타입 내 비교
  if (type1 === 'gwangttang') {
    // 광땡 간: 삼팔광땡 > 일팔광땡 > 일삼광땡 > 기타 광땡
    const gwangOrder: Record<string, number> = {
      '삼팔광땡': 4,
      '일팔광땡': 3,
      '일삼광땡': 2,
      '광땡': 1,
    };
    const g1 = gwangOrder[desc1] || 0;
    const g2 = gwangOrder[desc2] || 0;
    return g1 > g2 ? 1 : g1 < g2 ? -1 : 0;
  }
  
  if (type1 === 'ttang') {
    // 땡 간: 숫자 큰 쪽 승
    const t1 = parseInt(desc1.replace('땡', '')) || 0;
    const t2 = parseInt(desc2.replace('땡', '')) || 0;
    return t1 > t2 ? 1 : t1 < t2 ? -1 : 0;
  }
  
  if (type1 === 'special') {
    // 특수패 간 서열 (상위 → 하위): 알리 > 독사 > 구삥 > 장삥 > 장사 > 세륙
    const specialOrder: Record<string, number> = {
      '알리': 6,        // 1월 + 2월
      '독사': 5,        // 1월 + 4월 (4삥)
      '구삥': 4,        // 1월 + 9월
      '장삥': 3,        // 1월 + 10월
      '장사': 2,        // 4월 + 10월
      '세륙': 1,        // 4월 + 6월
    };
    const s1 = specialOrder[desc1] || 0;
    const s2 = specialOrder[desc2] || 0;
    return s1 > s2 ? 1 : s1 < s2 ? -1 : 0;
  }
  
  if (type1 === 'kkeut') {
    // 끗 간: 9끗 > 8끗 > ... > 1끗
    const k1 = parseInt(desc1.replace('끗', '')) || 0;
    const k2 = parseInt(desc2.replace('끗', '')) || 0;
    return k1 > k2 ? 1 : k1 < k2 ? -1 : 0;
  }
  
  // 망통은 모두 같음
  return 0;
}

// 3장의 카드에서 가능한 모든 조합과 족보 계산
export const calculatePossibleHands = (cards: Card[]): Array<{
  cards: Card[];
  description: string;
  handType: string;
}> => {
  if (cards.length !== 3) {
    return [];
  }

  const combinations = [
    [cards[0], cards[1]],
    [cards[0], cards[2]],
    [cards[1], cards[2]],
  ];

  return combinations.map((combo) => {
    const result = calculateSeotdaScore(combo);
    return {
      cards: combo,
      description: result.description,
      handType: result.handType,
    };
  });
};
