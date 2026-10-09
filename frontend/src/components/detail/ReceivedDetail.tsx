import React, { useState } from 'react';
import { ReceivedEmail, User } from '../../types';
import {
  ArrowLeft,
  Star,
  Trash2,
  Reply,
  Mail,
  MailOpen,
  Paperclip,
  Calendar,
  Clock,
  User as UserIcon,
  Download,
  FileText,
  Image as ImageIcon,
  File as GenericFile,
  Eye,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface ReceivedDetailProps {
  email: ReceivedEmail;
  user: User | null;
  onBack: () => void;
  onDeleted?: () => void;
  onToggleStar?: (email: ReceivedEmail) => void;
  onToggleRead?: (email: ReceivedEmail) => void;
  onReply?: (email: ReceivedEmail) => void;
}

export const ReceivedDetail: React.FC<ReceivedDetailProps> = ({
  email: initialEmail,
  user: _user,
  onBack,
  onDeleted,
  onToggleStar,
  onToggleRead,
  onReply,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [email, setEmail] = useState<ReceivedEmail>(initialEmail);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isStarring, setIsStarring] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);

  const formatDetailDate = (dateString?: string | null) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dateString;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleToggleStar = async () => {
    setIsStarring(true);
    const prevStarred = email.isStarred;
    setEmail((prev) => ({ ...prev, isStarred: !prevStarred }));

    try {
      const response = await api.patch<ReceivedEmail>(`/api/inbox/${email.id}/star`);
      setEmail(response.data);
      if (onToggleStar) onToggleStar(response.data);
      toastSuccess(
        response.data.isStarred ? 'Added to Starred' : 'Removed from Starred',
        response.data.isStarred
          ? 'Email added to your starred collection.'
          : 'Email removed from your starred collection.'
      );
    } catch (err: any) {
      setEmail((prev) => ({ ...prev, isStarred: prevStarred }));
      toastError('Star Action Failed', err.message || 'Could not update star status.');
    } finally {
      setIsStarring(false);
    }
  };

  const handleToggleRead = async () => {
    const nextRead = !email.isRead;
    setEmail((prev) => ({ ...prev, isRead: nextRead }));

    try {
      const response = await api.patch<ReceivedEmail>(`/api/inbox/${email.id}/read`, {
        isRead: nextRead,
      });
      setEmail(response.data);
      if (onToggleRead) onToggleRead(response.data);
      toastSuccess(
        nextRead ? 'Marked as Read' : 'Marked as Unread',
        nextRead ? 'Email marked as read.' : 'Email marked as unread.'
      );
    } catch (err: any) {
      setEmail((prev) => ({ ...prev, isRead: !nextRead }));
      toastError('Status Update Failed', err.message || 'Could not update read status.');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete email from "${email.from}"?`)) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/inbox/${email.id}`);
      toastSuccess('Deleted', 'The email has been removed from your inbox.');
      if (onDeleted) onDeleted();
      onBack();
    } catch (err: any) {
      toastError('Delete Failed', err.message || 'Could not delete this email.');
    } finally {
      setIsDeleting(false);
    }
  };

  const senderDisplayName = email.from.split('<')[0].trim() || email.fromEmail;

  return (
    <section className="flex-1 p-8 max-w-5xl mx-auto overflow-y-auto">
      {/* Top Header / Navigation Bar */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer group"
        >
          <ArrowLeft
            size={18}
            className="group-hover:-translate-x-0.5 transition-transform"
          />
          <span>Back to Inbox</span>
        </button>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2">
          {/* Reply Button */}
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(email)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#e8f7ef] text-[#008f45] hover:bg-[#d5f0e1] transition-colors shadow-2xs"
              title="Reply to this email"
            >
              <Reply size={14} />
              <span>Reply</span>
            </button>
          )}

          {/* Mark Read/Unread Toggle */}
          <button
            type="button"
            onClick={handleToggleRead}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            title={email.isRead ? 'Mark as Unread' : 'Mark as Read'}
          >
            {email.isRead ? <Mail size={16} /> : <MailOpen size={16} />}
          </button>

          {/* Star Toggle */}
          <button
            type="button"
            onClick={handleToggleStar}
            disabled={isStarring}
            className={`p-2 rounded-lg transition-colors ${
              email.isStarred
                ? 'text-amber-400 hover:text-amber-500 hover:bg-amber-50'
                : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100'
            }`}
            title={email.isStarred ? 'Remove Star' : 'Star Email'}
          >
            <Star
              size={16}
              className={email.isStarred ? 'fill-amber-400 text-amber-400' : ''}
            />
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
            title="Delete Email"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Main Email Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-7 mb-6">
        {/* Subject Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight leading-snug">
            {email.subject}
          </h1>
          <span className="bg-[#e8f7ef] text-[#008f45] text-xs font-semibold px-3 py-1 rounded-full shrink-0">
            Received
          </span>
        </div>

        {/* Sender & Recipient Metadata */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-100 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#e8f7ef] text-[#008f45] font-bold text-sm flex items-center justify-center shrink-0 shadow-inner">
              {senderDisplayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-900">
                  {senderDisplayName}
                </span>
                <span className="text-xs text-gray-400">
                  &lt;{email.fromEmail}&gt;
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                To: <span className="font-medium text-gray-700">{email.to}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={13} />
            <span>{formatDetailDate(email.receivedAt)}</span>
          </div>
        </div>

        {/* Email Body Content */}
        <div className="py-2 text-gray-800 text-sm leading-relaxed prose max-w-none">
          {email.bodyHtml ? (
            <div
              className="email-rendered-body"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
              {email.bodyText || '(No content)'}
            </pre>
          )}
        </div>

        {/* Attachments Section */}
        {Array.isArray(email.attachments) && email.attachments.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-3">
              <Paperclip size={14} className="text-[#00a651]" />
              <span>Attachments ({email.attachments.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {email.attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-gray-200 bg-gray-50/60 hover:bg-gray-100/60 transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {file.type?.startsWith('image/') ? (
                      <ImageIcon size={16} className="text-sky-500 shrink-0" />
                    ) : (
                      <FileText size={16} className="text-emerald-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-gray-800 truncate">
                        {file.name}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                  </div>

                  {file.dataUrl && (
                    <a
                      href={file.dataUrl}
                      download={file.name}
                      className="p-1 text-gray-400 hover:text-gray-700"
                      title="Download"
                    >
                      <Download size={14} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reply Prompt Footer */}
        {onReply && (
          <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between bg-[#f8faf9] -mx-7 -mb-7 p-5 rounded-b-2xl">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Reply size={14} className="text-[#00a651]" />
              <span>
                Want to respond to <strong>{senderDisplayName}</strong>?
              </span>
            </div>
            <button
              type="button"
              onClick={() => onReply(email)}
              className="px-4 py-2 rounded-xl bg-[#00a651] text-white text-xs font-semibold hover:bg-[#008f45] transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <Reply size={13} />
              <span>Compose Reply</span>
            </button>
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 p-1"
            >
              <X size={24} />
            </button>
            <img
              src={previewImage.src}
              alt={previewImage.name}
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </section>
  );
};
