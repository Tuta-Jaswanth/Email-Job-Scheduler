import React from 'react';
import { TabType } from '../../types';
import { Clock, Send } from 'lucide-react';

interface TabItem {
  id: TabType;
  label: string;
  count?: number;
  icon: React.ReactNode;
}

interface TabsProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
  scheduledCount?: number;
  sentCount?: number;
}

export const Tabs: React.FC<TabsProps> = ({
  activeTab,
  onChange,
  scheduledCount,
  sentCount,
}) => {
  const tabs: TabItem[] = [
    {
      id: 'scheduled',
      label: 'Scheduled Emails',
      count: scheduledCount,
      icon: <Clock className="w-4 h-4" />,
    },
    {
      id: 'sent',
      label: 'Sent Emails',
      count: sentCount,
      icon: <Send className="w-4 h-4" />,
    },
  ];

  return (
    <div className="flex border-b border-gray-200">
      <nav className="-mb-px flex space-x-6" aria-label="Dashboard Tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`group inline-flex items-center gap-2.5 py-4 px-1 border-b-2 font-medium text-sm transition-all duration-150 focus:outline-none ${
                isActive
                  ? 'border-[#00a651] text-[#00a651]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span
                className={`${
                  isActive ? 'text-[#00a651]' : 'text-gray-400 group-hover:text-gray-500'
                }`}
              >
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`ml-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isActive
                      ? 'bg-[#e7f7ee] text-[#008f45]'
                      : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
