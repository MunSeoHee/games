import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import SeotdaGame from '../components/SeotdaGame';
import { GameType, GameRoomStatus } from '../shared/types/game';
import { formatSeotdaMoney, coinsToWon } from '../utils/formatMoney';

interface Player {
  userId: string;
  username: string;
  money: number;
  isReady: boolean;
}

interface GameRoom {
  _id: string;
  hostId: string | { username: string };
  players: Player[];
  gameType: GameType;
  status: GameRoomStatus;
  maxPlayers: number;
  baseBetCoins?: number; // 기본 배팅금 (코인 단위)
}

interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  timestamp: Date;
}

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId || !token) return;

    // Socket.io 연결
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3002';
    const newSocket = io(socketUrl, {
      auth: { token },
    });

    newSocket.on('connect', () => {
      console.log('Socket 연결됨');
      newSocket.emit('room:join', roomId);
    });

    newSocket.on('room:update', (updatedRoom: GameRoom) => {
      console.log('방 상태 업데이트:', updatedRoom.status, updatedRoom.gameType, updatedRoom);
      // 중복 플레이어 제거
      const uniquePlayers = updatedRoom.players.filter((player, index, self) => {
        const playerUserId = String(player.userId);
        return index === self.findIndex((p) => {
          const pUserId = String(p.userId);
          return pUserId === playerUserId || p.username === player.username;
        });
      });
      
      const updatedRoomData = {
        ...updatedRoom,
        players: uniquePlayers,
      };
      
      console.log('방 상태 설정:', updatedRoomData.status, updatedRoomData.gameType);
      setRoom(updatedRoomData);
    });

    newSocket.on('room:chat', (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message]);
    });

    newSocket.on('game:started', (data: any) => {
      // 게임 시작 이벤트 처리
      // room:update 이벤트가 이미 방 상태를 업데이트하므로 여기서는 로그만 남김
      console.log('게임 시작 이벤트 수신:', data);
    });

    newSocket.on('error', (error: { message: string }) => {
      alert(error.message);
    });

    setSocket(newSocket);

    // 방 정보 조회
    const checkRoom = async () => {
      try {
        const roomData = await fetchRoom();
        // 게임이 이미 시작된 방이면 대시보드로 리다이렉트
        if (roomData && roomData.status === GameRoomStatus.PLAYING) {
          const isPlayerInRoom = roomData.players.some(
            (p) => String(p.userId) === user?.id || p.username === user?.username
          );
          if (!isPlayerInRoom) {
            alert('이미 게임이 시작된 방입니다.');
            navigate('/dashboard');
            return;
          }
        }
      } catch (error) {
        console.error('방 확인 오류:', error);
      }
    };
    checkRoom();

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, token]);

  const fetchRoom = async (): Promise<GameRoom | null> => {
    try {
      const response = await api.get(`/game/rooms/${roomId}`);
      console.log('방 정보 조회:', response.data.status, response.data.gameType);
      setRoom(response.data);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        alert('방을 찾을 수 없습니다.');
        navigate('/dashboard');
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    if (socket) {
      socket.emit('room:leave', roomId);
      socket.disconnect();
    }
    try {
      await api.post(`/game/rooms/${roomId}/leave`);
    } catch (error) {
      console.error('방 나가기 실패:', error);
    }
    navigate('/dashboard');
  };

  const handleReady = () => {
    if (socket) {
      socket.emit('room:ready', roomId);
    }
  };

  const handleStartGame = () => {
    if (socket) {
      socket.emit('game:start', roomId);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket && chatInput.trim()) {
      socket.emit('room:chat', roomId, chatInput.trim());
      setChatInput('');
    }
  };

  if (loading || !room || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="text-center text-gray-500">방 정보를 불러오는 중...</div>
          </div>
        </div>
      </div>
    );
  }

  const isHost = typeof room.hostId === 'object' 
    ? room.hostId.username === user.username 
    : room.hostId.toString() === user.id;
  const currentPlayer = room.players.find((p) => {
    const playerUserId = typeof p.userId === 'object' 
      ? String(p.userId) 
      : p.userId;
    return playerUserId === user.id || p.username === user.username;
  });
  const allReady = room.players.length >= 2 && room.players.every((p) => p.isReady);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">게임 방</h1>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
          >
            나가기
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 게임 영역 */}
          <div className="lg:col-span-2">
            {!room ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-center text-gray-500">방 정보를 불러오는 중...</div>
              </div>
            ) : room.status === GameRoomStatus.WAITING ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">대기실</h2>
                {room.gameType === GameType.SEOTDA && room.baseBetCoins && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-sm font-semibold text-blue-800">
                      기본 배팅금: {formatSeotdaMoney(coinsToWon(room.baseBetCoins))}
                      <span className="ml-2 text-gray-400 font-normal">
                        ({room.baseBetCoins}코인)
                      </span>
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {room.players.map((player, idx) => {
                      const playerUserId = String(player.userId);
                      const isCurrentUser = playerUserId === user.id || player.username === user.username;
                      
                      return (
                      <div
                        key={`${playerUserId}-${idx}`}
                        className={`border-2 rounded-lg p-4 ${
                          isCurrentUser
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="font-semibold">{player.username}</div>
                        <div className="text-sm text-gray-600">
                          💰 {room.gameType === GameType.SEOTDA ? (
                            <>
                              {formatSeotdaMoney(coinsToWon(player.money))}
                              <span className="ml-2 text-gray-400">
                                ({player.money.toLocaleString()}코인)
                              </span>
                            </>
                          ) : (
                            `${player.money.toLocaleString()}코인`
                          )}
                        </div>
                        <div className="text-sm">
                          {player.isReady ? (
                            <span className="text-green-600">✓ 준비 완료</span>
                          ) : (
                            <span className="text-gray-400">대기 중...</span>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>

                  {currentPlayer && (
                    <div className="flex gap-4">
                      <button
                        onClick={handleReady}
                        className={`flex-1 py-2 px-4 rounded-md font-semibold ${
                          currentPlayer.isReady
                            ? 'bg-gray-500 text-white'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                      >
                        {currentPlayer.isReady ? '준비 취소' : '준비'}
                      </button>
                      {isHost && allReady && (
                        <button
                          onClick={handleStartGame}
                          className="flex-1 py-2 px-4 bg-purple-600 text-white rounded-md font-semibold hover:bg-purple-700"
                        >
                          게임 시작
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : room.status === GameRoomStatus.PLAYING && room.gameType === GameType.SEOTDA ? (
              socket ? (
                <SeotdaGame roomId={roomId!} socket={socket} room={{
                  id: room._id,
                  hostId: typeof room.hostId === 'string' ? room.hostId : String(room.hostId),
                  players: room.players.map(p => ({
                    userId: String(p.userId),
                    username: p.username,
                    money: p.money,
                    isReady: p.isReady
                  })),
                  gameType: room.gameType,
                  status: room.status,
                  createdAt: new Date()
                }} />
              ) : (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <div className="text-center text-gray-500">소켓 연결 중...</div>
                </div>
              )
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6">
                  <div className="text-center text-gray-500">
                  <div className="mb-2 font-bold">디버깅 정보:</div>
                  <div className="mb-2">게임 상태: {room.status || 'undefined'}</div>
                  <div className="mb-2">게임 타입: {room.gameType || 'undefined'}</div>
                  <div className="mb-2">필요한 상태: {GameRoomStatus.PLAYING}</div>
                  <div className="mb-2">필요한 타입: {GameType.SEOTDA}</div>
                  <div className="mb-2">상태 일치: {room.status === GameRoomStatus.PLAYING ? '✓' : '✗'}</div>
                  <div className="mb-2">타입 일치: {room.gameType === GameType.SEOTDA ? '✓' : '✗'}</div>
                  {room.status !== GameRoomStatus.PLAYING && (
                    <div className="text-red-500 mt-2">게임이 시작되지 않았습니다. (현재: {room.status})</div>
                  )}
                  {room.status === GameRoomStatus.PLAYING && room.gameType !== GameType.SEOTDA && (
                    <div className="text-red-500 mt-2">섯다 게임이 아닙니다. (현재: {room.gameType})</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 채팅 영역 */}
          <div className="bg-white rounded-lg shadow-md p-4 flex flex-col h-[600px]">
            <h2 className="text-xl font-bold mb-4">채팅</h2>
            <div className="flex-1 overflow-y-auto mb-4 space-y-2">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-semibold">{msg.username}:</span>{' '}
                  <span>{msg.message}</span>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="메시지 입력..."
              />
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                전송
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
