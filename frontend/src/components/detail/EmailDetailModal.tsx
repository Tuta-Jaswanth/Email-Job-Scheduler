import React from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/Badge';
import { Email } from '../../types';
import { Clock, Send, AlertTriangle, User, Mail, Calendar } from 'lucide-react';

interface EmailDetailModalProps {
  email: Email | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  email,
  isOpen,
  onClose,
}) => {
  if (!email) return null;

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      return d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <StatusBadge status={email.status} />
          <span className="truncate max-w-md">{email.subject}</span>
        </div>
      }
      subtitle={`Email ID: ${email.id}`}
      maxWidth="max-w-3xl"
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Failure banner if FAILED */}
        {email.status === 'FAILED' && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold">Delivery Failed</h4>
              <p className="text-xs text-rose-700 mt-0.5">
                {email.failureReason || 'An unknown error occurred during delivery through the SMTP server.'}
              </p>
            </div>
          </div>
        )}

        {/* Meta Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-gray-50/80 border border-gray-100 text-xs">
          <div>
            <span className="text-gray-400 block mb-0.5 uppercase tracking-wider font-semibold">
              Recipient (To)
            </span>
            <span className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-gray-400" />
              {email.recipient}
            </span>
          </div>

          <div>
            <span className="text-gray-400 block mb-0.5 uppercase tracking-wider font-semibold">
              Sender (From)
            </span>
            <span className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <User className="w-4 h-4 text-gray-400" />
              {email.sender?.name ? `${email.sender.name} (${email.sender.email})` : email.sender?.email || 'System Sender'}
            </span>
          </div>

          <div>
            <span className="text-gray-400 block mb-0.5 uppercase tracking-wider font-semibold">
              Scheduled Time
            </span>
            <span className="font-medium text-gray-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              {formatDate(email.scheduledAt)}
            </span>
          </div>

          <div>
            <span className="text-gray-400 block mb-0.5 uppercase tracking-wider font-semibold">
              Sent Time
            </span>
            <span className="font-medium text-gray-700 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-gray-400" />
              {email.sentAt ? formatDate(email.sentAt) : 'Pending execution'}
            </span>
          </div>
        </div>

        {/* Email Subject & Body Container */}
        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
          <div className="bg-gray-50/90 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Message Content
            </span>
            <span className="text-xs text-gray-400 font-mono">HTML Preview</span>
          </div>
          <div className="p-6 bg-white min-h-[160px]">
            <h3 className="text-base font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              {email.subject}
            </h3>
            <div
              className="prose prose-sm max-w-none text-gray-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};
