import { config } from "./config.js";

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
