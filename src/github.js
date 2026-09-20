import { config } from "./config.js";
import { patchIndexHtmlLinks, stripDomainsJsonFallbacks } from "./lp-link-patch.js";

async function githubRequest(path, { method = "GET", body } = {}) {
  const url = `https://api.github.com${path}`;
  const headers = {
    Authorization: `Bearer ${config.github.token()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.message || response.statusText;
    throw new Error(`GitHub API ${response.status}: ${message}`);
  }

  return data;
}

function repoPath(subpath = "") {
  const owner = config.github.owner();
  const repo = config.github.repo();
  return `/repos/${owner}/${repo}/contents/${subpath}`;
}

export async function getDomainsJson() {
  try {
    const file = await githubRequest(
      repoPath(config.github.domainsPath()) + `?ref=${encodeURIComponent(config.github.branch())}`,
    );
    const content = Buffer.from(file.content, "base64").toString("utf8");
    return {
      sha: file.sha,
      data: JSON.parse(content),
    };
  } catch (err) {
    if (/404/.test(err.message)) {
      return { sha: null, data: {} };
    }
    throw err;
  }
}

export async function upsertDomainLink(domain, link) {
  const { sha, data } = await getDomainsJson();

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("domains.json phải là object { \"domain\": \"link\" }");
  }

  data[domain] = link;

  const sorted = Object.keys(data)
    .sort()
    .reduce((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {});

  const content = `${JSON.stringify(sorted, null, 2)}\n`;
  const body = {
    message: `chore: add domain ${domain}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: config.github.branch(),
  };

  if (sha) body.sha = sha;

  await githubRequest(repoPath(config.github.domainsPath()), {
    method: "PUT",
    body,
  });

  return { updated: true, domain, link };
}

/**
 * Patch index.html trên GitHub — hub trước đây chỉ push domains.json nên HTML vẫn hardcode link cũ
 */
export async function patchRepoIndexHtml(fullRepo, domain, newLink, { message } = {}) {
  if (!config.github.token()) {
    throw new Error("Thiếu GITHUB_TOKEN — không thể patch index.html");
  }
  const raw = String(fullRepo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const [owner, repo] = raw.split("/");
  if (!owner || !repo) throw new Error(`Repo Git không hợp lệ: ${fullRepo}`);

  const branch = config.github.branch() || "main";
  const filePath = "index.html";
  const apiPath = `/repos/${owner}/${repo}/contents/${filePath}`;

  let file;
  try {
    file = await githubRequest(`${apiPath}?ref=${encodeURIComponent(branch)}`);
  } catch (err) {
    if (/404/.test(err.message)) return { updated: false, skipped: true, reason: "no index.html" };
    throw err;
  }

  const html = Buffer.from(file.content, "base64").toString("utf8");
  const patched = patchIndexHtmlLinks(html, domain, newLink);
  if (patched === html) return { updated: false, unchanged: true };

  await githubRequest(apiPath, {
    method: "PUT",
    body: {
      message: message || `fix(html): sync link ${domain} (no hardcode fallback)`,
      content: Buffer.from(patched, "utf8").toString("base64"),
      branch,
      sha: file.sha,
    },
  });
  return { updated: true, repo: `${owner}/${repo}`, file: filePath };
}

/**
 * Upsert domain entry vào domains.json của một repo Git cụ thể (Pages Git-connected).
 * Dùng khi máy chạy hub không có clone .git (VPS) hoặc local push bị reject.
 */
export async function upsertDomainEntryInRepo(fullRepo, domain, entry, { message, patchHtml = true } = {}) {
  if (!config.github.token()) {
    throw new Error("Thiếu GITHUB_TOKEN — không thể đồng bộ domains.json lên Git Pages");
  }
  const raw = String(fullRepo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const [owner, repo] = raw.split("/");
  if (!owner || !repo) throw new Error(`Repo Git không hợp lệ: ${fullRepo}`);

  const branch = config.github.branch() || "main";
  const filePath = config.github.domainsPath() || "domains.json";
  const norm = String(domain || "").trim().toLowerCase().replace(/^www\./, "");
  if (!norm) throw new Error("Thiếu domain khi upsert GitHub domains.json");

  const apiPath = `/repos/${owner}/${repo}/contents/${filePath}`;
  let sha = null;
  let data = {};
  try {
    const file = await githubRequest(`${apiPath}?ref=${encodeURIComponent(branch)}`);
    sha = file.sha;
    data = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  } catch (err) {
    if (!/404/.test(err.message)) throw err;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${owner}/${repo}/${filePath} không phải object JSON hợp lệ`);
  }

  const payload =
    entry && typeof entry === "object"
      ? entry
      : { main_url: String(entry || ""), messenger_url: String(entry || "") };

  data[norm] = payload;
  data[`www.${norm}`] = payload;
  stripDomainsJsonFallbacks(data);

  const content = `${JSON.stringify(data, null, 2)}\n`;
  const body = {
    message: message || `fix(domains): add/sync ${norm}`,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  try {
    await githubRequest(apiPath, { method: "PUT", body });
  } catch (err) {
    if (!/409|sha/i.test(err.message)) throw err;
    const file = await githubRequest(`${apiPath}?ref=${encodeURIComponent(branch)}`);
    const latest = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
    latest[norm] = payload;
    latest[`www.${norm}`] = payload;
    stripDomainsJsonFallbacks(latest);
    await githubRequest(apiPath, {
      method: "PUT",
      body: {
        ...body,
        sha: file.sha,
        content: Buffer.from(`${JSON.stringify(latest, null, 2)}\n`, "utf8").toString("base64"),
      },
    });
  }

  let indexHtml = null;
  if (patchHtml) {
    const link = payload.main_url || payload.messenger_url || "";
    if (link) {
      indexHtml = await patchRepoIndexHtml(fullRepo, norm, link, {
        message: message ? `${message} (index.html)` : undefined,
      }).catch((err) => ({ updated: false, error: err.message }));
    }
  }

  return { updated: true, repo: `${owner}/${repo}`, domain: norm, indexHtml };
}

export async function upsertDomainEntriesInRepo(fullRepo, entries, { message } = {}) {
  if (!config.github.token()) {
    throw new Error("Thiếu GITHUB_TOKEN — không thể đồng bộ domains.json lên Git Pages");
  }
  const raw = String(fullRepo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
  const [owner, repo] = raw.split("/");
  if (!owner || !repo) throw new Error(`Repo Git không hợp lệ: ${fullRepo}`);

  const branch = config.github.branch() || "main";
  const filePath = config.github.domainsPath() || "domains.json";
  const apiPath = `/repos/${owner}/${repo}/contents/${filePath}`;

  const file = await githubRequest(`${apiPath}?ref=${encodeURIComponent(branch)}`);
  const data = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  for (const item of entries) {
    const norm = String(item.domain || "").trim().toLowerCase().replace(/^www\./, "");
    if (!norm) continue;
    const payload = item.entry;
    data[norm] = payload;
    data[`www.${norm}`] = payload;
  }

  await githubRequest(apiPath, {
    method: "PUT",
    body: {
      message: message || `fix(domains): batch sync ${entries.length} domains`,
      content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`, "utf8").toString("base64"),
      branch,
      sha: file.sha,
    },
  });

  return { updated: entries.length, repo: `${owner}/${repo}` };
}
