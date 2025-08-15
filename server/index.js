const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: ['http://localhost:3000'],
		methods: ['GET', 'POST']
	}
});

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// In-memory data store
const rooms = ['General', 'Sports', 'Tech'];
/** @type {Record<string, Array<{ id: number; username: string; text: string; timestamp: number; edited?: boolean }>>} */
const messagesByRoom = { General: [], Sports: [], Tech: [] };
/** @type {Array<{ socketId: string; username: string; room?: string }>} */
let onlineUsers = [];
let nextMessageId = 1;

// REST endpoints
app.get('/rooms', (req, res) => {
	res.json({ rooms });
});

app.get('/users', (req, res) => {
	const { room } = req.query;
	if (room) {
		return res.json({ users: onlineUsers.filter(u => u.room === room) });
	}
	res.json({ users: onlineUsers });
});

// Socket.IO handling
io.on('connection', (socket) => {
	let registeredUser = null;

	socket.on('registerUser', ({ username }) => {
		if (!username || typeof username !== 'string') return;
		registeredUser = { socketId: socket.id, username };
		
		// Remove any existing user with same socket ID
		onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
		
		// Add new user
		onlineUsers.push({ socketId: socket.id, username });
		
		console.log(`User registered: ${username} (${socket.id})`);
	});

	socket.on('joinRoom', ({ room }) => {
		if (!registeredUser) {
			console.log('No registered user for joinRoom');
			return;
		}
		if (!rooms.includes(room)) {
			console.log(`Invalid room: ${room}`);
			return;
		}

		console.log(`${registeredUser.username} joining room: ${room}`);

		// Leave previous room
		const previous = onlineUsers.find(u => u.socketId === socket.id)?.room;
		if (previous) {
			socket.leave(previous);
			// Notify previous room about updated users list after leaving
			const prevUsers = onlineUsers
				.filter(u => u.socketId !== socket.id)
				.filter(u => u.room === previous);
			io.to(previous).emit('roomUsers', { room: previous, users: prevUsers });
		}

		socket.join(room);
		
		// Update user record with room
		onlineUsers = onlineUsers.map(u =>
			u.socketId === socket.id ? { ...u, room } : u
		);

		// Send last 20 messages to this user only
		const history = (messagesByRoom[room] || []).slice(-20);
		socket.emit('roomHistory', { room, messages: history });

		// Get all users in this room and notify everyone
		const usersInRoom = onlineUsers.filter(u => u.room === room);
		io.to(room).emit('roomUsers', { room, users: usersInRoom });
		
		console.log(`Room ${room} now has ${usersInRoom.length} users`);
	});

	socket.on('chatMessage', ({ text }) => {
		if (!registeredUser || !text) {
			console.log('Invalid chat message:', { registeredUser: !!registeredUser, text: !!text });
			return;
		}
		
		const user = onlineUsers.find(u => u.socketId === socket.id);
		if (!user || !user.room) {
			console.log('User not in room for chat message');
			return;
		}
		
		const message = {
			id: nextMessageId++,
			username: registeredUser.username,
			text: String(text).slice(0, 2000),
			timestamp: Date.now()
		};
		
		// Ensure room messages array exists
		if (!messagesByRoom[user.room]) {
			messagesByRoom[user.room] = [];
		}
		
		// Add message to room
		messagesByRoom[user.room].push(message);
		
		// Broadcast to all users in the room (including sender)
		io.to(user.room).emit('chatMessage', { room: user.room, message });
		
		console.log(`Message sent in ${user.room}: ${registeredUser.username}: ${text}`);
	});

	socket.on('editMessage', ({ messageId, newText }) => {
		if (!registeredUser || !newText) return;
		const user = onlineUsers.find(u => u.socketId === socket.id);
		if (!user || !user.room) return;

		const roomMessages = messagesByRoom[user.room] || [];
		const messageIndex = roomMessages.findIndex(m => m.id === messageId);
		
		if (messageIndex === -1) return;
		const message = roomMessages[messageIndex];
		
		// Only allow editing own messages
		if (message.username !== registeredUser.username) return;

		// Update message
		roomMessages[messageIndex] = {
			...message,
			text: String(newText).slice(0, 2000),
			timestamp: Date.now(),
			edited: true
		};

		// Broadcast edit to all users in room
		io.to(user.room).emit('messageEdit', {
			room: user.room,
			messageId,
			newText: String(newText).slice(0, 2000),
			newTimestamp: Date.now()
		});
	});

	socket.on('deleteMessage', ({ messageId }) => {
		if (!registeredUser) return;
		const user = onlineUsers.find(u => u.socketId === socket.id);
		if (!user || !user.room) return;

		const roomMessages = messagesByRoom[user.room] || [];
		const messageIndex = roomMessages.findIndex(m => m.id === messageId);
		
		if (messageIndex === -1) return;
		const message = roomMessages[messageIndex];
		
		// Only allow deleting own messages
		if (message.username !== registeredUser.username) return;

		// Remove message
		roomMessages.splice(messageIndex, 1);

		// Broadcast deletion to all users in room
		io.to(user.room).emit('messageDelete', {
			room: user.room,
			messageId
		});
	});

	socket.on('typing', () => {
		const user = onlineUsers.find(u => u.socketId === socket.id);
		if (!user?.room) return;
		socket.to(user.room).emit('typing', { username: user.username });
	});

	socket.on('stopTyping', () => {
		const user = onlineUsers.find(u => u.socketId === socket.id);
		if (!user?.room) return;
		socket.to(user.room).emit('stopTyping', { username: user.username });
	});

	socket.on('disconnect', () => {
		const user = onlineUsers.find(u => u.socketId === socket.id);
		if (user) {
			console.log(`User disconnected: ${user.username} (${socket.id})`);
			onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
			
			if (user.room) {
				const usersInRoom = onlineUsers.filter(u => u.room === user.room);
				io.to(user.room).emit('roomUsers', { room: user.room, users: usersInRoom });
			}
		}
	});
	
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
	console.log(`Server listening on http://localhost:${PORT}`);
	console.log(`Available rooms: ${rooms.join(', ')}`);
});


