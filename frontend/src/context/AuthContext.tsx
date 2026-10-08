import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { api } from '../lib/api';
import { useToast } from './ToastContext';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { error: toastError, success: toastSuccess } = useToast();

  const refreshUser = useCallback(async () => {
    try {
      const response = await api.get<User>('/api/me');
      setUser(response.data);
    } catch {
      // Unauthenticated (401) on initial app load is an expected state when user isn't logged in yet
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Process URL query parameters for OAuth results
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('authError');
    const slackStatus = params.get('slack');

    let shouldCleanUrl = false;

    if (authError) {
      shouldCleanUrl = true;
      const errorMessages: Record<string, string> = {
        invalid_oauth_state: 'Security verification failed: OAuth state mismatch. Please try logging in again.',
        google_email_not_verified: 'Your Google email is not verified. Please verify your email with Google.',
        google_login_failed: 'Google authentication failed or was cancelled.',
        missing_oauth_response: 'Incomplete OAuth response from Google.',
        access_denied: 'Access was denied by Google authentication.',
      };
      toastError('Login Failed', errorMessages[authError] || `Authentication error: ${authError}`);
    }

    if (slackStatus === 'connected') {
      shouldCleanUrl = true;
      toastSuccess('Slack Connected', 'Your Slack workspace has been linked for rate limit alerts.');
    } else if (slackStatus === 'error') {
      shouldCleanUrl = true;
      toastError('Slack Connection Failed', 'Could not link your Slack workspace. Please try again.');
    }

    if (shouldCleanUrl) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    refreshUser();
  }, [refreshUser, toastError, toastSuccess]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      window.location.href = '/';
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
