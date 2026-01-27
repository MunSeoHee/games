// 원을 n억m만j원 형식으로 변환
export const formatSeotdaMoney = (won: number): string => {
  if (won === 0) return '0원';
  
  const eok = Math.floor(won / 100000000); // 억
  const man = Math.floor((won % 100000000) / 10000); // 만
  const remainder = won % 10000; // 나머지 (원 단위)
  
  let result = '';
  
  if (eok > 0) {
    result += `${eok}억`;
  }
  
  if (man > 0) {
    result += `${man}만`;
  }
  
  // 나머지가 있거나 모든 단위가 0인 경우
  if (remainder > 0) {
    result += `${remainder}원`;
  } else if (result === '') {
    // 모든 단위가 0인 경우 (이미 위에서 체크했지만 안전을 위해)
    result = '0원';
  } else {
    // 억이나 만이 있고 나머지가 0인 경우
    result += '원';
  }
  
  return result;
};

// 코인을 원으로 변환 (1코인 = 10,000원)
export const coinsToWon = (coins: number): number => {
  return coins * 10000;
};

// 원을 코인으로 변환
export const wonToCoins = (won: number): number => {
  return Math.floor(won / 10000);
};
