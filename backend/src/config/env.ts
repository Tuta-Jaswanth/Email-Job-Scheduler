import 'dotenv/config';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  dbUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: Number(process.env.REDIS_PORT || 6379),
  esUrl: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  jwtSecret: process.env.JWT_SECRET || 'reachinbox-jwt-secret-change-in-production',
  concurrency: Number(process.env.WORKER_CONCURRENCY || 10),
  minDelayMs: Number(process.env.MIN_DELAY_MS || 2000),
  hourlyLimit: Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || 200),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleCallback: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/auth/google/callback',
  slackClientId: process.env.SLACK_CLIENT_ID || '',
  slackClientSecret: process.env.SLACK_CLIENT_SECRET || '',
  slackRedirect: process.env.SLACK_REDIRECT_URI || '',
  etherealUser: process.env.ETHEREAL_USER || '',
  etherealPass: process.env.ETHEREAL_PASSWORD || '',
  etherealFrom: process.env.ETHEREAL_FROM || '',
};

