import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || (isProd ? 'https://reachinbox-hiring.vercel.app' : 'http://localhost:5173'),
  dbUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: Number(process.env.REDIS_PORT || 6379),
  esUrl: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  jwtSecret: process.env.JWT_SECRET || 'reachinbox-jwt-secret-change-in-production-32chars',
  concurrency: Number(process.env.WORKER_CONCURRENCY || 10),
  minDelayMs: Number(process.env.MIN_DELAY_MS || 2000),
  hourlyLimit: Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || 200),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '797767925332-85sijg7tginnta66f2ojfvm2n034r8cu.apps.googleusercontent.com',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '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',
  googleCallback: process.env.GOOGLE_CALLBACK_URL || (isProd ? 'https://reachinbox-hiring.onrender.com/auth/google/callback' : 'http://localhost:4000/auth/google/callback'),
  slackClientId: process.env.SLACK_CLIENT_ID || '',
  slackClientSecret: process.env.SLACK_CLIENT_SECRET || '',
  slackRedirect: process.env.SLACK_REDIRECT_URI || (isProd ? 'https://reachinbox-hiring.onrender.com/api/slack/callback' : 'http://localhost:4000/api/slack/callback'),
  etherealUser: process.env.ETHEREAL_USER || 'marjory.brown64@ethereal.email',
  etherealPass: process.env.ETHEREAL_PASSWORD || 'R34vyFT2nW45fDPTFT',
  etherealFrom: process.env.ETHEREAL_FROM || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
};


