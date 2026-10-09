import React from 'react';
import { TabType } from '../../types';
import { CalendarClock, SendHorizontal, Plus } from 'lucide-react';
import { Button } from '../common/Button';

interface EmailEmptyStateProps {
  tab: TabType;
  onComposeClick: () => void;
  isFiltered?: boolean;
  onClearFilter?: () => void;
}

export const EmailEmptyState: React.FC<EmailEmptyStateProps> = ({
  tab,
  onComposeClick,
  isFiltered,
  onClearFilter,
}) => {
  if (isFiltered) {
    return (
      <div className="py-20 px-4 text-center bg-white dark:bg-[#13181d] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-xs transition-colors">
        <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 flex items-center justify-center mb-4">
          <CalendarClock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">No matching emails found</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
          We couldn't find any emails matching your search criteria.
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
        {tab === 'scheduled' ? (
          <CalendarClock className="w-7 h-7" />
        ) : (
          <SendHorizontal className="w-7 h-7" />
        )}
      </div>

      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        {tab === 'scheduled' ? 'No scheduled emails yet' : 'No sent emails yet'}
      </h3>

      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md mx-auto leading-relaxed">
        {tab === 'scheduled'
          ? 'You do not have any pending scheduled email campaigns. Upload a lead list and set your delay pacing to schedule dispatches.'
          : 'Processed and dispatched emails will appear here along with their delivery status and send timestamps.'}
      </p>

      {tab === 'scheduled' && (
        <div className="mt-6">
          <Button
            onClick={onComposeClick}
            variant="primary"
            size="md"
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Compose New Email
          </Button>
        </div>
      )}
    </div>
  );
};
