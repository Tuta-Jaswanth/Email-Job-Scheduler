import React from 'react';
import { ReceivedEmail } from '../../types';
import { TableSkeleton } from '../common/Skeleton';
import {
  Star,
  Trash2,
  Paperclip,
  Mail,
  MailOpen,
  Inbox,
  Sparkles,
} from 'lucide-react';
import { Button } from '../common/Button';

interface InboxTableProps {
  emails: ReceivedEmail[];
  isLoading: boolean;
  onSelectEmail: (email: ReceivedEmail) => void;
  onToggleStar?: (email: ReceivedEmail) => void;
  onToggleRead?: (email: ReceivedEmail) => void;
  onDeleteEmail?: (email: ReceivedEmail) => void;
  onSimulateInbound?: () => void;
  isSimulating?: boolean;
  isFiltered?: boolean;
  onClearFilter?: () => void;
}

export const InboxTable: React.FC<InboxTableProps> = ({
  emails,
  isLoading,
  onSelectEmail,
  onToggleStar,
  onToggleRead,
  onDeleteEmail,
  onSimulateInbound,
  isSimulating = false,
  isFiltered = false,
  onClearFilter,
}) => {
  const formatReceivedTime = (dateString: string) => {
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return dateString;

      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();

      if (isToday) {
        return d.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      }

      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getSnippet = (text?: string | null, html?: string) => {
    if (text) {
      return text.length > 80 ? `${text.slice(0, 80)}...` : text;
    }
    if (html) {
      const clean = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return clean.length > 80 ? `${clean.slice(0, 80)}...` : clean;
    }
    return '';
  };

  if (isLoading) {
    return <TableSkeleton rows={6} />;
  }

  if (emails.length === 0) {
    if (isFiltered) {
      return (
        <div className="py-20 px-4 text-center bg-white dark:bg-[#13181d] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs transition-colors">
          <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center mb-4">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">No matching received emails</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            We couldn't find any received emails matching your search criteria.
          </p>
          {onClearFilter && (
            <div className="mt-5">
              <Button variant="outline" size="sm" onClick={onClearFilter}>
                Clear Search Filters
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="py-20 px-4 text-center bg-white dark:bg-[#13181d] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs transition-colors">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#e7f7ee] dark:bg-emerald-950/60 text-[#00a651] dark:text-emerald-400 flex items-center justify-center mb-4 shadow-inner">
          <Inbox className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Your Inbox is empty</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto leading-relaxed">
          Incoming responses to your scheduled campaigns and test replies will arrive here.
        </p>
        {onSimulateInbound && (
          <div className="mt-6 flex justify-center">
            <Button
              onClick={onSimulateInbound}
              variant="primary"
              size="md"
              disabled={isSimulating}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              {isSimulating ? 'Simulating...' : 'Simulate Inbound Reply'}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800/70 bg-white dark:bg-[#0b0f12] transition-colors">
      {emails.map((email) => {
        const isUnread = !email.isRead;

        return (
          <div
            key={email.id}
            onClick={() => onSelectEmail(email)}
            className={`py-3.5 px-3 flex items-center gap-4 hover:bg-gray-50/80 dark:hover:bg-[#161c22]/80 cursor-pointer transition-colors duration-100 group select-none rounded-lg ${
              isUnread ? 'bg-[#f4fbf7]/40 dark:bg-[#00a651]/5' : ''
            }`}
          >
            {/* Unread indicator dot */}
            <div className="w-2.5 h-2.5 shrink-0 flex items-center justify-center">
              {isUnread && (
                <span
                  className="w-2 h-2 rounded-full bg-[#00a651] dark:bg-emerald-400"
                  title="Unread"
                />
              )}
            </div>

            {/* Sender / From */}
            <div className="w-52 shrink-0 truncate">
              <span
                className={`text-sm ${
                  isUnread
                    ? 'font-bold text-gray-950 dark:text-white'
                    : 'font-medium text-gray-700 dark:text-gray-300'
                }`}
              >
                {email.from.split('<')[0].trim() || email.fromEmail}
              </span>
            </div>

            {/* Received Timestamp Pill */}
            <span
              className={`text-xs px-2.5 py-1 rounded-full shrink-0 font-medium ${
                isUnread
                  ? 'bg-[#e8f7ef] dark:bg-[#00a651]/20 text-[#008f45] dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-[#1c232b] text-gray-500 dark:text-gray-400'
              }`}
            >
              {formatReceivedTime(email.receivedAt)}
            </span>

            {/* Subject and Snippet Preview */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className={`text-sm truncate shrink-0 max-w-[280px] ${
                  isUnread
                    ? 'font-semibold text-gray-950 dark:text-white'
                    : 'font-medium text-gray-800 dark:text-gray-200'
                }`}
              >
                {email.subject}
              </span>
              <span className="text-gray-400 dark:text-gray-400 text-sm truncate">
                - {getSnippet(email.bodyText, email.bodyHtml)}
              </span>
              {Array.isArray(email.attachments) && email.attachments.length > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0 ml-1 text-xs"
                  title={`${email.attachments.length} attachment(s)`}
                >
                  <Paperclip size={12} className="text-[#00a651] dark:text-emerald-400" />
                </span>
              )}
            </div>

            {/* Action Buttons (Hover) */}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              {/* Mark Read/Unread Button */}
              {onToggleRead && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleRead(email);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 p-1.5 rounded-md hover:bg-gray-100 transition-all duration-150"
                  title={isUnread ? 'Mark as read' : 'Mark as unread'}
                  aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
                >
                  {isUnread ? <MailOpen size={15} /> : <Mail size={15} />}
                </button>
              )}

              {/* Delete Button */}
              {onDeleteEmail && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEmail(email);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-600 p-1.5 rounded-md hover:bg-rose-50 transition-all duration-150"
                  title="Delete received email"
                  aria-label="Delete received email"
                >
                  <Trash2 size={15} />
                </button>
              )}

              {/* Star / Favourite Icon Button */}
              {onToggleStar && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(email);
                  }}
                  className={`p-1.5 rounded-md transition-all duration-150 ${
                    email.isStarred
                      ? 'text-amber-400 hover:text-amber-500'
                      : 'text-gray-300 hover:text-amber-400'
                  }`}
                  title={email.isStarred ? 'Remove from starred' : 'Add to starred'}
                  aria-label="Star email"
                >
                  <Star
                    size={16}
                    className={email.isStarred ? 'fill-amber-400 text-amber-400' : ''}
                  />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
