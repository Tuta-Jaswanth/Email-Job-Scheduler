import axios from 'axios';

// Detect base URL dynamically: Vercel env var -> window hostname -> production Render fallback
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : 'https://reachinbox-hiring.onrender.com');

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Bearer token from localStorage for seamless cross-domain authentication
api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('reachinbox_token') : null;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If 401 Unauthorized, remove stale token from storage
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('reachinbox_token');
    }
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export const getGoogleLoginUrl = (): string => `${API_BASE_URL}/auth/google`;
export const getSlackConnectUrl = (): string => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('reachinbox_token') : null;
  return token
    ? `${API_BASE_URL}/api/slack/connect?token=${encodeURIComponent(token)}`
    : `${API_BASE_URL}/api/slack/connect`;
};

