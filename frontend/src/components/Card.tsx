import { useState, useEffect } from 'react';
import { Card as CardType } from '../shared/types/game';

interface CardProps {
  card: CardType | null;
  isRevealed?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  useImage?: boolean; // 이미지 사용 여부
}

// 카드 이미지 경로 생성 함수
const getCardImagePath = (card: CardType): string => {
  // 카드 ID에서 이미지 경로 생성
  // 예: "4_pi_1" -> "/cards/4_pi_1.png"
  // 대소문자 모두 지원 (.png, .PNG)
  return `/cards/${card.id}.png`;
};

export default function Card({ card, isRevealed = true, size = 'medium', className = '', useImage = false }: CardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imageTried, setImageTried] = useState(false);
  const [backImageError, setBackImageError] = useState(false);
  const [backImageSrc, setBackImageSrc] = useState<string>('/cards/back.PNG');
  const [backImageTried, setBackImageTried] = useState(false);
  
  // 카드 이미지 경로 초기화
  useEffect(() => {
    if (card && useImage) {
      const imagePath = getCardImagePath(card);
      const imagePathUpper = imagePath.replace('.png', '.PNG');
      console.log('카드 이미지 경로:', imagePathUpper, '카드 ID:', card.id); // 디버깅용
      setImageSrc(imagePathUpper); // 대문자 확장자로 시작
      setImageTried(false);
      setImageError(false); // 카드가 변경되면 에러 상태 초기화
    } else if (!useImage) {
      // 이미지 사용 안 할 때는 초기화
      setImageSrc('');
      setImageError(false);
    }
  }, [card?.id, useImage]); // card.id만 의존성으로 사용하여 불필요한 재렌더링 방지
  
  const sizeClasses = {
    small: 'w-12 h-16 text-xs',
    medium: 'w-16 h-24 text-sm',
    large: 'w-20 h-28 text-lg',
  };

  if (!isRevealed || !card) {
    // 카드 뒷면 - 이미지가 없으면 즉시 기본 스타일 표시 (깜빡임 방지)
    if (useImage && !backImageError) {
      return (
        <div className={`relative ${sizeClasses[size]} ${className}`}>
          <img
            key="back-card"
            src={backImageSrc}
            alt=""
            className={`w-full h-full border-2 border-gray-300 rounded-lg shadow-md object-contain bg-white`}
            onError={(e) => {
              // 이미지 로드 실패 시 즉시 기본 스타일로 전환 (깜빡임 방지)
              e.preventDefault();
              e.stopPropagation();
              
              // 한 번만 재시도하도록 체크
              if (!backImageTried && backImageSrc.endsWith('.PNG')) {
                setBackImageTried(true);
                setBackImageSrc('/cards/back.png');
              } else {
                // 소문자도 실패 시 이미지 사용 중지
                setBackImageError(true);
              }
            }}
            onLoad={() => {
              // 이미지 로드 성공 시 에러 상태 초기화
              setBackImageError(false);
              setBackImageTried(false);
            }}
          />
        </div>
      );
    }
    
    // 이미지 로드 실패 또는 이미지 미사용 시 기본 스타일
    return (
      <div
        className={`${sizeClasses[size]} border-2 border-gray-300 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-md ${className}`}
      >
        <div className="text-white font-bold text-xs">화투</div>
      </div>
    );
  }

  // 이미지 사용 시
  if (useImage && !imageError && imageSrc) {
    return (
      <div className={`relative ${sizeClasses[size]} ${className}`}>
        <img
          key={`card-${card.id}-${imageSrc}`}
          src={imageSrc}
          alt=""
          className={`w-full h-full border-2 border-gray-300 rounded-lg shadow-lg object-contain bg-white`}
          onError={(e) => {
            // 이미지 로드 실패 시 즉시 처리 (깜빡임 방지)
            const target = e.target as HTMLImageElement;
            console.log('이미지 로드 실패:', target.src, '카드 ID:', card.id); // 디버깅용
            
            // 한 번만 재시도하도록 체크
            if (!imageTried && imageSrc.endsWith('.PNG')) {
              setImageTried(true);
              const lowerPath = imageSrc.replace('.PNG', '.png');
              console.log('소문자로 재시도:', lowerPath); // 디버깅용
              setImageSrc(lowerPath);
            } else {
              // 소문자도 실패 시 이미지 사용 중지 (텍스트로 대체)
              console.log('이미지 로드 완전 실패, 텍스트로 전환'); // 디버깅용
              setImageError(true);
            }
          }}
          onLoad={() => {
            // 이미지 로드 성공 시 에러 상태 초기화
            setImageError(false);
            setImageTried(false);
          }}
        />
        {/* 좌측 하단에 월 표시 */}
        <div className="absolute bottom-1 left-1 bg-black bg-opacity-70 text-white rounded px-1.5 py-0.5 text-xs font-bold">
          {card.month}
        </div>
      </div>
    );
  }
  
  // 이미지 로드 실패 또는 이미지 미사용 시 텍스트 표시

  // 화투패 월 이름
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

  // 화투패 타입 표시
  const getTypeName = (card: CardType): string => {
    if (card.type === 'gwang') return '광';
    if (card.type === 'yul') return '열끗';
    if (card.type === 'tti') return '띠';
    if (card.type === 'pi') return '피';
    return '?';
  };
  
  const monthName = monthNames[card.month] || `${card.month}월`;
  const typeName = getTypeName(card);
  
  // 타입별 색상
  let typeColor: string;
  if (card.type === 'gwang') {
    typeColor = 'text-yellow-600 bg-yellow-50'; // 광은 노란색
  } else if (card.type === 'yul') {
    typeColor = 'text-green-600 bg-green-50'; // 열끗은 초록색
  } else if (card.type === 'tti') {
    typeColor = 'text-blue-600 bg-blue-50'; // 띠는 파란색
  } else if (card.type === 'pi') {
    typeColor = 'text-red-600 bg-red-50'; // 피는 빨간색
  } else {
    typeColor = 'text-gray-700 bg-gray-50';
  }

  return (
    <div
      className={`${sizeClasses[size]} border-2 border-gray-300 rounded-lg bg-white flex flex-col items-center justify-between p-2 shadow-lg ${className}`}
    >
      {/* 상단: 월 */}
      <div className="font-bold text-xs text-gray-800 w-full text-center">
        {card.month}월
      </div>

      {/* 중앙: 월 이름과 타입 */}
      <div className={`flex-1 flex flex-col items-center justify-center ${typeColor} rounded w-full`}>
        <div className="text-xs font-semibold mb-1">{monthName}</div>
        <div className="text-lg font-bold">{typeName}</div>
      </div>

      {/* 하단: 월 (뒤집힌) */}
      <div className="font-bold text-xs text-gray-800 w-full text-center rotate-180">
        {card.month}월
      </div>
    </div>
  );
}
