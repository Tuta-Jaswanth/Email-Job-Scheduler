export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';

export interface User {
  id: string;
  googleId?: string | null;
  name: string;
  email: string;
  avatar?: string | null;
  slackAccessToken?: string | null;
  createdAt?: string;
}

export interface Sender {
  id: string;
  email: string;
  name?: string | null;
  createdAt?: string;
}

export interface EmailAttachment {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
  url?: string;
}

export interface Email {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  bodyHtml: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatus;
  failureReason?: string | null;
  bullJobId?: string | null;
  isStarred?: boolean;
  attachments?: EmailAttachment[];
  createdAt: string;
  updatedAt: string;
  sender?: Sender;
}

export interface ReceivedEmail {
  id: string;
  userId: string;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  isRead: boolean;
  isStarred: boolean;
  attachments?: EmailAttachment[];
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulePayload {
  subject: string;
  bodyHtml: string;
  recipients: string[];
  startTime: string; // ISO string
  delayBetweenEmails: number; // in milliseconds
  hourlyLimit: number;
  senderId?: string;
  attachments?: EmailAttachment[];
}

export interface ScheduleResponse {
  count: number;
  emails: Email[];
  message?: string;
}

export type TabType = 'inbox' | 'scheduled' | 'sent';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}
