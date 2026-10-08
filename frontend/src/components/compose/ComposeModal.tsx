import React, { useState, useRef, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Sender, ScheduleResponse, EmailAttachment } from '../../types';
import {
  Upload,
  Clock,
  Sparkles,
  X,
  FileSpreadsheet,
  AlertCircle,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Calendar,
  Send,
  Timer,
  Gauge,
  Paperclip,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');

  const [recipients, setRecipients] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [bodyHtml, setBodyHtml] = useState<string>('');
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);

  // Default start time: 2 minutes in future
  const getDefaultStartTime = () => {
    const d = new Date(Date.now() + 2 * 60 * 1000);
    // Format YYYY-MM-DDTHH:mm
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const [startTime, setStartTime] = useState<string>(getDefaultStartTime());
  const [delaySeconds, setDelaySeconds] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(200);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Fetch senders when modal opens
  useEffect(() => {
    if (isOpen) {
      api
        .get<Sender[]>('/api/senders')
        .then((res) => {
          setSenders(res.data);
          if (res.data.length > 0) {
            const userSender = res.data.find((s) => s.email === user?.email);
            setSelectedSenderId(userSender ? userSender.id : res.data[0].id);
          }
        })
        .catch((err) => {
          console.warn('Could not load senders:', err);
        });
    }
  }, [isOpen, user]);

  // Extract emails helper
  const extractEmails = (text: string): string[] => {
    // Regex for standard email matching
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    return matches.map((e) => e.toLowerCase().trim());
  };

  const addEmails = (rawEmails: string[]) => {
    const valid = rawEmails.filter((email) =>
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
    );

    if (valid.length === 0) {
      toastWarning('No Valid Emails', 'No valid email addresses were found in the provided input.');
      return;
    }

    setRecipients((prev) => {
      const combined = Array.from(new Set([...prev, ...valid]));
      const addedCount = combined.length - prev.length;
      if (addedCount > 0) {
        toastSuccess(
          'Emails Added',
          `Added ${addedCount} email address${addedCount !== 1 ? 'es' : ''}.`
        );
      } else {
        toastWarning('Duplicate Emails', 'All detected email addresses are already in the list.');
      }
      return combined;
    });
  };

  const handleFileUpload = (file: File) => {
    if (!file.name.match(/\.(csv|txt|tsv)$/i)) {
      toastError('Invalid File', 'Please upload a CSV or TXT file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || '');
      const parsed = extractEmails(content);
      if (parsed.length === 0) {
        toastWarning('No Leads Found', 'No email addresses could be detected in this file.');
      } else {
        addEmails(parsed);
      }
    };
    reader.onerror = () => {
      toastError('File Read Error', 'Failed to read the uploaded file.');
    };
    reader.readAsText(file);
  };

  const handleAttachmentUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toastError('File Too Large', `"${file.name}" exceeds the 10MB limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = String(e.target?.result || '');
        const newAttachment: EmailAttachment = {
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl,
        };

        setAttachments((prev) => [...prev, newAttachment]);
        toastSuccess('File Attached', `Attached "${file.name}"`);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleManualAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (!manualInput.trim()) return;
      const parsed = extractEmails(manualInput);
      if (parsed.length > 0) {
        addEmails(parsed);
        setManualInput('');
      } else {
        toastError('Invalid Email', 'Please enter a valid email address.');
      }
    }
  };

  const removeRecipient = (emailToRemove: string) => {
    setRecipients((prev) => prev.filter((e) => e !== emailToRemove));
  };

  const clearAllRecipients = () => {
    setRecipients([]);
  };

  // Preset time helpers
  const applyPresetTime = (offsetMinutes: number) => {
    const target = new Date(Date.now() + offsetMinutes * 60 * 1000);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    const hours = String(target.getHours()).padStart(2, '0');
    const minutes = String(target.getMinutes()).padStart(2, '0');
    setStartTime(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const applyTomorrowMorning = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    setStartTime(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  // Editor formatting commands
  const executeCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setBodyHtml(editorRef.current.innerHTML);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (recipients.length === 0) {
      toastError('Missing Recipients', 'Please add or upload at least one email recipient.');
      return;
    }

    if (!subject.trim()) {
      toastError('Missing Subject', 'Please enter a subject line for your email.');
      return;
    }

    const currentEditorHtml = editorRef.current?.innerHTML || bodyHtml;
    if (!currentEditorHtml.trim() || currentEditorHtml === '<br>') {
      toastError('Missing Email Body', 'Please write the body content of your email.');
      return;
    }

    const scheduledDate = new Date(startTime);
    if (isNaN(scheduledDate.getTime())) {
      toastError('Invalid Time', 'Please choose a valid scheduling start time.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        subject: subject.trim(),
        bodyHtml: currentEditorHtml,
        recipients,
        startTime: scheduledDate.toISOString(),
        delayBetweenEmails: Math.max(0, delaySeconds * 1000),
        hourlyLimit: Math.max(1, hourlyLimit),
        senderId: selectedSenderId || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const response = await api.post<ScheduleResponse>('/api/emails/schedule', payload);

      toastSuccess(
        'Campaign Scheduled!',
        `Successfully queued ${response.data.count || recipients.length} email(s) for delivery.`
      );

      // Reset and close
      setRecipients([]);
      setSubject('');
      setBodyHtml('');
      setAttachments([]);
      if (editorRef.current) editorRef.current.innerHTML = '';
      setStartTime(getDefaultStartTime());
      onSuccess();
      onClose();
    } catch (err: any) {
      toastError(
        'Scheduling Failed',
        err.message || 'Could not schedule email campaign. Please check parameters and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-gray-900 font-bold">
          <Send className="w-5 h-5 text-[#00a651]" />
          <span>Compose New Email Campaign</span>
        </div>
      }
      subtitle="Configure bulk leads, scheduling pacing, and rate limit settings."
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-gray-500 font-medium">
            {recipients.length > 0 ? (
              <span className="text-[#008f45] font-semibold">
                ● {recipients.length} lead{recipients.length !== 1 ? 's' : ''} ready
              </span>
            ) : (
              <span>No recipients selected</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              variant="primary"
              isLoading={isSubmitting}
              leftIcon={<Clock className="w-4 h-4" />}
            >
              Schedule Campaign
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sender (From) Row */}
        {senders.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
              From (Sender Account)
            </label>
            <select
              value={selectedSenderId}
              onChange={(e) => setSelectedSenderId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white text-gray-900 text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-[#00a651]/30 focus:border-[#00a651]"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ? `${s.name} <${s.email}>` : s.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Lead Upload & Recipients Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
              Recipients (Leads)
            </label>
            {/* Detected Count Badge (Explicit Requirement) */}
            <span
              id="detected-emails-count"
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold transition-colors ${
                recipients.length > 0
                  ? 'bg-[#e7f7ee] text-[#008f45] border border-[#00a651]/30'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {recipients.length} email address{recipients.length === 1 ? '' : 'es'} detected
            </span>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-150 ${
              isDragging
                ? 'border-[#00a651] bg-[#e7f7ee]/40'
                : 'border-gray-200 hover:border-[#00a651] hover:bg-gray-50/70'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt,.tsv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
            <div className="flex items-center justify-center gap-3 text-sm text-gray-600">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-[#00a651] flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-800 text-xs sm:text-sm">
                  Click to upload or drag & drop CSV / TXT lead file
                </p>
                <p className="text-[11px] text-gray-400">
                  Parses email addresses from rows, columns, or comma/newline separated text
                </p>
              </div>
            </div>
          </div>

          {/* Manual Input + Chip Display */}
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Type or paste email, then press Enter..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={handleManualAdd}
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (manualInput.trim()) {
                    const parsed = extractEmails(manualInput);
                    if (parsed.length > 0) {
                      addEmails(parsed);
                      setManualInput('');
                    }
                  }
                }}
              >
                Add
              </Button>
            </div>

            {/* Recipients Chips Container */}
            {recipients.length > 0 && (
              <div className="mt-2.5 p-3 rounded-xl bg-gray-50/80 border border-gray-100 max-h-36 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Lead list ({recipients.length})
                  </span>
                  <button
                    type="button"
                    onClick={clearAllRecipients}
                    className="text-[11px] text-rose-600 hover:underline font-medium"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-800 shadow-2xs"
                    >
                      <span className="truncate max-w-[200px]">{email}</span>
                      <button
                        type="button"
                        onClick={() => removeRecipient(email)}
                        className="text-gray-400 hover:text-rose-500 rounded-full p-0.5 focus:outline-none"
                        aria-label={`Remove ${email}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Subject Line */}
        <div>
          <Input
            label="Subject"
            placeholder="e.g. Scaling outbound campaigns with ReachInbox"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </div>

        {/* Email Body with Rich Formatting Toolbar */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
            Email Body
          </label>

          {/* Formatting Controls Bar */}
          <div className="border border-gray-200 rounded-t-xl bg-gray-50/80 p-1.5 flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => executeCommand('bold')}
              title="Bold"
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('italic')}
              title="Italic"
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('underline')}
              title="Underline"
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
            >
              <Underline className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-300 mx-1" />
            <button
              type="button"
              onClick={() => executeCommand('insertUnorderedList')}
              title="Bullet list"
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => executeCommand('insertOrderedList')}
              title="Numbered list"
              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-300 mx-1" />
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              title="Attach files"
              className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium ${
                attachments.length > 0
                  ? 'bg-emerald-50 text-[#00a651] hover:bg-emerald-100'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white'
              }`}
            >
              <Paperclip className="w-4 h-4" />
              {attachments.length > 0 && <span>{attachments.length}</span>}
            </button>
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAttachmentUpload(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* Attached Files List */}
          {attachments.length > 0 && (
            <div className="p-2.5 bg-gray-50 border-x border-gray-200 flex flex-wrap gap-1.5">
              {attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg py-1 px-2.5 text-xs text-gray-800 shadow-2xs"
                >
                  {file.type.startsWith('image/') ? (
                    <ImageIcon className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  )}
                  <span className="font-medium truncate max-w-[150px]">{file.name}</span>
                  <span className="text-[10px] text-gray-400">({formatFileSize(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="text-gray-400 hover:text-rose-500 rounded-full p-0.5"
                    title="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* WYSIWYG Content Area */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setBodyHtml(e.currentTarget.innerHTML)}
            className="w-full min-h-[160px] max-h-[300px] overflow-y-auto p-4 rounded-b-xl border border-t-0 border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a651]/30 leading-relaxed font-sans"
            data-placeholder="Type your message here..."
          />
        </div>

        {/* Scheduling & Rate Limits Box */}
        <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-200 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-900 uppercase tracking-wider">
            <Timer className="w-4 h-4 text-[#00a651]" />
            <span>Scheduling & Rate Limits</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Start Time Picker */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                Start Time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00a651]/30"
                required
              />
              {/* Presets */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => applyPresetTime(1)}
                  className="text-[10px] text-gray-500 hover:text-[#00a651] underline"
                >
                  Now (+1m)
                </button>
                <span className="text-[10px] text-gray-300">•</span>
                <button
                  type="button"
                  onClick={() => applyPresetTime(15)}
                  className="text-[10px] text-gray-500 hover:text-[#00a651] underline"
                >
                  +15m
                </button>
                <span className="text-[10px] text-gray-300">•</span>
                <button
                  type="button"
                  onClick={applyTomorrowMorning}
                  className="text-[10px] text-gray-500 hover:text-[#00a651] underline"
                >
                  Tomorrow 9AM
                </button>
              </div>
            </div>

            {/* Delay Between Emails */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                Delay (seconds)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00a651]/30"
                required
              />
              <p className="text-[10px] text-gray-400 mt-1">Spacing between lead sends</p>
            </div>

            {/* Hourly Limit */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-gray-500" />
                Hourly Limit
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full text-xs rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00a651]/30"
                required
              />
              <p className="text-[10px] text-gray-400 mt-1">Max dispatches per hour</p>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
};
