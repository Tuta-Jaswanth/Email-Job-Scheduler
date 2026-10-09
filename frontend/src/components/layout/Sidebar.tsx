import React, { useState } from 'react';
import { User, TabType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Clock3, Send, Plus, LogOut, Slack, ChevronDown, Mail, Inbox } from 'lucide-react';
import { getSlackConnectUrl } from '../../lib/api';

interface SidebarProps {
  user: User | null;
  tab: TabType;
  onTabChange: (tab: TabType) => void;
  onComposeClick: () => void;
  inboxCount?: number;
  unreadInboxCount?: number;
  scheduledCount?: number;
  sentCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  tab,
  onTabChange,
  onComposeClick,
  inboxCount = 0,
  unreadInboxCount = 0,
  scheduledCount = 0,
  sentCount = 0,
}) => {
  const { logout } = useAuth();
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
    <aside className="w-[260px] shrink-0 border-r border-gray-200 min-h-screen px-4 py-6 bg-white flex flex-col select-none">
      {/* Brand: E-MAIL with Logo */}
      <div className="flex items-center gap-2.5 mb-6 px-1">
        <div className="w-8 h-8 rounded-xl bg-[#00a651] text-white flex items-center justify-center shadow-xs shadow-[#00a651]/20 shrink-0">
          <Mail className="w-4.5 h-4.5" />
        </div>
        <span className="text-2xl font-black tracking-tight text-gray-900">
          E-MAIL
        </span>
      </div>

      {/* User Card */}
      <div className="relative mb-5">
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="w-full flex items-center gap-3 rounded-xl bg-[#f6f8f7] hover:bg-gray-100/90 p-2.5 text-left transition-colors border border-transparent hover:border-gray-200"
        >
          {user?.avatar ? (
            <img
              className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-gray-200"
              src={user.avatar}
              alt={user.name || 'User'}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-emerald-100 text-[#008f45] font-semibold text-xs flex items-center justify-center shrink-0">
              {getInitials(user?.name, user?.email)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-gray-900 truncate leading-tight">
              {user?.name || 'User'}
            </div>
            <div className="text-xs text-gray-400 truncate leading-tight mt-0.5">
              {user?.email || ''}
            </div>
          </div>

          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute left-0 right-0 mt-1.5 rounded-xl bg-white shadow-lg border border-gray-100 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100 text-xs">
              <div className="px-3 py-1.5 text-gray-400 font-semibold uppercase tracking-wider text-[10px]">
                Account Settings
              </div>
              <a
                href={getSlackConnectUrl()}
                className="w-full px-3 py-2 text-gray-700 hover:bg-gray-50 flex items-center gap-2 font-medium"
              >
                <Slack className="w-3.5 h-3.5 text-purple-600" />
                {user?.slackAccessToken ? 'Slack: Connected' : 'Connect Slack'}
              </a>
              <button
                onClick={async () => {
                  setDropdownOpen(false);
                  await logout();
                }}
                className="w-full px-3 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          </>
        )}
      </div>

      {/* Primary Compose Button (Figma rounded outline with green border) */}
      <button
        onClick={onComposeClick}
        className="w-full h-11 rounded-full border border-[#00a651] text-[#00a651] hover:bg-[#00a651] hover:text-white font-medium text-sm flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] shadow-2xs mb-7"
      >
        <Plus className="w-4 h-4" />
        <span>Compose</span>
      </button>

      {/* CORE Section Header */}
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-2.5">
        CORE
      </div>

      {/* Tabs */}
      <div className="space-y-1">
        {/* Inbox Tab (Received Emails) */}
        <button
          onClick={() => onTabChange('inbox')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between text-sm transition-colors ${
            tab === 'inbox'
              ? 'bg-[#e8f7ef] text-gray-900 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 font-normal'
          }`}
        >
          <div className="flex items-center gap-3">
            <Inbox
              className={`w-4 h-4 ${
                tab === 'inbox' ? 'text-[#008f45]' : 'text-gray-400'
              }`}
            />
            <span>Inbox</span>
          </div>
          <div className="flex items-center gap-1.5">
            {unreadInboxCount > 0 ? (
              <span className="bg-[#00a651] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-2xs">
                {unreadInboxCount}
              </span>
            ) : (
              <span
                className={`text-xs ${
                  tab === 'inbox'
                    ? 'font-bold text-[#008f45]'
                    : 'text-gray-400 font-normal'
                }`}
              >
                {inboxCount}
              </span>
            )}
          </div>
        </button>

        {/* Scheduled Tab */}
        <button
          onClick={() => onTabChange('scheduled')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between text-sm transition-colors ${
            tab === 'scheduled'
              ? 'bg-[#e8f7ef] text-gray-900 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 font-normal'
          }`}
        >
          <div className="flex items-center gap-3">
            <Clock3
              className={`w-4 h-4 ${
                tab === 'scheduled' ? 'text-[#008f45]' : 'text-gray-400'
              }`}
            />
            <span>Scheduled</span>
          </div>
          <span
            className={`text-xs ${
              tab === 'scheduled'
                ? 'font-bold text-[#008f45]'
                : 'text-gray-400 font-normal'
            }`}
          >
            {scheduledCount}
          </span>
        </button>

        {/* Sent Tab */}
        <button
          onClick={() => onTabChange('sent')}
          className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between text-sm transition-colors ${
            tab === 'sent'
              ? 'bg-[#e8f7ef] text-gray-900 font-semibold'
              : 'text-gray-600 hover:bg-gray-50 font-normal'
          }`}
        >
          <div className="flex items-center gap-3">
            <Send
              className={`w-4 h-4 ${
                tab === 'sent' ? 'text-[#008f45]' : 'text-gray-400'
              }`}
            />
            <span>Sent</span>
          </div>
          <span
            className={`text-xs ${
              tab === 'sent'
                ? 'font-bold text-[#008f45]'
                : 'text-gray-400 font-normal'
            }`}
          >
            {sentCount}
          </span>
        </button>
      </div>

      {/* Bottom Actions */}
      <div className="mt-auto pt-6 border-t border-gray-100 space-y-1">
        <a
          href={getSlackConnectUrl()}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Slack className="w-4 h-4 text-purple-600" />
          <span className="flex items-center gap-1.5">
            {user?.slackAccessToken ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Slack Connected</span>
              </>
            ) : (
              <span>Connect Slack</span>
            )}
          </span>
        </a>

        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 hover:text-rose-600 hover:bg-rose-50/70 transition-colors text-left"
        >
          <LogOut className="w-4 h-4 text-gray-400 hover:text-rose-500" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
