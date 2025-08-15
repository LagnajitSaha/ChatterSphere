'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

type ChatMessage = { id: number; username: string; text: string; timestamp: number; edited?: boolean };
type OnlineUser = { socketId: string; username: string; room?: string };

const DEFAULT_ROOMS = ['General', 'Sports', 'Tech'];

export default function ChatPage() {
	const router = useRouter();
	const [username, setUsername] = useState<string>('');
	const [rooms, setRooms] = useState<string[]>(DEFAULT_ROOMS);
	const [currentRoom, setCurrentRoom] = useState<string>('General');
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
	const [inputValue, setInputValue] = useState('');
	const [showEmoji, setShowEmoji] = useState(false);
	const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
	const [editingMessage, setEditingMessage] = useState<{ id: number; text: string } | null>(null);
	const [editValue, setEditValue] = useState('');
	const [socketConnected, setSocketConnected] = useState(false);
	const [isDarkMode, setIsDarkMode] = useState(false);
	const stopTypingTimeout = useRef<NodeJS.Timeout | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const socketRef = useRef<any>(null);

	// Check authentication and fetch rooms
	useEffect(() => {
		const stored = typeof window !== 'undefined' ? localStorage.getItem('cs_username') : null;
		if (!stored) {
			router.replace('/login');
			return;
		}
		setUsername(stored);

		// Load theme preference
		const savedTheme = localStorage.getItem('cs_theme');
		if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
			setIsDarkMode(true);
		}

		// Fetch rooms immediately
		fetch('http://localhost:4000/rooms')
			.then(r => r.json())
			.then((d) => Array.isArray(d.rooms) ? setRooms(d.rooms) : setRooms(DEFAULT_ROOMS))
			.catch(() => setRooms(DEFAULT_ROOMS));
	}, [router]);

	// Apply theme to body
	useEffect(() => {
		if (typeof window !== 'undefined') {
			document.body.classList.toggle('dark', isDarkMode);
			localStorage.setItem('cs_theme', isDarkMode ? 'dark' : 'light');
		}
	}, [isDarkMode]);

	// Initialize socket connection
	useEffect(() => {
		if (!username) return;
		
		const socket = getSocket(username);
		socketRef.current = socket;
		
		// Handle socket connection
		const handleConnect = () => {
			console.log('Socket connected');
			setSocketConnected(true);
			// Register user and join room immediately after connection
			socket.emit('registerUser', { username });
			socket.emit('joinRoom', { room: currentRoom });
		};

		const handleDisconnect = () => {
			console.log('Socket disconnected');
			setSocketConnected(false);
		};

		socket.on('connect', handleConnect);
		socket.on('disconnect', handleDisconnect);

		// If already connected, join room immediately
		if (socket.connected) {
			handleConnect();
		}

		return () => {
			socket.off('connect', handleConnect);
			socket.off('disconnect', handleDisconnect);
		};
	}, [username, currentRoom]);

	// Set up socket event listeners
	useEffect(() => {
		if (!socketRef.current || !socketConnected) return;
		
		const socket = socketRef.current;
		
		const handleHistory = (payload: { room: string; messages: ChatMessage[] }) => {
			console.log('Received history:', payload);
			if (payload.room === currentRoom) {
				setMessages(payload.messages);
			}
		};
		
		const handleMessage = (payload: { room: string; message: ChatMessage }) => {
			console.log('Received message:', payload);
			if (payload.room === currentRoom) {
				setMessages(prev => [...prev, payload.message]);
			}
		};
		
		const handleUsers = (payload: { room: string; users: OnlineUser[] }) => {
			console.log('Received users:', payload);
			if (payload.room === currentRoom) {
				setOnlineUsers(payload.users);
			}
		};
		
		const handleTyping = ({ username: u }: { username: string }) => {
			setTypingUsers(prev => new Set([...prev, u]));
		};
		
		const handleStopTyping = ({ username: u }: { username: string }) => {
			setTypingUsers(prev => {
				const next = new Set(prev);
				next.delete(u);
				return next;
			});
		};
		
		const handleMessageEdit = (payload: { room: string; messageId: number; newText: string; newTimestamp: number }) => {
			if (payload.room === currentRoom) {
				setMessages(prev => prev.map(m => 
					m.id === payload.messageId 
						? { ...m, text: payload.newText, timestamp: payload.newTimestamp, edited: true }
						: m
				));
			}
		};
		
		const handleMessageDelete = (payload: { room: string; messageId: number }) => {
			if (payload.room === currentRoom) {
				setMessages(prev => prev.filter(m => m.id !== payload.messageId));
			}
		};

		socket.on('roomHistory', handleHistory);
		socket.on('chatMessage', handleMessage);
		socket.on('roomUsers', handleUsers);
		socket.on('typing', handleTyping);
		socket.on('stopTyping', handleStopTyping);
		socket.on('messageEdit', handleMessageEdit);
		socket.on('messageDelete', handleMessageDelete);

		return () => {
			socket.off('roomHistory', handleHistory);
			socket.off('chatMessage', handleMessage);
			socket.off('roomUsers', handleUsers);
			socket.off('typing', handleTyping);
			socket.off('stopTyping', handleStopTyping);
			socket.off('messageEdit', handleMessageEdit);
			socket.off('messageDelete', handleMessageDelete);
		};
	}, [socketConnected, currentRoom]);

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages]);

	// Join room when currentRoom changes
	useEffect(() => {
		if (socketRef.current && socketConnected) {
			console.log('Joining room:', currentRoom);
			socketRef.current.emit('joinRoom', { room: currentRoom });
		}
	}, [currentRoom, socketConnected]);

	function switchRoom(room: string) {
		if (room === currentRoom) return;
		console.log('Switching to room:', room);
		setMessages([]);
		setTypingUsers(new Set());
		setCurrentRoom(room);
		setEditingMessage(null);
	}

	function sendMessage() {
		const text = inputValue.trim();
		if (!text || !socketConnected || !socketRef.current) {
			console.log('Cannot send message:', { text: !!text, socketConnected, socket: !!socketRef.current });
			return;
		}
		
		console.log('Sending message:', text);
		socketRef.current.emit('chatMessage', { text });
		setInputValue('');
		setShowEmoji(false);
		setEditingMessage(null);
		// Emit stopTyping immediately after send
		socketRef.current.emit('stopTyping');
	}

	function startEdit(message: ChatMessage) {
		setEditingMessage({ id: message.id, text: message.text });
		setEditValue(message.text);
		setInputValue('');
	}

	function saveEdit() {
		if (!editingMessage || !editValue.trim() || !socketConnected || !socketRef.current) return;
		socketRef.current.emit('editMessage', { messageId: editingMessage.id, newText: editValue.trim() });
		setEditingMessage(null);
		setEditValue('');
	}

	function cancelEdit() {
		setEditingMessage(null);
		setEditValue('');
	}

	function deleteMessage(messageId: number) {
		if (!socketConnected || !socketRef.current) return;
		socketRef.current.emit('deleteMessage', { messageId });
	}

	function handleInputChange(v: string) {
		setInputValue(v);
		if (!socketConnected || !socketRef.current) return;
		socketRef.current.emit('typing');
		if (stopTypingTimeout.current) clearTimeout(stopTypingTimeout.current);
		stopTypingTimeout.current = setTimeout(() => {
			socketRef.current.emit('stopTyping');
		}, 1000);
	}

	function handleEmojiSelect(emoji: any) {
		const char = (emoji?.native || emoji?.shortcodes || '') as string;
		if (editingMessage) {
			setEditValue(prev => prev + char);
		} else {
			setInputValue(prev => prev + char);
		}
	}

	function toggleTheme() {
		setIsDarkMode(prev => !prev);
	}

	const typingText = useMemo(() => {
		const others = Array.from(typingUsers).filter(u => u !== username);
		if (others.length === 0) return '';
		if (others.length === 1) return `${others[0]} is typing...`;
		return `${others.slice(0, 2).join(', ')}${others.length > 2 ? ' and others' : ''} are typing...`;
	}, [typingUsers, username]);

	return (
		<div className={`min-h-screen flex transition-colors duration-200 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
			<aside className={`w-72 border-r transition-colors duration-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
				<div className="p-4">
					<div className="flex items-center justify-between mb-4">
						<div className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Rooms</div>
						<button
							id="theme-toggle"
							name="theme-toggle"
							onClick={toggleTheme}
							className={`p-2 rounded-lg transition-colors duration-200 ${
								isDarkMode 
									? 'bg-gray-700 text-yellow-400 hover:bg-gray-600' 
									: 'bg-gray-200 text-gray-600 hover:bg-gray-300'
							}`}
							aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
						>
							{isDarkMode ? '☀️' : '🌙'}
						</button>
					</div>
					<div className="space-y-1">
						{rooms.map(room => (
							<button
								key={room}
								id={`room-${room.toLowerCase()}`}
								name={`room-${room.toLowerCase()}`}
								onClick={() => switchRoom(room)}
								className={`w-full text-left px-3 py-2 rounded transition-colors duration-200 ${
									room === currentRoom 
										? (isDarkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-50 text-blue-700')
										: (isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-700')
								}`}
							>
								{room}
							</button>
						))}
					</div>
				</div>
				<div className="px-4">
					<div className={`text-lg font-semibold mt-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Online</div>
					<ul className="mt-2 space-y-1 overflow-auto pr-2">
						{onlineUsers.map(u => (
							<li key={u.socketId} className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{u.username}</li>
						))}
						{onlineUsers.length === 0 && <li className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No one here yet</li>}
					</ul>
					{!socketConnected && (
						<div className="text-xs text-orange-500 mt-2">Connecting...</div>
					)}
					{socketConnected && (
						<div className="text-xs text-green-500 mt-2">Connected</div>
					)}
				</div>
			</aside>

			<main className="flex-1 flex flex-col">
				<header className={`h-14 border-b transition-colors duration-200 ${
					isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
				}`}>
					<div className="flex items-center px-4 justify-between h-full">
						<div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Room: {currentRoom}</div>
						<div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Signed in as {username}</div>
					</div>
				</header>

				<section className="flex-1 overflow-y-auto p-4 space-y-3">
					{messages.length === 0 && (
						<div className={`text-center mt-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
							No messages yet. Start the conversation!
						</div>
					)}
					{messages.map((m, idx) => {
						const mine = m.username === username;
						return (
							<div key={m.id || idx} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
								<div className={`max-w-[75%] rounded-lg px-3 py-2 transition-colors duration-200 ${
									mine 
										? 'bg-blue-600 text-white' 
										: (isDarkMode ? 'bg-gray-700 border border-gray-600 text-gray-200' : 'bg-white border border-gray-200 text-gray-900')
								}`}>
									<div className={`text-xs opacity-80 mb-0.5 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
										{m.username} • {new Date(m.timestamp).toLocaleTimeString()}
										{m.edited && <span className="ml-2 text-xs opacity-60">(edited)</span>}
									</div>
									<div className="whitespace-pre-wrap break-words">{m.text}</div>
									{mine && (
										<div className="flex gap-2 mt-2">
											<button
												id={`edit-${m.id}`}
												name={`edit-${m.id}`}
												onClick={() => startEdit(m)}
												className="text-xs px-2 py-1 rounded bg-opacity-20 hover:bg-opacity-30 bg-white text-blue-600"
											>
												Edit
											</button>
											<button
												id={`delete-${m.id}`}
												name={`delete-${m.id}`}
												onClick={() => deleteMessage(m.id)}
												className="text-xs px-2 py-1 rounded bg-opacity-20 hover:bg-opacity-30 bg-red-500 text-white"
											>
												Delete
											</button>
										</div>
									)}
								</div>
							</div>
						);
					})}
					<div ref={messagesEndRef} />
				</section>

				{typingText && (
					<div className={`px-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{typingText}</div>
				)}

				<footer className={`border-t transition-colors duration-200 ${
					isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
				}`}>
					<div className="p-3">
						<div className="relative flex items-center gap-2">
							{editingMessage ? (
								<>
									<input
										id="edit-message"
										name="edit-message"
										type="text"
										value={editValue}
										onChange={(e) => setEditValue(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') saveEdit();
											if (e.key === 'Escape') cancelEdit();
										}}
										placeholder="Edit message..."
										className={`flex-1 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${
											isDarkMode 
												? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
										}`}
										required
									/>
									<button
										id="save-edit"
										name="save-edit"
										onClick={saveEdit}
										className="rounded-md bg-green-600 text-white px-4 py-2 font-medium hover:bg-green-700 transition-colors duration-200"
									>
										Save
									</button>
									<button
										id="cancel-edit"
										name="cancel-edit"
										onClick={cancelEdit}
										className={`rounded-md px-4 py-2 font-medium transition-colors duration-200 ${
											isDarkMode 
												? 'bg-gray-600 text-white hover:bg-gray-500' 
												: 'bg-gray-500 text-white hover:bg-gray-600'
										}`}
									>
										Cancel
									</button>
								</>
							) : (
								<>
									<button
										id="emoji-picker"
										name="emoji-picker"
										onClick={() => setShowEmoji(v => !v)}
										className={`px-2 py-1 rounded border transition-colors duration-200 ${
											isDarkMode 
												? 'border-gray-600 hover:bg-gray-700 text-gray-300' 
												: 'border-gray-300 hover:bg-gray-50 text-gray-600'
										}`}
										aria-label="Emoji picker"
									>
										😊
									</button>
									<input
										id="message-input"
										name="message-input"
										type="text"
										value={inputValue}
										onChange={(e) => handleInputChange(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') sendMessage();
										}}
										placeholder="Type a message"
										className={`flex-1 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${
											isDarkMode 
												? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
												: 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
										}`}
										required
									/>
									<button
										id="send-message"
										name="send-message"
										onClick={sendMessage}
										className="rounded-md bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 transition-colors duration-200"
									>
										Send
									</button>
								</>
							)}

							{showEmoji && (
								<div className="absolute bottom-12 left-0 z-10">
									<Picker 
										data={data as any} 
										onEmojiSelect={handleEmojiSelect} 
										theme={isDarkMode ? 'dark' : 'light'} 
										navPosition="top" 
										previewPosition="none" 
										perLine={8} 
									/>
								</div>
							)}
						</div>
					</div>
				</footer>
			</main>
		</div>
	);
}


