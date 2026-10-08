import React from 'react';
import { EmailStatus } from '../../types';
import { Clock3, Loader2, CheckCircle2, AlertOctagon } from 'lucide-react';

interface BadgeProps {
  status: EmailStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<BadgeProps> = ({ status, size = 'md' }) => {
  const configs: Record<
    EmailStatus,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    SCHEDULED: {
      label: 'Scheduled',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      icon: <Clock3 className="w-3 h-3 text-amber-600" />,
    },
    PROCESSING: {
      label: 'Processing',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      icon: <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />,
    },
    SENT: {
      label: 'Sent',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" />,
    },
    FAILED: {
      label: 'Failed',
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      icon: <AlertOctagon className="w-3 h-3 text-rose-600" />,
    },
  };

  const config = configs[status] || configs.SCHEDULED;

  const sizeClass =
    size === 'sm'
      ? 'text-[11px] px-2 py-0.5 gap-1 font-medium'
      : 'text-xs px-2.5 py-1 gap-1.5 font-medium';

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClass}`}
    >
      {config.icon}
      <span>{config.label}</span>
    </span>
  );
};
