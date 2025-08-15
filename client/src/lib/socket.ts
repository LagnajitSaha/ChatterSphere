'use client';

import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;
let lastRegisteredUsername: string | null = null;

export function getSocket(username: string): Socket {
	if (!socketInstance) {
		console.log('Creating new socket instance');
		socketInstance = io('http://localhost:4000', {
			transports: ['websocket', 'polling'],
			reconnection: true,
			reconnectionAttempts: Infinity,
			reconnectionDelay: 500,
			timeout: 20000
		});

		// Register on initial connect
		socketInstance.on('connect', () => {
			console.log('Socket connected, registering user:', lastRegisteredUsername);
			if (lastRegisteredUsername) {
				socketInstance?.emit('registerUser', { username: lastRegisteredUsername });
			}
		});

		socketInstance.on('connect_error', (error) => {
			console.error('Socket connection error:', error);
		});

		socketInstance.on('disconnect', (reason) => {
			console.log('Socket disconnected:', reason);
		});
	}

	// Update username registration
	lastRegisteredUsername = username;
	if (socketInstance.connected) {
		console.log('Socket already connected, registering user immediately:', username);
		socketInstance.emit('registerUser', { username });
	} else {
		console.log('Socket not connected, will register user on connect:', username);
		socketInstance.once('connect', () => {
			console.log('Socket connected, registering user:', username);
			socketInstance?.emit('registerUser', { username });
		});
	}

	return socketInstance;
}

export function disconnectSocket(): void {
	if (socketInstance) {
		console.log('Disconnecting socket');
		socketInstance.removeAllListeners();
		socketInstance.disconnect();
		socketInstance = null;
		lastRegisteredUsername = null;
	}
}


