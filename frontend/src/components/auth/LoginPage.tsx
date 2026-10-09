import React, { useState } from 'react';
import { getGoogleLoginUrl } from '../../lib/api';
import { ThemeToggle } from '../common/ThemeToggle';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const googleLoginUrl = getGoogleLoginUrl();

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Direct user to Google OAuth per assignment requirements
    window.location.href = googleLoginUrl;
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0b0f12] text-gray-900 dark:text-gray-100 p-4 transition-colors relative">
      {/* Theme Toggle at the top-right corner */}
      <div className="fixed top-5 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* Outer Card Container */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-2xl p-10 sm:p-12 shadow-sm bg-white dark:bg-[#13181d] transition-colors">
        {/* Form Container (Fixed 380px, Vertical flow, 28px Gap) */}
        <div className="w-[380px] flex flex-col gap-[28px]">
          {/* Title */}
          <h1 className="text-[36px] font-bold text-center text-[#111827] dark:text-white leading-none tracking-tight">
            Login
          </h1>

          {/* Login with Google Button */}
          <a
            href={googleLoginUrl}
            id="google-login-button"
            className="h-[46px] bg-[#e7f7ee] hover:bg-[#dcf4e7] active:bg-[#d0eedd] rounded-lg flex items-center justify-center gap-2.5 text-sm font-medium text-gray-800 transition-colors duration-150 select-none shadow-2xs"
          >
            {/* Google 4-Color SVG Icon */}
            <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.94 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Login with Google</span>
          </a>

          {/* Divider Text */}
          <div className="text-center text-xs text-gray-400 font-normal select-none -my-1">
            or sign up through email
          </div>

          {/* Form */}
          <form onSubmit={handleEmailLogin} className="flex flex-col gap-[20px]">
            {/* Email ID Input */}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email ID"
              className="h-[46px] w-full px-4 rounded-lg bg-[#f3f4f6] dark:bg-[#1a2128] text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 border border-transparent dark:border-gray-700/60 focus:border-gray-300 dark:focus:border-gray-600 focus:bg-white dark:focus:bg-[#1f2730] focus:outline-none transition-all"
            />

            {/* Password Input */}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="h-[46px] w-full px-4 rounded-lg bg-[#f3f4f6] dark:bg-[#1a2128] text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 border border-transparent dark:border-gray-700/60 focus:border-gray-300 dark:focus:border-gray-600 focus:bg-white dark:focus:bg-[#1f2730] focus:outline-none transition-all"
            />

            {/* Primary Login Button */}
            <button
              type="submit"
              className="h-[46px] w-full bg-[#00a651] hover:bg-[#009247] active:bg-[#007f3d] text-white font-medium text-sm rounded-lg transition-colors duration-150 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#00a651]/40"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    </main>
  );
};
