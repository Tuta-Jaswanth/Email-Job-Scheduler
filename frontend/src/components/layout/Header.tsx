import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { Plus, LogOut, Mail, Slack, ChevronDown } from 'lucide-react';
import { getSlackConnectUrl } from '../../lib/api';

interface HeaderProps {
  onComposeClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onComposeClick }) => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'U';
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          {/* Left: Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#008f45] to-[#00a651] flex items-center justify-center text-white shadow-md shadow-[#00a651]/20">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-gray-900">
                  Reach<span className="text-[#00a651]">Inbox</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] font-semibold tracking-wider uppercase bg-[#e7f7ee] text-[#008f45] px-2 py-0.5 rounded-full border border-[#00a651]/20">
                  Scheduler
                </span>
              </div>
              <p className="text-xs text-gray-400 hidden sm:block">Automated Email Dispatcher</p>
            </div>
          </div>

          {/* Right: Actions + User Info + Logout */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Primary "Compose New Email" Button */}
            <Button
              onClick={onComposeClick}
              variant="primary"
              size="md"
              leftIcon={<Plus className="w-4 h-4" />}
              className="shadow-sm font-semibold"
            >
              Compose New Email
            </Button>

            {/* User Profile + Logout in Top Header */}
            {user && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-2.5 p-1 sm:p-1.5 rounded-xl hover:bg-gray-100 transition-colors border border-transparent hover:border-gray-200 focus:outline-none"
                  aria-expanded={dropdownOpen}
                >
                  {/* Avatar */}
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name || 'User avatar'}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-emerald-500/30"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-[#008f45] font-semibold text-sm flex items-center justify-center ring-2 ring-emerald-500/20">
                      {getInitials(user.name, user.email)}
                    </div>
                  )}

                  {/* Name and Email */}
                  <div className="text-left hidden md:block max-w-[160px]">
                    <div className="text-sm font-semibold text-gray-900 truncate leading-tight">
                      {user.name}
                    </div>
                    <div className="text-xs text-gray-500 truncate leading-tight mt-0.5">
                      {user.email}
                    </div>
                  </div>

                  <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-72 rounded-xl bg-white shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                      {/* Mobile User Info View */}
                      <div className="px-4 py-2 border-b border-gray-100 md:hidden">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {user.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {user.email}
                        </div>
                      </div>

                      {/* Slack Notification Status */}
                      <div className="px-4 py-2 text-xs text-gray-500 flex items-center justify-between border-b border-gray-100">
                        <span className="flex items-center gap-1.5 font-medium text-gray-700">
                          <Slack className="w-3.5 h-3.5 text-purple-600" />
                          Slack Alerts
                        </span>
                        {user.slackAccessToken ? (
                          <span className="text-emerald-600 font-medium">Connected</span>
                        ) : (
                          <a
                            href={getSlackConnectUrl()}
                            className="text-[#00a651] hover:underline font-semibold"
                          >
                            Connect
                          </a>
                        )}
                      </div>

                      {/* Logout Action */}
                      <button
                        onClick={async () => {
                          setDropdownOpen(false);
                          await logout();
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors font-medium"
                      >
                        <LogOut className="w-4 h-4 text-rose-500" />
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
