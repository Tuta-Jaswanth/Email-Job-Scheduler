import React, { useState } from 'react';
import { Email, EmailAttachment, User } from '../../types';
import {
  ArrowLeft,
  Star,
  Trash2,
  ChevronDown,
  XCircle,
  Paperclip,
  Download,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  File as GenericFile,
  Eye,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface DetailProps {
  email: Email;
  user: User | null;
  onBack: () => void;
  onCancelled?: () => void;
  onDeleted?: () => void;
  onToggleStar?: (email: Email) => void;
}

export const Detail: React.FC<DetailProps> = ({
  email: initialEmail,
  user,
  onBack,
  onCancelled,
  onDeleted,
  onToggleStar,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [email, setEmail] = useState<Email>(initialEmail);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isStarring, setIsStarring] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null);

  const formatDetailDate = (dateString?: string | null) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
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
      const response = await api.patch<Email>(`/api/emails/${email.id}/star`);
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

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete email to "${email.recipient}"?`)) return;
    setIsDeleting(true);
    try {
      await api.delete(`/api/emails/${email.id}`);
      toastSuccess('Deleted', 'The email has been permanently removed.');
      if (onDeleted) onDeleted();
      else if (onCancelled) onCancelled();
      onBack();
    } catch (err: any) {
      toastError('Delete Failed', err.message || 'Could not delete this email.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this scheduled email dispatch?')) return;
    setIsCancelling(true);
    try {
      await api.post(`/api/emails/${email.id}/cancel`);
      toastSuccess('Cancelled', 'The scheduled email dispatch has been cancelled.');
      if (onCancelled) onCancelled();
      onBack();
    } catch (err: any) {
      toastError('Cancel Failed', err.message || 'Could not cancel this email.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDownload = (att: EmailAttachment) => {
    const url = att.dataUrl || att.url;
    if (!url) {
      toastError('Download Error', 'File content is not available for download.');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = att.name || 'attachment';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getFileIcon = (file: EmailAttachment) => {
    const type = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();

    if (type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(name)) {
      return <ImageIcon className="w-5 h-5 text-sky-500 shrink-0" />;
    }
    if (type.includes('pdf') || /\.pdf$/.test(name)) {
      return <FileText className="w-5 h-5 text-rose-500 shrink-0" />;
    }
    if (type.includes('sheet') || type.includes('csv') || /\.(csv|xlsx|xls|tsv)$/.test(name)) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0" />;
    }
    if (type.includes('zip') || type.includes('compressed') || /\.(zip|tar|gz|rar|7z)$/.test(name)) {
      return <FileArchive className="w-5 h-5 text-amber-500 shrink-0" />;
    }
    if (type.includes('javascript') || type.includes('json') || /\.(js|ts|json|html|css|py)$/.test(name)) {
      return <FileCode className="w-5 h-5 text-indigo-500 shrink-0" />;
    }
    return <GenericFile className="w-5 h-5 text-gray-500 shrink-0" />;
  };

  const isImageAttachment = (att: EmailAttachment) => {
    const type = (att.type || '').toLowerCase();
    const name = (att.name || '').toLowerCase();
    return type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(name);
  };

  const senderName = email.sender?.name || (user?.email === email.sender?.email ? user?.name : 'Owner') || user?.name || 'Owner';
  const senderEmail = email.sender?.email || user?.email || 'owner@example.com';
  const senderInitial = (senderName || senderEmail).charAt(0).toUpperCase();

  const attachments: EmailAttachment[] = Array.isArray(email.attachments) ? email.attachments : [];

  const statusBadge = () => {
    switch (email.status) {
      case 'SENT':
        return (
          <span className="px-2.5 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
            Sent
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2.5 py-0.5 text-xs rounded-full bg-rose-50 text-rose-700 font-medium border border-rose-200">
            Failed
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="px-2.5 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200">
            Processing
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 text-xs rounded-full bg-orange-50 text-orange-700 font-medium border border-orange-200">
            Scheduled
          </span>
        );
    }
  };

  return (
    <section className="flex-1 bg-white min-h-screen flex flex-col relative">
      {/* Top Header */}
      <header className="h-[75px] border-b border-gray-200 px-7 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onBack}
            className="text-gray-700 hover:text-gray-900 p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="Back to email list"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-medium text-gray-900 truncate">
            {email.subject}
          </h2>
          <div className="ml-1 shrink-0">{statusBadge()}</div>
        </div>

        <div className="flex items-center gap-3 text-gray-400">
          {/* Attachment count indicator in header */}
          {attachments.length > 0 && (
            <div
              className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium"
              title={`${attachments.length} attached file(s)`}
            >
              <Paperclip size={13} className="text-[#00a651]" />
              <span>{attachments.length}</span>
            </div>
          )}

          {/* Favourite / Star Button */}
          <button
            type="button"
            onClick={handleToggleStar}
            disabled={isStarring}
            className={`p-1.5 rounded-lg transition-colors ${
              email.isStarred
                ? 'text-amber-400 hover:text-amber-500 bg-amber-50/50'
                : 'hover:text-amber-400 hover:bg-gray-50'
            }`}
            title={email.isStarred ? 'Unstar email' : 'Star email'}
          >
            <Star
              size={18}
              className={email.isStarred ? 'fill-amber-400 text-amber-400' : ''}
            />
          </button>

          {/* Cancel button – only shown for SCHEDULED emails */}
          {email.status === 'SCHEDULED' && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium disabled:opacity-50"
              title="Cancel email schedule"
            >
              <XCircle size={18} />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          )}

          {/* Delete Button */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors disabled:opacity-50"
            title="Delete email permanently"
          >
            <Trash2 size={18} />
          </button>

          {/* User avatar */}
          <div className="ml-1">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name || 'User'}
                className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-[#008f45] font-semibold text-xs flex items-center justify-center">
                {user?.name?.slice(0, 2).toUpperCase() || 'U'}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Email View */}
      <div className="flex-1 px-8 py-7 overflow-y-auto max-w-[960px] space-y-6">
        {/* Sender Info Row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#00a651] text-white flex items-center justify-center font-bold text-sm shrink-0">
              {senderInitial}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <span>{senderName}</span>
                <span className="text-gray-400 font-normal text-xs">&lt;{senderEmail}&gt;</span>
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                <span>to</span>
                <span className="font-medium text-gray-600">{email.recipient}</span>
                <ChevronDown size={13} />
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-400 shrink-0 space-y-0.5 text-right">
            {email.sentAt ? (
              <div>Sent {formatDetailDate(email.sentAt)}</div>
            ) : (
              <div>Scheduled {formatDetailDate(email.scheduledAt)}</div>
            )}
          </div>
        </div>

        {/* Failure alert */}
        {email.status === 'FAILED' && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            <span className="font-semibold">Delivery Failure: </span>
            {email.failureReason || 'Email could not be delivered through SMTP.'}
          </div>
        )}

        {/* Email Body */}
        <div
          className="text-sm leading-relaxed text-gray-800 prose prose-sm max-w-none pt-2 border-t border-gray-100 min-h-[140px]"
          dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
        />

        {/* Attached Files Section */}
        {attachments.length > 0 && (
          <div className="pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Paperclip size={16} className="text-[#00a651]" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Attachments ({attachments.length})
                </h3>
              </div>
              {attachments.length > 1 && (
                <button
                  type="button"
                  onClick={() => attachments.forEach((att) => handleDownload(att))}
                  className="text-xs text-[#00a651] hover:text-[#008f45] font-semibold flex items-center gap-1"
                >
                  <Download size={13} />
                  <span>Download All</span>
                </button>
              )}
            </div>

            {/* Grid of Attachment Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {attachments.map((file, idx) => {
                const isImage = isImageAttachment(file);
                const hasPreviewUrl = !!(file.dataUrl || file.url);

                return (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-xl p-3 bg-gray-50/60 hover:bg-gray-50 hover:border-gray-300 transition-all flex flex-col justify-between group relative overflow-hidden shadow-2xs"
                  >
                    {/* Image Preview Thumbnail if Image */}
                    {isImage && hasPreviewUrl && (
                      <div
                        onClick={() =>
                          setPreviewImage({
                            src: file.dataUrl || file.url || '',
                            name: file.name,
                          })
                        }
                        className="w-full h-28 mb-2.5 rounded-lg overflow-hidden bg-gray-100 cursor-pointer relative group/img"
                      >
                        <img
                          src={file.dataUrl || file.url}
                          alt={file.name}
                          className="w-full h-full object-cover transition-transform group-hover/img:scale-105 duration-200"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs font-medium">
                          <Eye size={14} />
                          <span>Preview</span>
                        </div>
                      </div>
                    )}

                    {/* File Info Row */}
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-white border border-gray-100 shrink-0">
                        {getFileIcon(file)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-xs font-semibold text-gray-900 truncate"
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-gray-200/60">
                      {isImage && hasPreviewUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewImage({
                              src: file.dataUrl || file.url || '',
                              name: file.name,
                            })
                          }
                          className="p-1 text-gray-500 hover:text-[#00a651] rounded-md hover:bg-white text-xs font-medium flex items-center gap-1"
                          title="Preview full image"
                        >
                          <Eye size={13} />
                          <span className="text-[11px]">View</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        className="p-1 text-gray-600 hover:text-[#00a651] rounded-md hover:bg-white text-xs font-medium flex items-center gap-1"
                        title="Download attachment"
                      >
                        <Download size={13} />
                        <span className="text-[11px]">Download</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Image Preview Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-transparent flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white mb-2 px-2">
              <span className="text-sm font-medium truncate max-w-md">{previewImage.name}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = previewImage.src;
                    a.download = previewImage.name;
                    a.click();
                  }}
                  className="text-white hover:text-[#00a651] p-1 rounded-lg"
                  title="Download Image"
                >
                  <Download size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="text-white hover:text-rose-400 p-1 rounded-lg"
                  title="Close preview"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <img
              src={previewImage.src}
              alt={previewImage.name}
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl bg-black/20"
            />
          </div>
        </div>
      )}
    </section>
  );
};

