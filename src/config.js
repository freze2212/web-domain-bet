import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thiếu biến môi trường: ${name} (xem .env.example)`);
  return value;
}

function optionalEnv(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  spaceship: {
    baseUrl: "https://spaceship.dev/api",
    apiKey: () => optionalEnv("SPACESHIP_API_KEY"),
    apiSecret: () => optionalEnv("SPACESHIP_API_SECRET"),
    contactId: () => optionalEnv("SPACESHIP_CONTACT_ID"),
  },
  cloudflare: {
    baseUrl: "https://api.cloudflare.com/client/v4",
    token: () => optionalEnv("CLOUDFLARE_API_TOKEN"),
    accountId: () => optionalEnv("CLOUDFLARE_ACCOUNT_ID"),
    pagesProject: () => optionalEnv("CLOUDFLARE_PAGES_PROJECT"),
  },
  github: {
    token: () => optionalEnv("GITHUB_TOKEN"),
    owner: () => optionalEnv("GITHUB_OWNER"),
    repo: () => optionalEnv("GITHUB_REPO"),
    branch: () => optionalEnv("GITHUB_BRANCH", "main"),
    domainsPath: () => optionalEnv("DOMAINS_JSON_PATH", "domains.json"),
  },
};

export { requireEnv, optionalEnv };

export function validateFor(command) {
  const missing = [];

  if (["check", "contacts", "deploy", "setup"].includes(command)) {
    if (!config.spaceship.apiKey()) missing.push("SPACESHIP_API_KEY");
    if (!config.spaceship.apiSecret()) missing.push("SPACESHIP_API_SECRET");
  }

  if (command === "deploy") {
    if (!config.spaceship.contactId()) missing.push("SPACESHIP_CONTACT_ID");
    if (!config.cloudflare.token()) missing.push("CLOUDFLARE_API_TOKEN");
    if (!config.cloudflare.accountId()) missing.push("CLOUDFLARE_ACCOUNT_ID");
    if (!config.cloudflare.pagesProject()) missing.push("CLOUDFLARE_PAGES_PROJECT");
    if (!config.github.token()) missing.push("GITHUB_TOKEN");
    if (!config.github.owner()) missing.push("GITHUB_OWNER");
    if (!config.github.repo()) missing.push("GITHUB_REPO");
  }

  return missing;
}
