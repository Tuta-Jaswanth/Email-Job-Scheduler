import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { EmailTable } from '../components/dashboard/EmailTable';
import { Compose } from '../components/compose/Compose';
import { Detail } from '../components/detail/Detail';
import { api } from '../lib/api';
import { Email, TabType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Search, Filter, RefreshCw } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('scheduled');
  const [emails, setEmails] = useState<Email[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // View mode: 'list' | 'compose' | 'detail'
  const [currentView, setCurrentView] = useState<'list' | 'compose' | 'detail'>('list');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  // Search query
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Counts
  const [scheduledCount, setScheduledCount] = useState<number>(0);
  const [sentCount, setSentCount] = useState<number>(0);

  // Fetch emails for active tab
  const fetchEmails = useCallback(
    async (showRefreshingSpinner = false) => {
      if (showRefreshingSpinner) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const response = await api.get<{ total: number; emails: Email[] }>(`/api/emails?status=${activeTab}`);
        const data = response.data;
        // Support both paginated { total, emails } and legacy flat array
        const list = Array.isArray(data) ? data : (data.emails ?? []);
        setEmails(list);

        if (activeTab === 'scheduled') {
          setScheduledCount(Array.isArray(data) ? list.length : (data.total ?? list.length));
        } else {
          setSentCount(Array.isArray(data) ? list.length : (data.total ?? list.length));
        }
      } catch (err: any) {
        console.error('Failed to load emails:', err);
        toastError('Failed to Load Emails', err.message || 'Unable to retrieve emails.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeTab, toastError]
  );

  // Fetch counts for both tabs
  const fetchCounts = useCallback(async () => {
    try {
      const [schedRes, sentRes] = await Promise.allSettled([
        api.get<any>('/api/emails?status=scheduled'),
        api.get<any>('/api/emails?status=sent'),
      ]);
      if (schedRes.status === 'fulfilled') {
        const d = schedRes.value.data;
        setScheduledCount(Array.isArray(d) ? d.length : (d.total ?? d.emails?.length ?? 0));
      }
      if (sentRes.status === 'fulfilled') {
        const d = sentRes.value.data;
        setSentCount(Array.isArray(d) ? d.length : (d.total ?? d.emails?.length ?? 0));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Handle Toggle Favourite / Star
  const handleToggleStar = useCallback(
    async (targetEmail: Email) => {
      const nextStarred = !targetEmail.isStarred;

      // Optimistically update list state
      setEmails((prev) =>
        prev.map((e) => (e.id === targetEmail.id ? { ...e, isStarred: nextStarred } : e))
      );

      // If viewing detail of this email, update selectedEmail
      if (selectedEmail && selectedEmail.id === targetEmail.id) {
        setSelectedEmail((prev) => (prev ? { ...prev, isStarred: nextStarred } : null));
      }

      try {
        const res = await api.patch<Email>(`/api/emails/${targetEmail.id}/star`);
        setEmails((prev) =>
          prev.map((e) => (e.id === targetEmail.id ? res.data : e))
        );
        toastSuccess(
          res.data.isStarred ? 'Added to Starred' : 'Removed from Starred',
          res.data.isStarred ? 'Email marked as starred.' : 'Email unstarred.'
        );
      } catch (err: any) {
        // Rollback
        setEmails((prev) =>
          prev.map((e) => (e.id === targetEmail.id ? { ...e, isStarred: !nextStarred } : e))
        );
        toastError('Failed to Star', err.message || 'Could not update star status.');
      }
    },
    [selectedEmail, toastError, toastSuccess]
  );

  // Handle Delete Email
  const handleDeleteEmail = useCallback(
    async (targetEmail: Email) => {
      if (!window.confirm(`Delete email to "${targetEmail.recipient}"?`)) return;

      // Optimistic removal
      setEmails((prev) => prev.filter((e) => e.id !== targetEmail.id));

      if (activeTab === 'scheduled') {
        setScheduledCount((c) => Math.max(0, c - 1));
      } else {
        setSentCount((c) => Math.max(0, c - 1));
      }

      try {
        await api.delete(`/api/emails/${targetEmail.id}`);
        toastSuccess('Email Deleted', 'The email was permanently deleted.');
        fetchCounts();
      } catch (err: any) {
        toastError('Delete Failed', err.message || 'Could not delete email.');
        fetchEmails();
        fetchCounts();
      }
    },
    [activeTab, fetchCounts, fetchEmails, toastError, toastSuccess]
  );

  const filteredEmails = useMemo(() => {
    if (!searchQuery.trim()) return emails;
    const q = searchQuery.toLowerCase().trim();
    return emails.filter(
      (e) =>
        e.recipient.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        (e.bodyHtml && e.bodyHtml.toLowerCase().includes(q))
    );
  }, [emails, searchQuery]);

  return (
    <div className="flex min-h-screen bg-white">
      {/* Figma Sidebar (Left) */}
      <Sidebar
        user={user}
        tab={activeTab}
        onTabChange={(nextTab) => {
          setActiveTab(nextTab);
          setCurrentView('list');
          setSelectedEmail(null);
          setSearchQuery('');
        }}
        onComposeClick={() => {
          setCurrentView('compose');
        }}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
      />

      {/* Main Content Area */}
      {currentView === 'compose' ? (
        <Compose
          onBack={() => setCurrentView('list')}
          onSuccess={() => {
            setActiveTab('scheduled');
            fetchEmails(true);
            fetchCounts();
          }}
        />
      ) : currentView === 'detail' && selectedEmail ? (
        <Detail
          email={selectedEmail}
          user={user}
          onBack={() => {
            setCurrentView('list');
            setSelectedEmail(null);
          }}
          onCancelled={() => {
            fetchEmails(true);
            fetchCounts();
          }}
          onDeleted={() => {
            fetchEmails(true);
            fetchCounts();
          }}
          onToggleStar={handleToggleStar}
        />
      ) : (
        /* Main Email List View (Screenshots 2 and 3) */
        <section className="flex-1 p-7 overflow-y-auto">
          {/* Top Search, Filter & Refresh Bar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-[#f6f8f7] rounded-full px-4.5 py-2 flex items-center flex-1 max-w-2xl">
              <Search size={16} className="text-gray-400 shrink-0 mr-2.5" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400 w-full"
                placeholder="Search"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-gray-400 hover:text-gray-600 ml-2"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 p-1.5 transition-colors"
              title="Filter"
            >
              <Filter size={18} />
            </button>

            <button
              type="button"
              onClick={() => {
                fetchEmails(true);
                fetchCounts();
              }}
              disabled={isLoading || isRefreshing}
              className="text-gray-400 hover:text-gray-600 p-1.5 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                size={17}
                className={isRefreshing ? 'animate-spin text-[#00a651]' : ''}
              />
            </button>
          </div>

          {/* Email List Table */}
          <EmailTable
            emails={filteredEmails}
            tab={activeTab}
            isLoading={isLoading}
            onSelectEmail={(email) => {
              setSelectedEmail(email);
              setCurrentView('detail');
            }}
            onComposeClick={() => setCurrentView('compose')}
            onToggleStar={handleToggleStar}
            onDeleteEmail={handleDeleteEmail}
            isFiltered={Boolean(searchQuery)}
            onClearFilter={() => setSearchQuery('')}
          />
        </section>
      )}
    </div>
  );
};
