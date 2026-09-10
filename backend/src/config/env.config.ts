import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AppConfig {
  port: number;
  jwtSecret: string;
  cfToken: string;
  cfAccountId: string;
  spaceshipApiKey: string;
  spaceshipApiSecret: string;
  telegramBotToken: string;
  telegramChatId: string;
  dataDir: string;
  rootDir: string;
  publicDir: string;
}

function loadEnvFile(rootPath: string) {
  const envPath = path.resolve(rootPath, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const rootDir = path.resolve(process.cwd(), '..');
loadEnvFile(rootDir);
loadEnvFile(process.cwd());

export const appConfig: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'freze_super_secret_jwt_key_2026_vip',
  cfToken: process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '',
  cfAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '',
  spaceshipApiKey: process.env.SPACESHIP_API_KEY || '',
  spaceshipApiSecret: process.env.SPACESHIP_API_SECRET || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  dataDir: path.resolve(rootDir, 'data'),
  rootDir: rootDir,
  publicDir: path.resolve(rootDir, 'public'),
};
