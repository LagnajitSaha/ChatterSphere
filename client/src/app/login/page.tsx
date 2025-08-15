'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [error, setError] = useState('');
	const [isDarkMode, setIsDarkMode] = useState(false);

	useEffect(() => {
		// Only check for existing username, don't auto-redirect
		const saved = typeof window !== 'undefined' ? localStorage.getItem('cs_username') : null;
		if (saved) {
			setUsername(saved);
		}

		// Load theme preference
		const savedTheme = localStorage.getItem('cs_theme');
		if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
			setIsDarkMode(true);
		}
	}, []);

	// Apply theme to body
	useEffect(() => {
		if (typeof window !== 'undefined') {
			document.body.classList.toggle('dark', isDarkMode);
		}
	}, [isDarkMode]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = username.trim();
		if (!trimmed) {
			setError('Please enter a username');
			return;
		}
		localStorage.setItem('cs_username', trimmed);
		router.push('/chat');
	}

	function toggleTheme() {
		setIsDarkMode(prev => !prev);
	}

	return (
		<div className={`min-h-screen flex items-center justify-center transition-colors duration-200 ${
			isDarkMode ? 'bg-gray-900' : 'bg-gray-100'
		}`}>
			<div className={`w-full max-w-md rounded-xl shadow p-6 transition-colors duration-200 ${
				isDarkMode ? 'bg-gray-800' : 'bg-white'
			}`}>
				<div className="flex items-center justify-between mb-4">
					<h1 className={`text-2xl font-semibold text-center ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
						Welcome to ChatterSphere
					</h1>
					<button
						id="theme-toggle-login"
						name="theme-toggle-login"
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
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label htmlFor="username" className={`block text-sm font-medium ${
							isDarkMode ? 'text-gray-300' : 'text-gray-700'
						}`}>
							Username
						</label>
						<input
							id="username"
							name="username"
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="Enter a username"
							className={`mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${
								isDarkMode 
									? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
									: 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
							}`}
							required
						/>
						{error && <p className="mt-1 text-sm text-red-500">{error}</p>}
					</div>
					<button 
						type="submit" 
						className="w-full rounded-md bg-blue-600 text-white py-2 font-medium hover:bg-blue-700 transition-colors duration-200"
					>
						Continue
					</button>
				</form>
			</div>
		</div>
	);
}


