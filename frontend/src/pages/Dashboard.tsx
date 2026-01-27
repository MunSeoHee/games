import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { GameType, GameRoomStatus } from '../shared/types/game';

interface GameRoom {
  _id: string;
  hostId: { username: string };
  players: Array<{ username: string; isReady: boolean }>;
  gameType: GameType;
  status: GameRoomStatus;
  maxPlayers: number;
  baseBetCoins?: number; // 기본 배팅금 (코인 단위)
}

export default function Dashboard() {
  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGameType, setSelectedGameType] = useState<GameType>(GameType.SEOTDA);
  const [selectedBaseBet, setSelectedBaseBet] = useState<number>(10); // 기본 배팅금 (코인 단위)

  useEffect(() => {
    fetchUserInfo();
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000); // 3초마다 방 목록 갱신
    return () => clearInterval(interval);
  }, []);

  const fetchUserInfo = async () => {
    try {
      const response = await api.get('/auth/me');
      updateUser(response.data);
    } catch (error) {
      console.error('사용자 정보 조회 실패:', error);
    }
  };

  const fetchRooms = async () => {
    try {
      const response = await api.get('/game/rooms', {
        params: { gameType: selectedGameType, status: GameRoomStatus.WAITING },
      });
      setRooms(response.data);
    } catch (error) {
      console.error('방 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    try {
      const requestData: any = {
        gameType: selectedGameType,
        maxPlayers: 4,
      };
      
      // 섯다인 경우 기본 배팅금 포함
      if (selectedGameType === GameType.SEOTDA) {
        requestData.baseBetCoins = selectedBaseBet;
      }
      
      const response = await api.post('/game/rooms', requestData);
      navigate(`/room/${response.data._id}`);
    } catch (error: any) {
      alert(error.response?.data?.error || '방 생성에 실패했습니다.');
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    try {
      await api.post(`/game/rooms/${roomId}/join`);
      navigate(`/room/${roomId}`);
    } catch (error: any) {
      alert(error.response?.data?.error || '방 참가에 실패했습니다.');
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                안녕하세요, {user.username}님!
              </h1>
              <div className="mt-2 flex gap-4 text-sm text-gray-600">
                <span>💰 보유 금액: {user.money.toLocaleString()}코인</span>
                <span>⭐ 레벨: {user.characterLevel}</span>
                <span>📊 경험치: {user.characterExp}</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 게임 선택 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">게임 선택</h2>
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setSelectedGameType(GameType.SEOTDA)}
              className={`px-6 py-3 rounded-md font-semibold ${
                selectedGameType === GameType.SEOTDA
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              섯다
            </button>
            <button
              onClick={() => setSelectedGameType(GameType.POKER)}
              disabled
              className="px-6 py-3 rounded-md font-semibold bg-gray-200 text-gray-400 cursor-not-allowed"
            >
              포커 (준비 중)
            </button>
            <button
              onClick={() => setSelectedGameType(GameType.MARBLES)}
              disabled
              className="px-6 py-3 rounded-md font-semibold bg-gray-200 text-gray-400 cursor-not-allowed"
            >
              부루마불 (준비 중)
            </button>
          </div>
          
          {/* 섯다 기본 배팅금 선택 (방장만) */}
          {selectedGameType === GameType.SEOTDA && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                기본 배팅금 선택 (방장 전용)
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedBaseBet(10)}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    selectedBaseBet === 10
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  10코인
                </button>
                <button
                  onClick={() => setSelectedBaseBet(50)}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    selectedBaseBet === 50
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  50코인
                </button>
                <button
                  onClick={() => setSelectedBaseBet(100)}
                  className={`px-4 py-2 rounded-md font-semibold ${
                    selectedBaseBet === 100
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  100코인
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 방 목록 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">게임 방 목록</h2>
            <button
              onClick={handleCreateRoom}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              방 만들기
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">로딩 중...</div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              대기 중인 방이 없습니다. 방을 만들어보세요!
            </div>
          ) : (
            <div className="space-y-3">
              {rooms.map((room) => (
                <div
                  key={room._id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 flex justify-between items-center"
                >
                  <div>
                    <div className="font-semibold">
                      {typeof room.hostId === 'object' ? room.hostId.username : 'Unknown'}의 방
                    </div>
                    <div className="text-sm text-gray-600">
                      플레이어: {room.players.length}/{room.maxPlayers} | 준비: {room.players.filter(p => p.isReady).length}/{room.players.length}
                      {room.gameType === GameType.SEOTDA && room.baseBetCoins && (
                        <span className="ml-2">
                          | 배팅: {room.baseBetCoins}코인
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoinRoom(room._id)}
                    disabled={room.status !== GameRoomStatus.WAITING}
                    className={`px-4 py-2 rounded-md ${
                      room.status === GameRoomStatus.WAITING
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {room.status === GameRoomStatus.WAITING ? '참가' : '게임 중'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
