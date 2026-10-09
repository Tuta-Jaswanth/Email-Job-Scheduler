import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { EmailTable } from '../components/dashboard/EmailTable';
import { InboxTable } from '../components/dashboard/InboxTable';
import { Compose } from '../components/compose/Compose';
import { Detail } from '../components/detail/Detail';
import { ReceivedDetail } from '../components/detail/ReceivedDetail';
import { api } from '../lib/api';
import { Email, ReceivedEmail, TabType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Search, Filter, RefreshCw, Sparkles, Check, ChevronDown } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('inbox');
  const [emails, setEmails] = useState<Email[]>([]);
  const [receivedEmails, setReceivedEmails] = useState<ReceivedEmail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // View mode: 'list' | 'compose' | 'detail'
  const [currentView, setCurrentView] = useState<'list' | 'compose' | 'detail'>('list');
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [selectedReceivedEmail, setSelectedReceivedEmail] = useState<ReceivedEmail | null>(null);

  // Reply draft config
  const [replyConfig, setReplyConfig] = useState<{
    recipients: string[];
    subject: string;
    body: string;
  } | null>(null);

  // Search query & Inbox filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'starred'>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState<boolean>(false);

  // Counts
  const [inboxCount, setInboxCount] = useState<number>(0);
  const [unreadInboxCount, setUnreadInboxCount] = useState<number>(0);
  const [scheduledCount, setScheduledCount] = useState<number>(0);
  const [sentCount, setSentCount] = useState<number>(0);

  // Fetch emails for active tab
  const fetchEmails = useCallback(
    async (showRefreshingSpinner = false) => {
      if (showRefreshingSpinner) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        if (activeTab === 'inbox') {
          const res = await api.get<{
            total: number;
            unreadCount: number;
            emails: ReceivedEmail[];
          }>('/api/inbox', {
            params: {
              filter: inboxFilter,
              search: searchQuery.trim() || undefined,
            },
          });
          const data = res.data;
          setReceivedEmails(data.emails ?? []);
          setInboxCount(data.total ?? 0);
          setUnreadInboxCount(data.unreadCount ?? 0);
        } else {
          const response = await api.get<{ total: number; emails: Email[] }>(
            `/api/emails?status=${activeTab}`
          );
          const data = response.data;
          const list = Array.isArray(data) ? data : (data.emails ?? []);
          setEmails(list);

          if (activeTab === 'scheduled') {
            setScheduledCount(Array.isArray(data) ? list.length : (data.total ?? list.length));
          } else {
            setSentCount(Array.isArray(data) ? list.length : (data.total ?? list.length));
          }
        }
      } catch (err: any) {
        console.error('Failed to load emails:', err);
        toastError('Failed to Load Emails', err.message || 'Unable to retrieve emails.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeTab, inboxFilter, searchQuery, toastError]
  );

  // Fetch overall counts
  const fetchCounts = useCallback(async () => {
    try {
      const [inboxRes, schedRes, sentRes] = await Promise.allSettled([
        api.get<{ total: number; unreadCount: number }>('/api/inbox/counts'),
        api.get<any>('/api/emails?status=scheduled'),
        api.get<any>('/api/emails?status=sent'),
      ]);

      if (inboxRes.status === 'fulfilled') {
        setInboxCount(inboxRes.value.data.total ?? 0);
        setUnreadInboxCount(inboxRes.value.data.unreadCount ?? 0);
      }
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

  // ── Outbound Email Handlers (Scheduled / Sent) ─────────────────────────────

  const handleToggleStar = useCallback(
    async (targetEmail: Email) => {
      const nextStarred = !targetEmail.isStarred;

      setEmails((prev) =>
        prev.map((e) => (e.id === targetEmail.id ? { ...e, isStarred: nextStarred } : e))
      );

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
        setEmails((prev) =>
          prev.map((e) => (e.id === targetEmail.id ? { ...e, isStarred: !nextStarred } : e))
        );
        toastError('Failed to Star', err.message || 'Could not update star status.');
      }
    },
    [selectedEmail, toastError, toastSuccess]
  );

  const handleDeleteEmail = useCallback(
    async (targetEmail: Email) => {
      if (!window.confirm(`Delete email to "${targetEmail.recipient}"?`)) return;

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

  // ── Inbound / Received Email Handlers (Inbox) ──────────────────────────────

  const handleSelectReceived = useCallback((email: ReceivedEmail) => {
    setSelectedReceivedEmail(email);
    setCurrentView('detail');

    // Optimistically mark as read in list & unread count
    if (!email.isRead) {
      setReceivedEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, isRead: true } : e))
      );
      setUnreadInboxCount((c) => Math.max(0, c - 1));
      api.patch(`/api/inbox/${email.id}/read`, { isRead: true }).catch(() => {});
    }
  }, []);

  const handleToggleReceivedStar = useCallback(
    async (email: ReceivedEmail) => {
      const nextStarred = !email.isStarred;
      setReceivedEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, isStarred: nextStarred } : e))
      );
      if (selectedReceivedEmail && selectedReceivedEmail.id === email.id) {
        setSelectedReceivedEmail((prev) =>
          prev ? { ...prev, isStarred: nextStarred } : null
        );
      }

      try {
        const res = await api.patch<ReceivedEmail>(`/api/inbox/${email.id}/star`);
        setReceivedEmails((prev) =>
          prev.map((e) => (e.id === email.id ? res.data : e))
        );
        toastSuccess(
          res.data.isStarred ? 'Added to Starred' : 'Removed from Starred',
          res.data.isStarred ? 'Email marked as starred.' : 'Email unstarred.'
        );
      } catch (err: any) {
        setReceivedEmails((prev) =>
          prev.map((e) => (e.id === email.id ? { ...e, isStarred: !nextStarred } : e))
        );
        toastError('Failed to Star', err.message || 'Could not update star status.');
      }
    },
    [selectedReceivedEmail, toastError, toastSuccess]
  );

  const handleToggleReceivedRead = useCallback(
    async (email: ReceivedEmail) => {
      const nextRead = !email.isRead;
      setReceivedEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, isRead: nextRead } : e))
      );
      setUnreadInboxCount((c) => (nextRead ? Math.max(0, c - 1) : c + 1));

      if (selectedReceivedEmail && selectedReceivedEmail.id === email.id) {
        setSelectedReceivedEmail((prev) => (prev ? { ...prev, isRead: nextRead } : null));
      }

      try {
        const res = await api.patch<ReceivedEmail>(`/api/inbox/${email.id}/read`, {
          isRead: nextRead,
        });
        setReceivedEmails((prev) =>
          prev.map((e) => (e.id === email.id ? res.data : e))
        );
        toastSuccess(
          nextRead ? 'Marked as Read' : 'Marked as Unread',
          nextRead ? 'Email marked as read.' : 'Email marked as unread.'
        );
      } catch (err: any) {
        setReceivedEmails((prev) =>
          prev.map((e) => (e.id === email.id ? { ...e, isRead: !nextRead } : e))
        );
        toastError('Update Failed', err.message || 'Could not update read status.');
      }
    },
    [selectedReceivedEmail, toastError, toastSuccess]
  );

  const handleDeleteReceived = useCallback(
    async (email: ReceivedEmail) => {
      if (!window.confirm(`Delete received email from "${email.from}"?`)) return;

      setReceivedEmails((prev) => prev.filter((e) => e.id !== email.id));
      setInboxCount((c) => Math.max(0, c - 1));
      if (!email.isRead) {
        setUnreadInboxCount((c) => Math.max(0, c - 1));
      }

      try {
        await api.delete(`/api/inbox/${email.id}`);
        toastSuccess('Email Deleted', 'The received email was removed.');
        fetchCounts();
      } catch (err: any) {
        toastError('Delete Failed', err.message || 'Could not delete email.');
        fetchEmails();
        fetchCounts();
      }
    },
    [fetchCounts, fetchEmails, toastError, toastSuccess]
  );

  const handleSimulateInbound = useCallback(async () => {
    setIsSimulating(true);
    try {
      const res = await api.post<{ ok: boolean; message: string; email: ReceivedEmail }>(
        '/api/inbox/simulate'
      );
      toastSuccess('New Email Received!', res.data.message || 'Incoming email added to Inbox.');
      fetchEmails(true);
      fetchCounts();
    } catch (err: any) {
      toastError('Simulation Failed', err.message || 'Could not simulate incoming email.');
    } finally {
      setIsSimulating(false);
    }
  }, [fetchCounts, fetchEmails, toastError, toastSuccess]);

  const handleReplyReceived = useCallback((email: ReceivedEmail) => {
    const cleanSubject = email.subject.toLowerCase().startsWith('re:')
      ? email.subject
      : `Re: ${email.subject}`;

    const quotedContent = `<br/><br/><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;"/><p style="color:#64748b;font-size:12px;"><strong>On ${new Date(
      email.receivedAt
    ).toLocaleString()}, ${email.from} wrote:</strong></p><blockquote style="border-left:3px solid #00a651;padding-left:12px;margin-left:0;color:#475569;">${
      email.bodyHtml || email.bodyText || ''
    }</blockquote>`;

    setReplyConfig({
      recipients: [email.fromEmail],
      subject: cleanSubject,
      body: quotedContent,
    });
    setCurrentView('compose');
  }, []);

  // Filtered lists
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

  const filteredReceived = useMemo(() => {
    return receivedEmails;
  }, [receivedEmails]);

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sidebar (Left) */}
      <Sidebar
        user={user}
        tab={activeTab}
        onTabChange={(nextTab) => {
          setActiveTab(nextTab);
          setCurrentView('list');
          setSelectedEmail(null);
          setSelectedReceivedEmail(null);
          setSearchQuery('');
          setInboxFilter('all');
        }}
        onComposeClick={() => {
          setReplyConfig(null);
          setCurrentView('compose');
        }}
        inboxCount={inboxCount}
        unreadInboxCount={unreadInboxCount}
        scheduledCount={scheduledCount}
        sentCount={sentCount}
      />

      {/* Main Content Area */}
      {currentView === 'compose' ? (
        <Compose
          onBack={() => {
            setCurrentView('list');
            setReplyConfig(null);
          }}
          onSuccess={() => {
            setActiveTab('scheduled');
            setReplyConfig(null);
            fetchEmails(true);
            fetchCounts();
          }}
          initialRecipients={replyConfig?.recipients}
          initialSubject={replyConfig?.subject}
          initialBody={replyConfig?.body}
        />
      ) : currentView === 'detail' && selectedReceivedEmail ? (
        <ReceivedDetail
          email={selectedReceivedEmail}
          user={user}
          onBack={() => {
            setCurrentView('list');
            setSelectedReceivedEmail(null);
          }}
          onDeleted={() => {
            fetchEmails(true);
            fetchCounts();
          }}
          onToggleStar={handleToggleReceivedStar}
          onToggleRead={handleToggleReceivedRead}
          onReply={handleReplyReceived}
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
          onUpdated={(updated) => {
            setEmails((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setSelectedEmail(updated);
            fetchCounts();
          }}
        />
      ) : (
        /* Main Email List View */
        <section className="flex-1 p-7 overflow-y-auto">
          {/* Top Search, Filter, Simulate & Refresh Bar */}
          <div className="flex items-center gap-3 mb-6">
            {/* Search Input */}
            <div className="bg-[#f6f8f7] rounded-full px-4.5 py-2 flex items-center flex-1 max-w-2xl">
              <Search size={16} className="text-gray-400 shrink-0 mr-2.5" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400 w-full"
                placeholder={
                  activeTab === 'inbox'
                    ? 'Search received emails...'
                    : activeTab === 'scheduled'
                    ? 'Search scheduled emails...'
                    : 'Search sent emails...'
                }
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

            {/* Filter Dropdown for Inbox */}
            {activeTab === 'inbox' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFilterMenuOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    inboxFilter !== 'all'
                      ? 'border-[#00a651] text-[#00a651] bg-[#e8f7ef]/50'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Filter messages"
                >
                  <Filter size={14} />
                  <span className="capitalize">{inboxFilter}</span>
                  <ChevronDown size={12} />
                </button>

                {filterMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setFilterMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-30 text-xs animate-in fade-in zoom-in-95 duration-100">
                      {(['all', 'unread', 'starred'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            setInboxFilter(mode);
                            setFilterMenuOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-50 transition-colors ${
                            inboxFilter === mode
                              ? 'text-[#00a651] font-semibold'
                              : 'text-gray-700'
                          }`}
                        >
                          <span className="capitalize">{mode}</span>
                          {inboxFilter === mode && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Simulate Inbound Button for Inbox */}
            {activeTab === 'inbox' && (
              <button
                type="button"
                onClick={handleSimulateInbound}
                disabled={isSimulating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#e8f7ef] text-[#008f45] hover:bg-[#d4f2e1] text-xs font-semibold transition-colors disabled:opacity-50 shadow-2xs cursor-pointer"
                title="Simulate receiving a new prospect reply"
              >
                <Sparkles size={13} className={isSimulating ? 'animate-spin' : ''} />
                <span>{isSimulating ? 'Receiving...' : 'Simulate Reply'}</span>
              </button>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => {
                fetchEmails(true);
                fetchCounts();
              }}
              disabled={isLoading || isRefreshing}
              className="text-gray-400 hover:text-gray-600 p-2 transition-colors disabled:opacity-50 rounded-full hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw
                size={16}
                className={isRefreshing ? 'animate-spin text-[#00a651]' : ''}
              />
            </button>
          </div>

          {/* Table View: Inbox vs Outbox (Scheduled / Sent) */}
          {activeTab === 'inbox' ? (
            <InboxTable
              emails={filteredReceived}
              isLoading={isLoading}
              onSelectEmail={handleSelectReceived}
              onToggleStar={handleToggleReceivedStar}
              onToggleRead={handleToggleReceivedRead}
              onDeleteEmail={handleDeleteReceived}
              onSimulateInbound={handleSimulateInbound}
              isSimulating={isSimulating}
              isFiltered={Boolean(searchQuery || inboxFilter !== 'all')}
              onClearFilter={() => {
                setSearchQuery('');
                setInboxFilter('all');
              }}
            />
          ) : (
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
          )}
        </section>
      )}
    </div>
  );
};
