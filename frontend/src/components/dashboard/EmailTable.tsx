import React from 'react';
import { Email, TabType } from '../../types';
import { TableSkeleton } from '../common/Skeleton';
import { EmailEmptyState } from './EmailEmptyState';
import { Clock3, Star, Trash2, Paperclip } from 'lucide-react';

interface EmailTableProps {
  emails: Email[];
  tab: TabType;
  isLoading: boolean;
  onSelectEmail: (email: Email) => void;
  onComposeClick: () => void;
  onToggleStar?: (email: Email) => void;
  onDeleteEmail?: (email: Email) => void;
  isFiltered?: boolean;
  onClearFilter?: () => void;
}

export const EmailTable: React.FC<EmailTableProps> = ({
  emails,
  tab,
  isLoading,
  onSelectEmail,
  onComposeClick,
  onToggleStar,
  onDeleteEmail,
  isFiltered = false,
  onClearFilter,
}) => {
  // Format scheduled date like Figma: e.g. "Tue 9:15:12 AM"
  const formatScheduledTime = (dateString: string) => {
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return dateString;
      const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
      const time = d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      return `${weekday} ${time}`;
    } catch {
      return dateString;
    }
  };

  // Strip HTML tags for clean snippet preview
  const getSnippet = (html: string) => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  };

  if (isLoading) {
    return <TableSkeleton rows={6} />;
  }

  if (emails.length === 0) {
    return (
      <EmailEmptyState
        tab={tab}
        onComposeClick={onComposeClick}
        isFiltered={isFiltered}
        onClearFilter={onClearFilter}
      />
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800/70 bg-white dark:bg-[#0b0f12] transition-colors">
      {emails.map((email) => {
        return (
          <div
            key={email.id}
            onClick={() => onSelectEmail(email)}
            className="py-4 px-2 flex items-center gap-5 hover:bg-gray-50/80 dark:hover:bg-[#161c22]/80 cursor-pointer transition-colors duration-100 group select-none rounded-lg"
          >
            {/* Recipient */}
            <div className="w-48 text-sm font-medium text-gray-900 dark:text-white truncate shrink-0">
              To: {email.recipient}
            </div>

            {/* Status Pill (Figma design) */}
            {tab === 'scheduled' ? (
              <span className="bg-[#fef3eb] dark:bg-amber-950/40 text-[#ea580c] dark:text-amber-400 text-xs px-3 py-1 rounded-full flex items-center gap-1.5 shrink-0 font-medium">
                <Clock3 size={12} className="shrink-0" />
                <span>{formatScheduledTime(email.scheduledAt)}</span>
              </span>
            ) : email.status === 'FAILED' ? (
              <span className="bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs px-3 py-1 rounded-full shrink-0 font-medium">
                Failed
              </span>
            ) : (
              <span className="bg-gray-100 dark:bg-[#1c232b] text-gray-600 dark:text-gray-400 text-xs px-3 py-1 rounded-full shrink-0 font-medium">
                Sent
              </span>
            )}

            {/* Subject and Snippet */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-medium text-sm text-gray-900 dark:text-white truncate shrink-0 max-w-[280px]">
                {email.subject}
              </span>
              {email.bodyHtml && (
                <span className="text-gray-400 dark:text-gray-400 text-sm truncate">
                  - {getSnippet(email.bodyHtml)}
                </span>
              )}
              {Array.isArray(email.attachments) && email.attachments.length > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 text-gray-400 hover:text-gray-600 shrink-0 ml-1 text-xs"
                  title={`${email.attachments.length} attachment(s)`}
                >
                  <Paperclip size={12} className="text-[#00a651]" />
                  {email.attachments.length > 1 && (
                    <span className="text-[10px] font-medium text-gray-500">
                      {email.attachments.length}
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Actions: Delete & Star */}
            <div className="ml-auto flex items-center gap-2">
              {/* Delete Button */}
              {onDeleteEmail && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEmail(email);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all duration-150 cursor-pointer"
                  title="Delete email"
                  aria-label="Delete email"
                >
                  <Trash2 size={16} />
                </button>
              )}

              {/* Star / Favourite Icon Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onToggleStar) onToggleStar(email);
                }}
                className={`p-1 rounded-md transition-all duration-150 cursor-pointer ${
                  email.isStarred
                    ? 'text-amber-400 hover:text-amber-500'
                    : 'text-gray-300 dark:text-gray-600 hover:text-amber-400'
                }`}
                title={email.isStarred ? 'Remove from starred' : 'Add to starred'}
                aria-label="Star email"
              >
                <Star
                  size={16}
                  className={email.isStarred ? 'fill-amber-400 text-amber-400' : ''}
                />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
