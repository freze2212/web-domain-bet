export function extractDomainsFromText(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return [...new Set(input.flatMap((item) => extractDomainsFromText(item)))];
  }
  if (typeof input !== "string") return [];

  // Match any domain-like string in text (handles https://, bullets, quotes, commas, newlines)
  const cleaned = input.replace(/[^\x20-\x7E\r\n\t]/g, " ");
  const rawTokens = cleaned.split(/[\r\n,;\s\t|]+/);
  const domains = [];

  for (let token of rawTokens) {
    token = token.trim();
    if (!token) continue;
    // Strip leading list numbers or bullets like "1. ", "1) ", "1- ", "-", "•", "*", ">", "#"
    token = token.replace(/^(\d+[\.\)\-]\s*|[\-*•>#]+\s*)/, "").trim();
    // Strip quotes or brackets
    token = token.replace(/[`"'()\[\]{}<>]/g, "").trim();
    // Strip protocol
    token = token.replace(/^https?:\/\//i, "").trim();
    // Strip path and query
    token = token.split("/")[0].split("?")[0].split("#")[0].split(":")[0].trim();
    // Strip trailing punctuation like '.', ',', ';', ':'
    token = token.replace(/[.,;:]+$/, "").trim().toLowerCase();

    if (
      token &&
      token.includes(".") &&
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(token)
    ) {
      domains.push(token);
    }
  }

  return [...new Set(domains)];
}

export function normalizeDomain(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Tên miền không được để trống");
  }
  const extracted = extractDomainsFromText(input);
  if (extracted.length > 0) {
    return extracted[0];
  }
  throw new Error(`Domain không hợp lệ: ${input}`);
}

export function normalizeUrl(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Link không được để trống");
  }
  let url = input.replace(/[`"'*]/g, "").trim();
  // Nếu người dùng nhập t.me/... hoặc www.... thì tự động thêm https://
  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z0-9-]+\.[a-z0-9.]+/i.test(url)) {
      url = `https://${url}`;
    } else {
      throw new Error(`Link phải bắt đầu bằng http:// hoặc https://: ${input}`);
    }
  }
  return url;
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function poll(fn, {
  label = "operation",
  intervalMs = 3000,
  timeoutMs = 300000,
  isDone = (result) => Boolean(result),
} = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (isDone(result)) return result;
    process.stdout.write(".");
    await sleep(intervalMs);
  }
  throw new Error(`Timeout chờ ${label} (${timeoutMs / 1000}s)`);
}

export function printStep(step, message) {
  console.log(`\n[${step}] ${message}`);
}

export function printOk(message) {
  console.log(`  ✓ ${message}`);
}

export function printWarn(message) {
  console.warn(`  ! ${message}`);
}

export function printErr(message) {
  console.error(`  ✗ ${message}`);
}
