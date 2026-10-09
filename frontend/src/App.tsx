import React from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { ThemeProvider } from './context/ThemeContext';
import { Mail } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8faf9] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#e7f7ee] text-[#00a651] flex items-center justify-center shadow-sm animate-pulse">
            <Mail className="w-6 h-6" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00a651] animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 rounded-full bg-[#00a651] animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 rounded-full bg-[#00a651] animate-bounce" />
          </div>
          <p className="text-xs font-medium text-gray-400 tracking-wide uppercase">
            Loading ReachInbox...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <Dashboard />;
};

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
