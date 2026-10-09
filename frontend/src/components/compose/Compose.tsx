import React, { useRef, useState, useEffect } from 'react';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Upload,
  Calendar,
  X,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  File,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Sender, ScheduleResponse, EmailAttachment } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

interface ComposeProps {
  onBack: () => void;
  onSuccess?: () => void;
  initialRecipients?: string[];
  initialSubject?: string;
  initialBody?: string;
}

export const Compose: React.FC<ComposeProps> = ({
  onBack,
  onSuccess,
  initialRecipients,
  initialSubject,
  initialBody,
}) => {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();

  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSender, setSelectedSender] = useState<string>(user?.email || '');
  const [senderDropdownOpen, setSenderDropdownOpen] = useState(false);

  const [recipients, setRecipients] = useState<string[]>(initialRecipients || []);
  const [inlineEmail, setInlineEmail] = useState<string>('');
  const [subject, setSubject] = useState<string>(initialSubject || '');
  const [delaySec, setDelaySec] = useState<string>('00');
  const [hourlyLimit, setHourlyLimit] = useState<string>('00');
  const [bodyHtml, setBodyHtml] = useState<string>(initialBody || '');

  // File Attachments
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);

  // "Send Later" Popover State
  const [isSendLaterOpen, setIsSendLaterOpen] = useState(false);
  const [customDateTime, setCustomDateTime] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.email) {
      setSelectedSender(user.email);
    }
  }, [user]);

  useEffect(() => {
    api
      .get<Sender[]>('/api/senders')
      .then((res) => {
        setSenders(res.data);
        if (res.data.length > 0) {
          const userSender = res.data.find((s) => s.email === user?.email);
          setSelectedSender(userSender ? userSender.email : user?.email || res.data[0].email);
        }
      })
      .catch((err) => console.warn('Could not load senders:', err));
  }, [user]);

  useEffect(() => {
    if (editorRef.current && initialBody) {
      editorRef.current.innerHTML = initialBody;
    }
  }, [initialBody]);

  const extractEmails = (text: string): string[] => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return (text.match(emailRegex) || []).map((e) => e.toLowerCase().trim());
  };

  const addEmails = (rawEmails: string[]) => {
    const valid = rawEmails.filter((email) =>
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
    );

    if (valid.length === 0) {
      toastWarning('No Valid Emails', 'No valid email addresses found.');
      return;
    }

    setRecipients((prev) => {
      const combined = Array.from(new Set([...prev, ...valid]));
      const added = combined.length - prev.length;
      if (added > 0) {
        toastSuccess('Emails Added', `Added ${added} email address${added !== 1 ? 'es' : ''}.`);
      }
      return combined;
    });
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || '');
      const parsed = extractEmails(content);
      if (parsed.length > 0) {
        addEmails(parsed);
      } else {
        toastWarning('No Leads Detected', 'No valid email addresses could be detected in this file.');
      }
    };
    reader.readAsText(file);
  };

  const handleAttachmentUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      // 10MB limit per file
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

  const removeRecipient = (toRemove: string) => {
    setRecipients((prev) => prev.filter((e) => e !== toRemove));
  };

  // Quick Preset Handlers for "Send Later" Popover
  const setPresetTomorrow = (hours = 9) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hours, 0, 0, 0);
    setScheduledTime(tomorrow);

    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const h = String(tomorrow.getHours()).padStart(2, '0');
    const m = String(tomorrow.getMinutes()).padStart(2, '0');
    setCustomDateTime(`${year}-${month}-${day}T${h}:${m}`);
  };

  const executeCommand = (cmd: string, val: string | undefined = undefined) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      setBodyHtml(editorRef.current.innerHTML);
    }
  };

  const handleSubmit = async () => {
    let allRecipients = [...recipients];
    if (inlineEmail.trim()) {
      const extra = extractEmails(inlineEmail);
      if (extra.length > 0) {
        allRecipients = Array.from(new Set([...allRecipients, ...extra]));
        setRecipients(allRecipients);
        setInlineEmail('');
      }
    }

    if (allRecipients.length === 0) {
      toastError('Missing Recipients', 'Please add or upload at least one email recipient.');
      return;
    }
    if (!subject.trim()) {
      toastError('Missing Subject', 'Please enter a subject line.');
      return;
    }
    const currentHtml = editorRef.current?.innerHTML || bodyHtml;
    if (!currentHtml.trim() || currentHtml === '<br>') {
      toastError('Missing Body', 'Please enter email body content.');
      return;
    }

    // Default start time: scheduledTime or now (+1 minute)
    const start = scheduledTime || new Date(Date.now() + 60 * 1000);
    const delayNum = parseInt(delaySec) || 2;
    const hourlyNum = parseInt(hourlyLimit) || 200;

    const matchedSender = senders.find((s) => s.email === selectedSender);

    setIsSubmitting(true);
    try {
      const payload = {
        subject: subject.trim(),
        bodyHtml: currentHtml,
        recipients: allRecipients,
        startTime: start.toISOString(),
        delayBetweenEmails: Math.max(0, delayNum * 1000),
        hourlyLimit: Math.max(1, hourlyNum),
        senderId: matchedSender?.id || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const res = await api.post<ScheduleResponse>('/api/emails/schedule', payload);
      toastSuccess('Success', `Scheduled ${res.data.count || allRecipients.length} email(s) for delivery.`);
      if (onSuccess) onSuccess();
      onBack();
    } catch (err: any) {
      toastError('Scheduling Failed', err.message || 'Could not schedule email campaign.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex-1 bg-white min-h-screen flex flex-col select-none relative">
      {/* Top Header matching Figma */}
      <header className="h-[70px] border-b border-gray-200 flex items-center justify-between px-7 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-700 hover:text-gray-900 p-1 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={19} />
          </button>
          <h2 className="text-lg font-medium text-gray-900">Compose New Email</h2>
        </div>

        {/* Right Action Icons & Send Later Button */}
        <div className="flex items-center gap-5 relative">
          {/* Paperclip with Badge (Attachment Trigger) */}
          <div
            onClick={() => attachmentInputRef.current?.click()}
            className="relative text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-full hover:bg-gray-100 transition-colors"
            title="Attach files to email"
          >
            <Paperclip size={18} />
            {attachments.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#00a651] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {attachments.length}
              </span>
            )}
          </div>
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              handleAttachmentUpload(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Clock Icon (Toggles Send Later Popover) */}
          <button
            type="button"
            onClick={() => setIsSendLaterOpen((prev) => !prev)}
            className={`p-1 rounded-full transition-colors ${
              scheduledTime ? 'text-[#00a651]' : 'text-gray-400 hover:text-gray-600'
            }`}
            title="Schedule Delivery Time"
          >
            <Clock size={18} />
          </button>

          {/* Send Later / Send Pill Button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="h-9 px-5 rounded-full border border-[#00a651] text-[#00a651] hover:bg-[#00a651] hover:text-white font-medium text-xs sm:text-sm flex items-center justify-center transition-all duration-150 active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? 'Scheduling...' : scheduledTime ? 'Send Later' : 'Send Later'}
          </button>

          {/* "Send Later" Popover Modal (Figma Screenshot 3) */}
          {isSendLaterOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsSendLaterOpen(false)}
              />
              <div className="absolute right-0 top-12 w-[300px] bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-40 animate-in fade-in zoom-in-95 duration-100">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Send Later</h4>

                {/* Custom Pick Date & Time */}
                <div className="relative mb-3">
                  <input
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => {
                      setCustomDateTime(e.target.value);
                      if (e.target.value) {
                        setScheduledTime(new Date(e.target.value));
                      }
                    }}
                    placeholder="Pick date & time"
                    className="w-full text-xs border border-gray-200 rounded-lg p-2.5 pr-8 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#00a651]"
                  />
                  <Calendar size={15} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
                </div>

                {/* Quick Presets matching Figma Screenshot 3 */}
                <div className="space-y-1 mb-4 text-xs text-gray-700">
                  <button
                    type="button"
                    onClick={() => setPresetTomorrow(9)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetTomorrow(10)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Tomorrow, 10:00 AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetTomorrow(11)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Tomorrow, 11:00 AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetTomorrow(15)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Tomorrow, 3:00 PM
                  </button>
                </div>

                {/* Popover Actions */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setScheduledTime(null);
                      setCustomDateTime('');
                      setIsSendLaterOpen(false);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSendLaterOpen(false)}
                    className="px-4 py-1.5 rounded-full border border-[#00a651] text-[#00a651] hover:bg-[#00a651] hover:text-white text-xs font-semibold transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Form Area */}
      <div className="flex-1 px-8 py-7 overflow-y-auto max-w-[1100px] w-full">
        {/* From Row matching Figma */}
        <div className="flex items-center gap-4 mb-5">
          <span className="w-16 text-xs text-gray-400 font-medium">From</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSenderDropdownOpen((prev) => !prev)}
              className="bg-[#f3f4f6] text-gray-800 text-xs font-medium px-3.5 py-1.5 rounded-md flex items-center gap-2 hover:bg-gray-200/80 transition-colors"
            >
              <span>{selectedSender}</span>
              <ChevronDown size={13} className="text-gray-500" />
            </button>

            {senderDropdownOpen && senders.length > 0 && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSenderDropdownOpen(false)}
                />
                <div className="absolute left-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 text-xs">
                  {senders.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSender(s.email);
                        setSenderDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 truncate"
                    >
                      {s.name ? `${s.name} <${s.email}>` : s.email}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* To Row matching Figma */}
        <div className="flex items-start gap-4 mb-5">
          <span className="w-16 text-xs text-gray-400 font-medium pt-2">To</span>
          <div className="flex-1 flex items-center justify-between border-b border-gray-100 pb-2.5 gap-3 flex-wrap">
            {/* Recipient Chips */}
            <div className="flex items-center gap-1.5 flex-wrap flex-1">
              {recipients.slice(0, 3).map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 border border-[#00a651] text-[#008c45] bg-white rounded-full px-3 py-0.5 text-xs font-medium"
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeRecipient(email)}
                    className="hover:text-rose-500 p-0.5 rounded-full"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}

              {/* Overflow Chip: e.g. +4 */}
              {recipients.length > 3 && (
                <span className="border border-[#00a651] text-[#008c45] bg-white rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  +{recipients.length - 3}
                </span>
              )}

              {/* Inline input */}
              <input
                value={inlineEmail}
                onChange={(e) => setInlineEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    if (inlineEmail.trim()) {
                      addEmails(extractEmails(inlineEmail));
                      setInlineEmail('');
                    }
                  }
                }}
                placeholder={recipients.length === 0 ? 'recipient@example.com' : 'Type recipient...'}
                className="outline-none text-xs text-gray-800 placeholder:text-gray-400 flex-1 min-w-[140px] p-0.5"
              />
            </div>

            {/* Upload List CTA matching Figma */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[#00a651] hover:text-[#008f45] flex items-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
            >
              <Upload size={14} />
              <span>Upload List</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* Detected count display per Requirement 3 */}
        {recipients.length > 0 && (
          <div className="pl-20 -mt-3 mb-4 text-xs font-medium text-[#008f45]">
            ● {recipients.length} email address{recipients.length === 1 ? '' : 'es'} detected
          </div>
        )}

        {/* Subject Row matching Figma */}
        <div className="flex items-center gap-4 mb-5 border-b border-gray-100 pb-2">
          <span className="w-16 text-xs text-gray-400 font-medium">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 outline-none text-xs text-gray-800 placeholder:text-gray-400"
          />
        </div>

        {/* Pacing & Rate Limits Row matching Figma */}
        <div className="flex items-center gap-8 mb-6 text-xs text-gray-700 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span>Delay between 2 emails</span>
            <input
              type="text"
              value={delaySec}
              onChange={(e) => setDelaySec(e.target.value)}
              placeholder="00"
              className="w-14 h-8 border border-gray-200 rounded-lg text-center text-xs text-gray-800 outline-none focus:border-[#00a651] bg-white"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <span>Hourly Limit</span>
            <input
              type="text"
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value)}
              placeholder="00"
              className="w-14 h-8 border border-gray-200 rounded-lg text-center text-xs text-gray-800 outline-none focus:border-[#00a651] bg-white"
            />
          </div>
        </div>

        {/* Attached Files List Bar */}
        {attachments.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-200">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Paperclip size={12} className="text-[#00a651]" />
              <span>Attached Files ({attachments.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg py-1.5 px-3 shadow-2xs text-xs text-gray-800"
                >
                  {file.type.startsWith('image/') ? (
                    <ImageIcon size={14} className="text-sky-500 shrink-0" />
                  ) : (
                    <FileText size={14} className="text-emerald-500 shrink-0" />
                  )}
                  <span className="font-medium truncate max-w-[180px]">{file.name}</span>
                  <span className="text-[10px] text-gray-400">({formatFileSize(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="text-gray-400 hover:text-rose-500 p-0.5 rounded-full"
                    title="Remove attachment"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rich Email Body Area matching Figma */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleAttachmentUpload(e.dataTransfer.files);
            }
          }}
          className="bg-[#f6f8f7] rounded-2xl min-h-[460px] p-6 flex flex-col relative"
        >
          {/* Floating Rich Formatting Toolbar matching Figma */}
          <div className="bg-white rounded-full px-5 py-2 shadow-2xs border border-gray-100 flex items-center gap-3 text-gray-500 text-xs w-fit select-none mb-4">
            <button
              type="button"
              onClick={() => executeCommand('undo')}
              className="hover:text-gray-900 cursor-pointer text-sm"
              title="Undo"
            >
              ↶
            </button>
            <button
              type="button"
              onClick={() => executeCommand('redo')}
              className="hover:text-gray-900 cursor-pointer text-sm"
              title="Redo"
            >
              ↷
            </button>
            <span className="text-gray-200">│</span>
            <button
              type="button"
              onClick={() => executeCommand('formatBlock', 'p')}
              className="hover:text-gray-900 cursor-pointer font-medium flex items-center gap-0.5"
              title="Typography"
            >
              <span>Tt</span>
              <ChevronDown size={10} />
            </button>
            <span className="text-gray-200">│</span>
            <button
              type="button"
              onClick={() => executeCommand('bold')}
              className="hover:text-gray-900 cursor-pointer font-bold"
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => executeCommand('italic')}
              className="hover:text-gray-900 cursor-pointer italic"
              title="Italic"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => executeCommand('underline')}
              className="hover:text-gray-900 cursor-pointer underline"
              title="Underline"
            >
              U
            </button>
            <span className="text-gray-200">│</span>
            <button
              type="button"
              onClick={() => executeCommand('justifyLeft')}
              className="hover:text-gray-900 cursor-pointer"
              title="Align Left"
            >
              ≡
            </button>
            <button
              type="button"
              onClick={() => executeCommand('insertUnorderedList')}
              className="hover:text-gray-900 cursor-pointer"
              title="Bullet List"
            >
              •
            </button>
            <button
              type="button"
              onClick={() => executeCommand('insertOrderedList')}
              className="hover:text-gray-900 cursor-pointer"
              title="Numbered List"
            >
              1.
            </button>
            <span className="text-gray-200">│</span>
            <button
              type="button"
              onClick={() => executeCommand('formatBlock', 'blockquote')}
              className="hover:text-gray-900 cursor-pointer font-serif"
              title="Quote"
            >
              ❝
            </button>
            <button
              type="button"
              onClick={() => executeCommand('strikeThrough')}
              className="hover:text-gray-900 cursor-pointer font-mono"
              title="Strikethrough"
            >
              S̶
            </button>
          </div>

          {/* Editor Container */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setBodyHtml(e.currentTarget.innerHTML)}
            className="flex-1 outline-none text-xs text-gray-800 leading-relaxed min-h-[340px]"
            data-placeholder="Type your reply..."
          />
        </div>
      </div>
    </section>
  );
};
