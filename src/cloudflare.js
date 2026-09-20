import { config } from "./config.js";
import { poll, sleep } from "./utils.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

function getPrimaryToken() {
  const token = config.cloudflare.token();
  if (!token) {
    throw new Error("Thiếu CLOUDFLARE_API_TOKEN");
  }
  return token;
}

function getPrimaryAccountId() {
  const accountId = config.cloudflare.accountId();
  if (!accountId) {
    throw new Error("Thiếu CLOUDFLARE_ACCOUNT_ID");
  }
  return accountId;
}

function isWranglerDeployEnabled() {
  return process.env.ALLOW_WRANGLER_DEPLOY === "true";
}

function getAdminToken() {
  return config.cloudflare.adminToken() || "";
}

function getAdminAccountId() {
  return config.cloudflare.adminAccountId() || "ddead9accc534c1eb074d2a46fffe748";
}

/** Zone thuộc CF Admin account? */
export function isAdminAccountZone(zone) {
  if (!zone) return false;
  const accId = zone.account?.id || zone.accountId || "";
  return Boolean(accId && accId === getAdminAccountId());
}

/** Token đúng account để sửa DNS / Page Rules của zone */
export function tokenForZone(zone) {
  if (isAdminAccountZone(zone) && getAdminToken()) return getAdminToken();
  // Freze: primary trước; caller dùng cfRequestZoneFallback / tokensForPageRules để thử Admin
  return getPrimaryToken();
}

/**
 * Token ghi Page Rules theo zone:
 * - Zone Admin → Admin token trước, Freze fallback (nếu Admin thiếu quyền Page Rules)
 * - Zone Freze → Freze trước, Admin fallback (All accounts / khi Freze token invalid)
 */
export function tokensForPageRules(zone) {
  const freze = getPrimaryToken();
  const admin = getAdminToken();
  if (isAdminAccountZone(zone)) {
    return [...new Set([admin, freze].filter(Boolean))];
  }
  return [...new Set([freze, admin].filter(Boolean))];
}

/** Gọi API zone; nếu 403 thì thử token tiếp theo (Admin DNS ok / Page Rules cần Freze) */
export async function cfRequestZoneFallback(zone, path, options = {}, tokenList = null) {
  const tokens = tokenList || [tokenForZone(zone), getPrimaryToken(), getAdminToken()].filter(Boolean);
  const unique = [...new Set(tokens)];
  let lastErr = null;
  for (const token of unique) {
    try {
      return await cfRequest(path, { ...options, token });
    } catch (err) {
      lastErr = err;
      if (!/403|401|Unauthorized|Authentication error|Invalid API Token/i.test(String(err.message || ""))) {
        throw err;
      }
      console.warn(`[CF] ${options.method || "GET"} ${path} → ${err.message} — thử token khác...`);
    }
  }
  throw lastErr || new Error("Cloudflare API thất bại (hết token)");
}

function pickBestZone(zones) {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const adminActive = zones.find((z) => z.status === "active" && isAdminAccountZone(z));
  const frezeActive = zones.find((z) => z.status === "active" && !isAdminAccountZone(z));
  const anyActive = zones.find((z) => z.status === "active");
  const pending = zones.find((z) => z.status === "pending" || z.status === "initializing");
  // DNS thật nằm ở zone active — ưu tiên Admin nếu đang active (gắn Pages Freze bằng CNAME)
  return adminActive || frezeActive || anyActive || pending || zones[0] || null;
}

export async function cfRequestFull(path, { method = "GET", headers = {}, body, token: tokenOpt, _retry429 = 0 } = {}) {
  const url = `${config.cloudflare.baseUrl}${path}`;
  const customAuth = headers?.Authorization || headers?.authorization;
  const customToken = customAuth ? customAuth.replace(/^Bearer\s+/i, "").trim() : null;

  const token = tokenOpt || customToken || getPrimaryToken();

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    const errors = data.errors?.map((e) => e.message).join("; ") || response.statusText;
    if (response.status === 429 && _retry429 < 6) {
      const waitMs = Math.min(90000, 6000 * 2 ** _retry429);
      console.warn(
        `[CF] 429 rate limit — chờ ${Math.round(waitMs / 1000)}s rồi thử lại (${_retry429 + 1}/6): ${method} ${path}`
      );
      await sleep(waitMs);
      return cfRequestFull(path, { method, headers, body, token: tokenOpt, _retry429: _retry429 + 1 });
    }
    throw new Error(`Cloudflare API ${response.status}: ${errors}`);
  }
  return data;
}

export async function cfRequest(path, options = {}) {
  const full = await cfRequestFull(path, options);
  return full?.result;
}

/** cfRequest dùng đúng token của zone (Admin vs Freze) */
export async function cfRequestForZone(zone, path, options = {}) {
  return cfRequest(path, { ...options, token: tokenForZone(zone) });
}

export async function createPagesProject(projectName, productionBranch = "main") {
  const accountId = getPrimaryAccountId();
  try {
    const res = await cfRequestFull(`/accounts/${accountId}/pages/projects`, {
      method: "POST",
      body: {
        name: projectName,
        production_branch: productionBranch,
      },
    });
    return res?.result || res;
  } catch (err) {
    if (err.message && (err.message.includes("already exists") || err.message.includes("409"))) {
      return { name: projectName };
    }
    throw err;
  }
}

function isGitConnectedPagesProject(project) {
  const t = (project?.source?.type || "").toLowerCase();
  return t === "github" || t === "gitlab";
}

/** Token Pages đúng account */
function pagesTokenForAccount(accountId) {
  const adminAcc = getAdminAccountId();
  if (accountId === adminAcc) return getAdminToken() || getPrimaryToken();
  return getPrimaryToken() || getAdminToken();
}

export async function getPagesProjectDomainsCount(accId, projectName, opts = {}) {
  try {
    const tok = opts.token || pagesTokenForAccount(accId);
    const proj = await cfRequest(
      `/accounts/${accId}/pages/projects/${encodeURIComponent(projectName)}`,
      { token: tok }
    );
    const domains = Array.isArray(proj?.domains) ? proj.domains : [];
    const custom = domains.filter((d) => !String(d).endsWith(".pages.dev"));
    if (custom.length > 0) return custom.length;

    // Fallback: list API (đôi khi project.domains thiếu)
    const data = await cfRequestFull(
      `/accounts/${accId}/pages/projects/${encodeURIComponent(projectName)}/domains?page=1`,
      { token: tok }
    );
    if (typeof data?.result_info?.total_count === "number") {
      return data.result_info.total_count;
    }
    return Array.isArray(data?.result) ? data.result.length : 0;
  } catch (err) {
    console.warn(`[Pages Capacity] Lỗi kiểm tra số lượng domains của ${projectName}:`, err.message);
    return 100; // An toàn: nếu lỗi thì giả định đã đầy để chuyển instance khác
  }
}

async function getPagesProjectMeta(accId, projectName, opts = {}) {
  const tok = opts.token || pagesTokenForAccount(accId);
  return cfRequest(`/accounts/${accId}/pages/projects/${encodeURIComponent(projectName)}`, { token: tok });
}

function pickGitSourceTemplate(matchingProjects) {
  const git = (matchingProjects || []).filter(isGitConnectedPagesProject);
  git.sort((a, b) => {
    const na = parseInt(a.name.match(/-(\d+)$/)?.[1] || "0", 10);
    const nb = parseInt(b.name.match(/-(\d+)$/)?.[1] || "0", 10);
    return nb - na;
  });
  return git[0]?.source || null;
}

async function triggerGithubDeploy(owner, repo, branch) {
  const ghToken = config.github.token();
  if (!ghToken || !owner || !repo || !branch) return false;
  const headers = {
    Authorization: `Bearer ${ghToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "web-ten-mien-hub",
    "Content-Type": "application/json",
  };
  try {
    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
      headers,
    });
    if (!refRes.ok) return false;
    const ref = await refRes.json();
    const parent = ref.object?.sha;
    if (!parent) return false;
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${parent}`, {
      headers,
    });
    if (!commitRes.ok) return false;
    const commit = await commitRes.json();
    const newCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `chore: trigger Pages deploy (${owner}/${repo}@${branch})`,
        tree: commit.tree.sha,
        parents: [parent],
      }),
    });
    if (!newCommitRes.ok) return false;
    const newCommit = await newCommitRes.json();
    await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: newCommit.sha }),
    });
    return true;
  } catch (err) {
    console.warn(`[Pages Capacity] Không trigger GitHub deploy: ${err.message}`);
    return false;
  }
}

async function waitForPagesDeploySuccess(accId, projectName, timeoutMs = 300000, opts = {}) {
  const tok = opts.token || pagesTokenForAccount(accId);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const deps = await cfRequest(
        `/accounts/${accId}/pages/projects/${encodeURIComponent(projectName)}/deployments?per_page=5`,
        { token: tok }
      );
      const ok = (deps || []).find(
        (d) => d.latest_stage?.name === "deploy" && d.latest_stage?.status === "success"
      );
      if (ok) return { ok: true, url: ok.url };
      const failed = (deps || []).find((d) => d.latest_stage?.status === "failure");
      if (failed) {
        throw new Error(
          `Pages deploy ${projectName} fail: ${failed.latest_stage?.status || "unknown"}`
        );
      }
    } catch (err) {
      if (/fail/i.test(err.message)) throw err;
    }
    await sleep(5000);
  }
  console.warn(`[Pages Capacity] Deploy ${projectName} chưa success trong ${timeoutMs / 1000}s — tiếp tục`);
  return { ok: false, pending: true };
}

/**
 * Tự tạo instance Pages Git-connected kế tiếp (vd. lp-gg88-vip-8) từ repo Git anh em.
 */
export async function createNextGitPagesInstance(rootBase, targetAccountId = null, opts = {}) {
  const accId = targetAccountId || getPrimaryAccountId();
  const tok = pagesTokenForAccount(accId);
  const tOpts = { token: tok, ...opts };

  let list = [];
  try {
    list = (await getAllPagesProjectsForAccount(accId, tOpts)) || [];
  } catch {}

  const matching = list.filter((p) => p.name === rootBase || p.name.startsWith(`${rootBase}-`));
  let maxIndex = 0;
  for (const p of matching) {
    const m = p.name.match(new RegExp(`^${rootBase}-(\\d+)$`));
    if (m) maxIndex = Math.max(maxIndex, parseInt(m[1], 10));
    if (p.name === rootBase) maxIndex = Math.max(maxIndex, 1);
  }
  const newName = `${rootBase}-${maxIndex + 1}`;

  try {
    const existing = await getPagesProjectMeta(accId, newName, tOpts);
    if (existing?.name) {
      const canonicalSubdomain = existing.subdomain?.endsWith(".pages.dev")
        ? existing.subdomain
        : `${existing.subdomain || newName}.pages.dev`;
      const domainsCount = await getPagesProjectDomainsCount(accId, newName, tOpts);
      console.log(`[Pages Capacity] ${newName} đã tồn tại (${domainsCount} custom domains)`);
      return { ...existing, name: newName, canonicalSubdomain, domainsCount };
    }
  } catch {}

  const sourceTemplate = pickGitSourceTemplate(matching);
  if (!sourceTemplate?.config) {
    throw new Error(
      `Không có instance Git mẫu cho ${rootBase} — không thể auto tạo ${newName}`
    );
  }

  const cfg = sourceTemplate.config;
  const branch = cfg.production_branch || "main";
  const body = {
    name: newName,
    production_branch: branch,
    build_config: {
      build_command: "",
      destination_dir: "",
      root_dir: "",
    },
    source: {
      type: sourceTemplate.type || "github",
      config: {
        owner: cfg.owner,
        owner_id: cfg.owner_id,
        repo_name: cfg.repo_name,
        repo_id: cfg.repo_id,
        production_branch: branch,
        deployments_enabled: true,
        production_deployments_enabled: true,
        pr_comments_enabled: false,
        preview_deployment_setting: "none",
        preview_branch_includes: ["*"],
        preview_branch_excludes: [],
        path_includes: ["*"],
        path_excludes: [],
      },
    },
  };

  console.log(
    `[Pages Capacity] Auto tạo Git Pages ${newName} ← ${cfg.owner}/${cfg.repo_name} (${branch})`
  );

  let created;
  try {
    created = await cfRequest(`/accounts/${accId}/pages/projects`, {
      method: "POST",
      body,
      ...tOpts,
    });
  } catch (err) {
    if (/already exists|409/i.test(String(err.message || ""))) {
      created = await getPagesProjectMeta(accId, newName, tOpts);
    } else {
      throw err;
    }
  }

  await triggerGithubDeploy(cfg.owner, cfg.repo_name, branch);
  await waitForPagesDeploySuccess(accId, newName, 300000, tOpts);

  const canonicalSubdomain = created.subdomain?.endsWith(".pages.dev")
    ? created.subdomain
    : `${created.subdomain || newName}.pages.dev`;
  return { ...created, name: newName, canonicalSubdomain, domainsCount: 0 };
}

export async function findZoneByName(domain) {
  const norm = (domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const found = [];

  async function queryZones(token, accountId) {
    if (!token) return;
    let path = `/zones?name=${encodeURIComponent(norm)}&per_page=5`;
    if (accountId) path += `&account.id=${encodeURIComponent(accountId)}`;
    try {
      const data = await cfRequestFull(path, { token });
      for (const z of data?.result || []) found.push(z);
    } catch (err) {
      console.warn(`[Cloudflare] findZoneByName (${accountId || "any"}):`, err.message);
    }
  }

  await queryZones(getPrimaryToken(), getPrimaryAccountId());
  const adminTok = getAdminToken();
  if (adminTok) {
    await queryZones(adminTok, getAdminAccountId());
  }

  // Dedupe by zone id
  const byId = new Map();
  for (const z of found) {
    if (z?.id) byId.set(z.id, z);
  }
  return pickBestZone([...byId.values()]);
}

export async function createZone(domain) {
  return cfRequest("/zones", {
    method: "POST",
    body: {
      name: domain,
      jump_start: false,
    },
  });
}

export async function getOrCreateZone(domain) {
  let zone = await findZoneByName(domain);
  if (zone) {
    // Zone Admin: chỉ dùng DNS Admin — không xoá/tạo zone Freze trùng
    if (isAdminAccountZone(zone)) {
      return zone;
    }
    if (zone.status === "moved" || zone.status === "deactivated") {
      console.log(`[Cloudflare] Zone ${domain} đang ở trạng thái không hợp lệ (${zone.status}), xoá và tạo lại mới...`);
      await cfRequest(`/zones/${zone.id}`, { method: "DELETE" }).catch(() => {});
      zone = await createZone(domain);
    }
    return zone;
  }

  zone = await createZone(domain);
  return zone;
}

export async function waitForZoneActive(domain, timeoutMs = 600000) {
  return poll(
    async () => {
      const zone = await findZoneByName(domain);
      return zone;
    },
    {
      label: `Cloudflare zone ${domain} active`,
      timeoutMs,
      intervalMs: 10000,
      isDone: (zone) => zone?.status === "active",
    },
  );
}

export function getZoneNameservers(zone) {
  if (Array.isArray(zone)) return zone;
  const hosts = zone?.name_servers || zone?.result?.name_servers;
  if (Array.isArray(hosts) && hosts.length > 0) {
    return hosts;
  }
  throw new Error("Không lấy được name_servers từ Cloudflare zone");
}

/**
 * Lấy thông tin dự án Pages và subdomain chính xác (canonical)
 */
export async function getPagesProject(projectName) {
  const project = projectName || config.cloudflare.pagesProject();
  const list = await getAllPagesProjectsForAccount(getPrimaryAccountId());
  const found = list?.find(
    (p) =>
      p.name === project ||
      p.subdomain === project ||
      `${p.subdomain}.pages.dev` === project ||
      `${p.name}.pages.dev` === project
  );
  if (found) {
    const canonicalSubdomain = found.subdomain.endsWith(".pages.dev")
      ? found.subdomain
      : `${found.subdomain}.pages.dev`;
    return { ...found, canonicalSubdomain };
  }

  return {
    name: project,
    subdomain: project,
    canonicalSubdomain: `${project}.pages.dev`,
  };
}

/**
 * Lấy toàn bộ danh sách Pages Projects của tài khoản có hỗ trợ phân trang đầy đủ (CF Pages giới hạn per_page=10)
 */
export async function getAllPagesProjectsForAccount(accId, opts = {}) {
  let page = 1;
  const allProjects = [];
  const reqOpts = opts.token ? { token: opts.token } : {};
  while (true) {
    try {
      const res = await cfRequestFull(
        `/accounts/${accId}/pages/projects?page=${page}&per_page=10`,
        reqOpts
      );
      const items = res?.result;
      if (!items || !Array.isArray(items) || items.length === 0) break;
      allProjects.push(...items);
      const totalPages = res?.result_info?.total_pages || 1;
      if (page >= totalPages) break;
      page++;
    } catch {
      break;
    }
  }
  return allProjects;
}

/**
 * Tự động tìm dự án Pages còn chỗ trống trên instance Git-connected
 */
export async function getAvailablePagesProject(baseProjectName, templatePath = "", targetAccountId = null) {
  const accId = targetAccountId || getPrimaryAccountId();
  const tok = pagesTokenForAccount(accId);
  const tOpts = { token: tok };
  let base = baseProjectName || config.cloudflare.pagesProject();
  if (base.includes(".pages.dev")) {
    base = base.replace(".pages.dev", "").trim();
  }

  let list = [];
  try {
    list = (await getAllPagesProjectsForAccount(accId, tOpts)) || [];
  } catch {}

  const rootBase = base.replace(/-\d+$/, "");
  const matchingProjects = list.filter(
    (p) => p.name === rootBase || p.name.startsWith(`${rootBase}-`)
  );

  let candidate = null;

  // Ưu tiên đúng tên base (template), rồi các instance Git khác theo thứ tự số
  const gitProjects = matchingProjects
    .filter(isGitConnectedPagesProject)
    .sort((a, b) => {
      if (a.name === base) return -1;
      if (b.name === base) return 1;
      const na = parseInt(a.name.match(/-(\d+)$/)?.[1] || "999", 10);
      const nb = parseInt(b.name.match(/-(\d+)$/)?.[1] || "999", 10);
      return na - nb;
    });

  for (const p of gitProjects) {
    const totalCount = await getPagesProjectDomainsCount(accId, p.name, tOpts);
    console.log(`[Pages Capacity] Dự án ${p.name} hiện có ${totalCount} custom domains`);
    if (totalCount < 95) {
      const canonicalSubdomain = p.subdomain.endsWith(".pages.dev")
        ? p.subdomain
        : `${p.subdomain}.pages.dev`;
      candidate = { ...p, domainsCount: totalCount, canonicalSubdomain };
      break;
    }
  }

  if (candidate) return candidate;

  console.warn(`[Pages Capacity] Các instance Git của ${rootBase} đã đầy — auto tạo instance mới...`);
  return createNextGitPagesInstance(rootBase, accId, tOpts);
}

/**
 * Deploy wrangler từ folder — CHỈ khi bật ALLOW_WRANGLER_DEPLOY=true.
 * Luồng chuẩn: git push → Cloudflare Pages (Git-connected) tự build.
 * Không dùng Direct Upload folder cho instance mở rộng.
 */
export async function deployToAllPagesInstances(baseProjectName, templatePath, targetAccountId = null) {
  if (!isWranglerDeployEnabled()) {
    console.log("[Deploy] Bỏ qua wrangler folder deploy (Git-only — đồng bộ qua git push)");
    return;
  }
  if (!templatePath || !baseProjectName) return;
  const accId = targetAccountId || getPrimaryAccountId();
  let base = baseProjectName.replace(".pages.dev", "").trim();
  const rootBase = base.replace(/-\d+$/, "");

  let projects = [];
  try {
    const list = await getAllPagesProjectsForAccount(accId);
    projects = (list || []).filter(
      (p) => p.name === rootBase || p.name.startsWith(`${rootBase}-`)
    );
  } catch (e) {
    projects = [{ name: rootBase }];
  }

  if (projects.length === 0) {
    projects = [{ name: rootBase }];
  }

  const token = getPrimaryToken();
  const finalAccId = accId || getPrimaryAccountId();

  const wranglerEnv = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_ACCOUNT_ID: finalAccId,
  };

  for (const p of projects) {
    try {
      console.log(`[Deploy] Wrangler (cờ ALLOW_WRANGLER_DEPLOY) → ${p.name}...`);
      await execAsync(
        `npx -y wrangler pages deploy "${templatePath}" --project-name "${p.name}" --commit-dirty=true`,
        { env: wranglerEnv, timeout: 120000 }
      );
      console.log(`[Deploy] ✅ Đã deploy thành công lên Pages: ${p.name}`);
    } catch (err) {
      console.warn(`[Deploy] ⚠️ Cảnh báo deploy ${p.name}:`, err.message);
    }
  }
}

/**
 * Force wrangler deploy 1 project cụ thể (bỏ qua ALLOW_WRANGLER_DEPLOY).
 * Dùng khi Git Pages queue kẹt — live cần domains.json ngay.
 */
export async function forceDeployPagesProject(projectName, templatePath, opts = {}) {
  let project = String(projectName || "")
    .trim()
    .replace(/\.pages\.dev$/i, "");
  if (!project || !templatePath) {
    throw new Error("Thiếu projectName hoặc templatePath để force deploy");
  }
  const fs = await import("node:fs");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template path không tồn tại: ${templatePath}`);
  }

  const adminAcc = getAdminAccountId();
  let accId = opts.accountId || null;
  if (!accId) {
    // Đoán account: thử Freze trước (vip-* nằm Freze), rồi Admin
    for (const cand of [getPrimaryAccountId(), adminAcc]) {
      try {
        const tok = pagesTokenForAccount(cand);
        const meta = await cfRequest(`/accounts/${cand}/pages/projects/${encodeURIComponent(project)}`, {
          token: tok,
        });
        if (meta?.name) {
          accId = cand;
          break;
        }
      } catch {}
    }
  }
  accId = accId || getPrimaryAccountId();
  const token = opts.token || pagesTokenForAccount(accId);

  // Chỉ truyền token/account cần thiết — tránh wrangler dính account Admin từ env PM2
  const wranglerEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME || "/root",
    LANG: process.env.LANG || "C.UTF-8",
    NODE_OPTIONS: process.env.NODE_OPTIONS || "",
    npm_config_yes: "true",
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_ACCOUNT_ID: accId,
  };

  console.log(`[Deploy] FORCE wrangler → ${project} (account ${String(accId).slice(0, 8)}…)`);
  await execAsync(
    `npx -y wrangler@3 pages deploy "${templatePath}" --project-name "${project}" --commit-dirty=true`,
    { env: wranglerEnv, timeout: opts.timeoutMs || 180000, cwd: templatePath }
  );
  console.log(`[Deploy] ✅ FORCE deploy xong: ${project}`);
  return { ok: true, project, accountId: accId };
}

/** Đọc CNAME Pages đang trỏ từ DNS zone (apex/www). */
export async function resolvePagesProjectFromDns(domain) {
  const norm = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const zone = await findZoneByName(norm).catch(() => null);
  if (!zone) return null;
  const token = tokenForZone(zone);
  const recs = (await cfRequest(`/zones/${zone.id}/dns_records?per_page=100`, { token })) || [];
  const interesting = recs.filter(
    (r) =>
      r.type === "CNAME" &&
      (r.name === norm || r.name === `www.${norm}`) &&
      /\.pages\.dev$/i.test(String(r.content || ""))
  );
  if (!interesting.length) return null;
  const content = String(interesting[0].content || "")
    .trim()
    .replace(/\.$/, "");
  return content.replace(/\.pages\.dev$/i, "") || null;
}

function normLiveLink(u) {
  return String(u || "")
    .trim()
    .replace(/\/$/, "");
}

async function probeDomainJsonLink(domain) {
  const norm = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const hosts = [norm, `www.${norm}`];
  for (const host of hosts) {
    try {
      const j = await (
        await fetch(`https://${host}/domains.json?v=${Date.now()}`, {
          headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache", pragma: "no-cache" },
          signal: AbortSignal.timeout(15000),
        })
      ).json();
      const e = j[norm] || j[`www.${norm}`];
      const link = typeof e === "string" ? e : e?.main_url || e?.messenger_url || null;
      if (link) return { host, link: normLiveLink(link) };
    } catch {}
  }
  return { host: null, link: null };
}

/**
 * Đảm bảo live domains.json đã có đúng link:
 * 1) force wrangler lên đúng Pages project (DNS CNAME / hint)
 * 2) purge cache
 * 3) poll live tới khi khớp (hoặc hết timeout)
 */
export async function ensureLiveDomainLink(domain, claimedLink, opts = {}) {
  const norm = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const want = normLiveLink(claimedLink);
  if (!norm || !want) throw new Error("Thiếu domain hoặc claimedLink");

  let project =
    String(opts.projectName || "")
      .trim()
      .replace(/\.pages\.dev$/i, "") ||
    String(opts.cnameTarget || "")
      .trim()
      .replace(/\.pages\.dev$/i, "") ||
    "";
  if (!project) {
    project = (await resolvePagesProjectFromDns(norm).catch(() => null)) || "";
  }
  if (!project && opts.fallbackProject) {
    project = String(opts.fallbackProject)
      .trim()
      .replace(/\.pages\.dev$/i, "");
  }

  const deployLog = { project: project || null, deployed: false, error: null };
  if (project && opts.templatePath) {
    try {
      await forceDeployPagesProject(project, opts.templatePath, {
        accountId: opts.accountId,
        timeoutMs: opts.deployTimeoutMs || 180000,
      });
      deployLog.deployed = true;
    } catch (err) {
      deployLog.error = err.message;
      console.warn(`[ensureLive] Force deploy ${project} lỗi:`, err.message);
    }
  } else {
    console.warn(
      `[ensureLive] Bỏ qua force deploy — project=${project || "?"} path=${opts.templatePath || "?"}`
    );
  }

  // Purge CF cache zone
  try {
    const zone = await findZoneByName(norm);
    if (zone) {
      await cfRequest(`/zones/${zone.id}/purge_cache`, {
        method: "POST",
        body: { purge_everything: true },
        token: tokenForZone(zone),
      }).catch(() => {});
    }
  } catch {}

  const timeoutMs = opts.timeoutMs ?? 90000;
  const started = Date.now();
  let last = { host: null, link: null };
  let attempt = 0;
  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    last = await probeDomainJsonLink(norm);
    if (last.link && last.link === want) {
      return {
        ok: true,
        domain: norm,
        link: last.link,
        host: last.host,
        attempts: attempt,
        deployLog,
      };
    }
    await sleep(4000);
  }

  return {
    ok: false,
    domain: norm,
    link: last.link,
    host: last.host,
    attempts: attempt,
    deployLog,
    error: last.link
      ? `Live link lệch: live=${last.link} | want=${want}`
      : `Live chưa có entry domains.json cho [${norm}] (project=${project || "?"})`,
  };
}

/**
 * Xóa tên miền khỏi Pages projects (Freze).
 * @param {string} domain
 * @param {string|null} targetAccountId
 * @param {{ exceptProjects?: string[] }} [opts] — giữ lại các project này (tránh 1014 khi chuyển mẫu)
 */
async function deleteDomainFromPagesProject(accId, projectName, norm, reqOpts) {
  const names = [norm, `www.${norm}`];
  let deleted = false;
  for (const n of names) {
    try {
      const delRes = await cfRequestFull(
        `/accounts/${accId}/pages/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(n)}`,
        { method: "DELETE", ...reqOpts }
      );
      if (delRes?.success) deleted = true;
    } catch (err) {
      const msg = String(err.message || "");
      if (!/not found|404|does not exist|10007/i.test(msg)) {
        throw err;
      }
    }
    await sleep(60);
  }
  return deleted;
}

function filterPagesProjectsByHints(list, hintProjects) {
  if (!hintProjects?.length) return list;
  const hints = hintProjects.map((h) => String(h).replace(/\.pages\.dev$/i, "").trim().toLowerCase()).filter(Boolean);
  if (!hints.length) return list;
  const filtered = list.filter((p) => {
    const n = String(p.name || "").toLowerCase();
    return hints.some((h) => n === h || n.startsWith(`${h}-`));
  });
  return filtered.length > 0 ? filtered : list.filter((p) => hints.includes(String(p.name || "").toLowerCase()));
}

export async function removeDomainFromAllPagesProjects(domain, targetAccountId = null, opts = {}) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const mainAcc = targetAccountId || getPrimaryAccountId();
  const except = new Set((opts.exceptProjects || []).map((p) => String(p).toLowerCase()));
  const accountsToClean = [mainAcc].filter(Boolean);
  const uniqueAccs = [...new Set(accountsToClean)];
  const reqOpts = opts.token ? { token: opts.token } : {};
  const hintProjects = opts.hintProjects || [];

  let hasDeleted = false;
  for (const accId of uniqueAccs) {
    try {
      const list = await getAllPagesProjectsForAccount(accId, reqOpts);
      if (!list || !Array.isArray(list) || list.length === 0) continue;

      const passLists = [];
      if (hintProjects.length > 0) {
        passLists.push(filterPagesProjectsByHints(list, hintProjects));
      }
      passLists.push(list);

      const tried = new Set();
      for (const projects of passLists) {
        for (const p of projects) {
          const key = String(p.name || "").toLowerCase();
          if (!key || except.has(key) || tried.has(key)) continue;
          tried.add(key);
          const deleted = await deleteDomainFromPagesProject(accId, p.name, norm, reqOpts);
          if (deleted) hasDeleted = true;
        }
        if (hasDeleted && hintProjects.length > 0) break;
        if (hintProjects.length === 0) break;
      }
    } catch {}
  }

  if (hasDeleted) {
    await sleep(2000);
  }
  return { hasDeleted };
}

/**
 * Thêm Custom Domain vào Pages Project (Freze mặc định; opts.accountId = Admin khi mẫu UAE).
 * Cross-account (zone Admin → Pages Freze): KHÔNG xoá project cũ trước khi add xong
 * (tránh Error 1014 CNAME Cross-User Banned).
 */
export async function addPagesDomain(domain, projectName, templatePath = "", opts = {}) {
  let project = projectName || config.cloudflare.pagesProject();
  if (project && project.includes(".pages.dev")) {
    project = project.replace(".pages.dev", "").trim();
  }

  const adminAcc = getAdminAccountId();
  const targetAccountId = opts.accountId || getPrimaryAccountId();
  // Freze account → Freze token trước; Admin Pages → Admin token trước
  const pagesToken =
    opts.token ||
    (targetAccountId === adminAcc
      ? getAdminToken() || getPrimaryToken()
      : getPrimaryToken() || getAdminToken());
  const tOpts = { token: pagesToken };

  const rootBase = project.replace(/-\d+$/, "");
  let candidateProjects = [];
  try {
    const list = (await getAllPagesProjectsForAccount(targetAccountId, tOpts)) || [];
    candidateProjects = list.filter(
      (p) => p.name === rootBase || p.name.startsWith(`${rootBase}-`)
    );
  } catch {}

  if (candidateProjects.length === 0) {
    candidateProjects = [{ name: project }];
  }

  const gitCandidates = candidateProjects.filter((p) => isGitConnectedPagesProject(p));
  if (gitCandidates.length > 0) {
    candidateProjects = gitCandidates;
  } else {
    console.warn(
      `[Pages Add Domain] ⚠️ Không có instance Git-connected cho ${rootBase} — tránh Direct Upload folder`
    );
  }

  candidateProjects.sort((a, b) => {
    const countA = Array.isArray(a.domains) ? a.domains.length : 0;
    const countB = Array.isArray(b.domains) ? b.domains.length : 0;
    return countA - countB;
  });

  const namesToAdd = [domain, `www.${domain}`];
  let successfulProject = null;
  let lastError = null;

  async function domainOnProject(projName, name) {
    try {
      await cfRequest(
        `/accounts/${targetAccountId}/pages/projects/${encodeURIComponent(projName)}/domains/${encodeURIComponent(name)}`,
        tOpts
      );
      return true;
    } catch {
      return false;
    }
  }

  async function tryAddToProject(projName, subdomainHint) {
    let anySuccess = false;
    for (const name of namesToAdd) {
      try {
        await cfRequest(
          `/accounts/${targetAccountId}/pages/projects/${encodeURIComponent(projName)}/domains`,
          { method: "POST", body: { name }, ...tOpts }
        );
        anySuccess = true;
      } catch (err) {
        const msg = String(err.message || "");
        if (/maximum number of allowed custom domains/i.test(msg)) {
          lastError = msg;
          return null; // project đầy 100 — thử instance khác
        }
        if (/already exists|duplicate|already (been )?added|already been registered/i.test(msg)) {
          // CF list domains hay trống; chỉ coi success khi GET đúng project này thấy domain
          if (await domainOnProject(projName, name)) {
            anySuccess = true;
          } else {
            lastError = `Domain đã đăng ký Pages nhưng không nằm trên ${projName} (orphan/khác project): ${msg}`;
          }
        } else {
          lastError = msg;
        }
      }
    }
    if (!anySuccess) return null;
    const apexNorm = String(domain).toLowerCase().replace(/^www\./, "");
    if (!(await domainOnProject(projName, apexNorm))) {
      try {
        await cfRequest(
          `/accounts/${targetAccountId}/pages/projects/${encodeURIComponent(projName)}/domains`,
          { method: "POST", body: { name: apexNorm }, ...tOpts }
        );
      } catch (err) {
        lastError = String(err.message || lastError || "");
      }
      if (!(await domainOnProject(projName, apexNorm))) {
        lastError = lastError || `Apex ${apexNorm} chưa gắn trên ${projName} (chỉ www → 522)`;
        return null;
      }
    }
    const subdomain = subdomainHint || projName;
    const canonicalSubdomain = subdomain.endsWith(".pages.dev")
      ? subdomain
      : `${subdomain}.pages.dev`;
    return { name: projName, canonicalSubdomain };
  }

  // 1) Add vào project mới TRƯỚC — không xoá chỗ cũ (giữ authorize cross-user)
  for (const p of candidateProjects) {
    const added = await tryAddToProject(p.name, p.subdomain || p.name);
    if (added) {
      successfulProject = added;
      console.log(`[Pages Add Domain] ✅ Gắn ${domain} → ${added.name} (acc ${targetAccountId.slice(0, 8)}…)`);
      break;
    }
  }

  // 2) Nếu bị chặn do domain đang ở project khác: gỡ chỗ khác rồi add lại ngay
  if (!successfulProject) {
    console.warn(`[Pages Add Domain] Add trực tiếp fail (${lastError}), dọn project khác rồi retry...`);
    const keepNames = candidateProjects.map((p) => p.name);
    await removeDomainFromAllPagesProjects(domain, targetAccountId, {
      exceptProjects: keepNames,
      token: pagesToken,
    }).catch(() => {});
    for (const p of candidateProjects) {
      const added = await tryAddToProject(p.name, p.subdomain || p.name);
      if (added) {
        successfulProject = added;
        break;
      }
    }
  }

  if (!successfulProject) {
    console.warn(`[Pages Add Domain] Vẫn fail, tạo instance mới...`);
    const targetProject = await getAvailablePagesProject(project, templatePath, targetAccountId);
    const actualProjectName = targetProject.name;
    const added = await tryAddToProject(actualProjectName, targetProject.canonicalSubdomain || actualProjectName);
    if (added) {
      successfulProject = added;
    }
  }

  if (!successfulProject) {
    throw new Error(
      `Không gắn được custom domain [${domain}] lên Pages [${project}] (acc ${targetAccountId.slice(0, 8)}…). ${lastError || "unknown"}`
    );
  }

  // 3) Sau khi đã có trên project đích: gỡ khỏi project khác
  await removeDomainFromAllPagesProjects(domain, targetAccountId, {
    exceptProjects: [successfulProject.name],
    token: pagesToken,
  }).catch(() => {});

  // Chờ active nếu DNS đã trỏ — với cross-account thường cần CNAME trước nên chỉ soft-wait ở đây
  try {
    await waitForPagesDomainActive(successfulProject.name, domain, targetAccountId, 45000, pagesToken);
  } catch (waitErr) {
    console.warn(`[Pages Add Domain] Chưa active (sẽ active sau CNAME): ${waitErr.message}`);
  }

  return {
    projectName: successfulProject.name,
    canonicalSubdomain: successfulProject.canonicalSubdomain,
    accountId: targetAccountId,
  };
}

/** Poll Pages custom domain until status=active (or timeout). */
export async function waitForPagesDomainActive(projectName, domain, accountId = null, timeoutMs = 90000, token = null) {
  const accId = accountId || getPrimaryAccountId();
  const apexName = String(domain || "").toLowerCase().replace(/^www\./, "");
  const wwwName = `www.${apexName}`;
  const started = Date.now();
  let last = [];
  const reqOpts = token ? { token } : {};

  async function getOne(name) {
    try {
      return await cfRequest(
        `/accounts/${accId}/pages/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(name)}`,
        reqOpts
      );
    } catch {
      return null;
    }
  }

  while (Date.now() - started < timeoutMs) {
    try {
      const apex = await getOne(apexName);
      const www = await getOne(wwwName);
      last = [apex, www].filter(Boolean);
      const apexOk = apex && apex.status === "active";
      // www có thể chưa add — chỉ bắt buộc khi GET thấy
      const wwwOk = !www || www.status === "active";
      if (apexOk && wwwOk) {
        return { ok: true, domains: last };
      }
    } catch {}
    await sleep(4000);
  }
  const pending = last.map((d) => `${d.name}:${d.status}`).join(", ");
  throw new Error(
    `Pages domain chưa active trong ${Math.round(timeoutMs / 1000)}s (${pending || "chưa thấy domain"}). Live có thể 522 tạm thời.`
  );
}

export async function disableForwardingPageRules(zoneId, opts = {}) {
  const tokens = [...new Set([opts.token, getPrimaryToken(), getAdminToken()].filter(Boolean))];
  let rules = [];
  let usedToken = tokens[0];
  for (const token of tokens) {
    try {
      rules = (await cfRequest(`/zones/${zoneId}/pagerules`, { token })) || [];
      usedToken = token;
      break;
    } catch {}
  }
  const forwardingRules = rules.filter((r) =>
    r.actions?.some((a) => a.id === "forwarding_url")
  );
  for (const rule of forwardingRules) {
    if (rule.status === "disabled") continue;
    for (const token of tokens) {
      try {
        await cfRequest(`/zones/${zoneId}/pagerules/${rule.id}`, {
          method: "PATCH",
          body: { status: "disabled" },
          token,
        });
        break;
      } catch {}
    }
  }
  return { disabledCount: forwardingRules.length, tokenUsed: usedToken ? "ok" : null };
}

/**
 * XOÁ hẳn mọi Page Rule forwarding (active + disabled).
 * Tự thử Admin + Freze token (zone Admin / quyền Page Rules khác nhau).
 */
export async function deleteForwardingPageRules(zoneId, opts = {}) {
  const tokens = [...new Set([opts.token, getPrimaryToken(), getAdminToken()].filter(Boolean))];
  let rules = [];
  for (const token of tokens) {
    try {
      rules = (await cfRequest(`/zones/${zoneId}/pagerules`, { token })) || [];
      break;
    } catch {}
  }
  const forwardingRules = rules.filter((r) =>
    r.actions?.some((a) => a.id === "forwarding_url")
  );
  let deletedCount = 0;
  for (const rule of forwardingRules) {
    let deleted = false;
    for (const token of tokens) {
      try {
        await cfRequest(`/zones/${zoneId}/pagerules/${rule.id}`, {
          method: "DELETE",
          token,
        });
        deleted = true;
        break;
      } catch {}
    }
    if (deleted) deletedCount++;
  }
  return { deletedCount };
}

/** Xoá Page Rule 302 — theo zone object (Admin/Freze + fallback) */
export async function deleteForwardingPageRulesForZone(zone) {
  if (!zone?.id) return { deletedCount: 0 };
  return deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) });
}

async function listPageRulesMultiToken(zoneId, opts = {}) {
  const tokens = [...new Set([opts.token, getPrimaryToken(), getAdminToken()].filter(Boolean))];
  for (const token of tokens) {
    try {
      const rules = await cfRequest(`/zones/${zoneId}/pagerules`, { token });
      return Array.isArray(rules) ? rules : [];
    } catch {}
  }
  return [];
}

export async function findActiveForwardingRule(zoneId, opts = {}) {
  try {
    const rules = await listPageRulesMultiToken(zoneId, opts);
    const forwardingRule = rules.find((r) =>
      r.status === "active" && r.actions?.some((a) => a.id === "forwarding_url")
    );
    if (!forwardingRule) return null;
    const action = forwardingRule.actions.find((a) => a.id === "forwarding_url");
    return {
      ruleId: forwardingRule.id,
      targetUrl: action?.value?.url || "",
      statusCode: action?.value?.status_code || 302,
      status: forwardingRule.status,
    };
  } catch {
    return null;
  }
}

/** Lấy Page Rule forwarding bất kỳ (active ưu tiên, rồi disabled) — dùng kế thừa link cũ. */
export async function findAnyForwardingRule(zoneId, opts = {}) {
  try {
    const rules = await listPageRulesMultiToken(zoneId, opts);
    const forwarding = rules.filter((r) =>
      r.actions?.some((a) => a.id === "forwarding_url")
    );
    if (forwarding.length === 0) return null;
    const preferred =
      forwarding.find((r) => r.status === "active") || forwarding[0];
    const action = preferred.actions.find((a) => a.id === "forwarding_url");
    return {
      ruleId: preferred.id,
      targetUrl: action?.value?.url || "",
      statusCode: action?.value?.status_code || 302,
      status: preferred.status,
    };
  } catch {
    return null;
  }
}

export async function removePagesDomain(domain, projectName) {
  if (!projectName) return { success: false, error: "Thiếu projectName" };
  try {
    let project = projectName;
    const target = await getPagesProject(project);
    project = target.name;

    await cfRequest(
      `/accounts/${config.cloudflare.accountId()}/pages/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(domain)}`,
      { method: "DELETE" }
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Đảm bảo bản ghi CNAME cho cả @ và www trỏ về Pages.
 * Zone Admin → Pages (Freze hoặc Admin): BẮT BUỘC đã add custom domain trên ĐÚNG account Pages
 * của project đích trước khi set CNAME proxied (tránh Error 1014).
 * Không yêu cầu zone Freze — DNS có thể nằm Admin, Pages có thể Freze (cross-account) hoặc Admin (same-account).
 */
export async function ensurePagesCname(domain, customTarget) {
  const zone = await getOrCreateZone(domain);
  let target = customTarget;
  if (!target) {
    const project = await getPagesProject();
    target = project.canonicalSubdomain;
  }
  if (target && !String(target).endsWith(".pages.dev")) {
    target = `${String(target).replace(/\.pages\.dev$/i, "")}.pages.dev`;
  }

  const projectGuess = String(target || "")
    .replace(/\.pages\.dev$/i, "")
    .trim();

  // Xác định account sở hữu Pages project (Freze hoặc Admin), rồi verify custom domain trước CNAME
  const pagesAcc = await resolvePagesAccountIdForProject(projectGuess);
  const present = await pagesAccountHasDomain(pagesAcc, domain, projectGuess);
  if (!present.ok) {
    throw new Error(
      `CNAME → ${target} cần custom domain trên Pages (acc ${pagesAcc.slice(0, 8)}…) trước (tránh Error 1014). ${present.detail}`
    );
  }

  // Domain có thể nằm instance overflow (vd gg88-lp-5uae-5) — CNAME phải trỏ đúng project đó
  if (present.project) {
    const actualTarget = present.project.endsWith(".pages.dev")
      ? present.project
      : `${present.project}.pages.dev`;
    if (actualTarget !== target) {
      console.warn(
        `[Pages CNAME] ${domain} gắn trên [${present.project}] — đổi CNAME ${target} → ${actualTarget} (tránh 522)`
      );
      target = actualTarget;
    }
  }

  const zOpts = { token: tokenForZone(zone) };

  // 1. Lấy tất cả DNS records của zone
  const records = await cfRequest(`/zones/${zone.id}/dns_records`, zOpts);

  // 2. Xóa các dummy A/AAAA record cũ (từ cấu hình 302 hoặc DNS cũ) để tránh xung đột CNAME
  const conflictingRecords = records?.filter(
    (r) =>
      (r.name === domain ||
        r.name === `${domain}.` ||
        r.name === `www.${domain}` ||
        r.name === `www.${domain}.`) &&
      (r.type === "A" || r.type === "AAAA")
  );
  for (const cRec of conflictingRecords || []) {
    await cfRequest(`/zones/${zone.id}/dns_records/${cRec.id}`, { method: "DELETE", ...zOpts }).catch(() => {});
  }

  // 3. Cập nhật hoặc tạo CNAME cho root domain (@)
  const existingRootCname = records?.find(
    (r) => (r.name === domain || r.name === `${domain}.`) && r.type === "CNAME"
  );
  if (existingRootCname) {
    if (existingRootCname.content !== target || !existingRootCname.proxied) {
      await cfRequest(`/zones/${zone.id}/dns_records/${existingRootCname.id}`, {
        method: "PUT",
        ...zOpts,
        body: {
          type: "CNAME",
          name: domain,
          content: target,
          proxied: true,
          ttl: 1,
        },
      });
    }
  } else {
    await cfRequest(`/zones/${zone.id}/dns_records`, {
      method: "POST",
      ...zOpts,
      body: {
        type: "CNAME",
        name: domain,
        content: target,
        proxied: true,
        ttl: 1,
      },
    });
  }

  // 4. Cập nhật hoặc tạo CNAME cho www
  const existingWwwCname = records?.find(
    (r) => (r.name === `www.${domain}` || r.name === `www.${domain}.`) && r.type === "CNAME"
  );
  if (existingWwwCname) {
    if (existingWwwCname.content !== target || !existingWwwCname.proxied) {
      await cfRequest(`/zones/${zone.id}/dns_records/${existingWwwCname.id}`, {
        method: "PUT",
        ...zOpts,
        body: {
          type: "CNAME",
          name: `www.${domain}`,
          content: target,
          proxied: true,
          ttl: 1,
        },
      });
    }
  } else {
    try {
      await cfRequest(`/zones/${zone.id}/dns_records`, {
        method: "POST",
        ...zOpts,
        body: {
          type: "CNAME",
          name: `www.${domain}`,
          content: target,
          proxied: true,
          ttl: 1,
        },
      });
    } catch {}
  }

  // Admin DNS → Freze Pages: nếu custom domain chưa active sau CNAME thì gắn lại (clear Cross-User Banned)
  if (isAdminAccountZone(zone) && projectGuess) {
    try {
      const pagesAcc = await resolvePagesAccountIdForProject(projectGuess);
      const zoneAcc = zone.account?.id || zone.accountId || "";
      if (pagesAcc && pagesAcc !== zoneAcc) {
        let needsReassert = true;
        try {
          const apex = await cfRequest(
            `/accounts/${pagesAcc}/pages/projects/${encodeURIComponent(projectGuess)}/domains/${encodeURIComponent(domain)}`,
            { token: pagesTokenForAccount(pagesAcc) }
          );
          needsReassert = !apex || String(apex.status || "").toLowerCase() !== "active";
        } catch {
          needsReassert = true;
        }
        if (needsReassert) {
          await reassertPagesCustomDomain(projectGuess, domain, pagesAcc);
        }
      }
    } catch (reErr) {
      console.warn(`[Pages CNAME] Re-assert cross-user: ${reErr.message}`);
    }
  }

  return { created: true, target, zoneId: zone.id, cfAccount: isAdminAccountZone(zone) ? "admin" : "freze" };
}

/**
 * Cross-account: DNS Admin + Pages Freze — sau khi CNAME đã set, gỡ/gắn lại custom domain
 * để CF authorize (tránh kẹt "CNAME Cross-User Banned" khi add lúc DNS cũ).
 */
export async function reassertPagesCustomDomain(projectName, domain, accountId = null) {
  const acc = accountId || getPrimaryAccountId();
  const tok = pagesTokenForAccount(acc);
  const tOpts = { token: tok };
  const proj = String(projectName || "").replace(/\.pages\.dev$/i, "").trim();
  if (!proj || !domain) return { ok: false, detail: "missing project/domain" };
  const names = [domain, `www.${domain}`];
  for (const name of names) {
    await cfRequest(
      `/accounts/${acc}/pages/projects/${encodeURIComponent(proj)}/domains/${encodeURIComponent(name)}`,
      { method: "DELETE", ...tOpts }
    ).catch(() => {});
  }
  await sleep(1200);
  for (const name of names) {
    try {
      await cfRequest(
        `/accounts/${acc}/pages/projects/${encodeURIComponent(proj)}/domains`,
        { method: "POST", body: { name }, ...tOpts }
      );
    } catch (err) {
      if (!/already exists|duplicate|already (been )?added|already been registered/i.test(String(err.message || ""))) {
        throw err;
      }
    }
  }
  console.log(`[Pages] Re-assert custom domain ${domain} → ${proj} (cross-user)`);
  return { ok: true, project: proj, accountId: acc };
}

/** Project Pages nằm account nào? (Freze rồi Admin) */
export async function resolvePagesAccountIdForProject(projectName) {
  const proj = String(projectName || "").replace(/\.pages\.dev$/i, "").trim();
  if (!proj) return getPrimaryAccountId();
  for (const acc of [getPrimaryAccountId(), getAdminAccountId()]) {
    if (!acc) continue;
    try {
      await cfRequest(`/accounts/${acc}/pages/projects/${encodeURIComponent(proj)}`, {
        token: pagesTokenForAccount(acc),
      });
      return acc;
    } catch {}
  }
  return getPrimaryAccountId();
}

/**
 * Chọn account Pages khi gắn domain:
 * - template.pagesAccountId nếu có
 * - zone Admin + project tồn tại trên Admin → Admin
 * - mặc định Freze (cross-account: DNS Admin + Pages Freze vẫn OK)
 */
export async function resolvePagesAccountIdForDomain(domain, pagesProject, explicitAccountId = null) {
  if (explicitAccountId) return explicitAccountId;
  const proj = String(pagesProject || "").replace(/\.pages\.dev$/i, "").trim();
  let zone = null;
  try {
    zone = await findZoneByName(domain);
  } catch {}
  if (zone && isAdminAccountZone(zone) && proj) {
    try {
      await cfRequest(`/accounts/${getAdminAccountId()}/pages/projects/${encodeURIComponent(proj)}`, {
        token: pagesTokenForAccount(getAdminAccountId()),
      });
      return getAdminAccountId();
    } catch {
      // Project VIP/… chỉ có Freze → vẫn gắn Freze Pages (DNS giữ Admin)
    }
  }
  if (proj) return resolvePagesAccountIdForProject(proj);
  return getPrimaryAccountId();
}

/** Kiểm tra domain đã nằm trên Pages của account chỉ định */
export async function pagesAccountHasDomain(accountId, domain, preferredProject = "") {
  const acc = accountId || getPrimaryAccountId();
  const tok = pagesTokenForAccount(acc);
  const norm = String(domain || "").toLowerCase().replace(/^www\./, "");
  const preferred = String(preferredProject || "").replace(/\.pages\.dev$/i, "").trim().toLowerCase();

  // CF GET /domains list thường trả [] dù domain vẫn tồn tại — luôn verify bằng GET /domains/{name}
  async function getDomain(projectName, name) {
    try {
      return await cfRequest(
        `/accounts/${acc}/pages/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(name)}`,
        { token: tok }
      );
    } catch {
      return null;
    }
  }

  async function checkProject(projectName) {
    const apex = await getDomain(projectName, norm);
    const www = await getDomain(projectName, `www.${norm}`);
    const hit = [apex, www].filter(Boolean);
    if (hit.length === 0) return null;
    return {
      ok: true,
      project: projectName,
      accountId: acc,
      statuses: hit.map((d) => `${d.name}:${d.status}`),
      detail: `found on ${projectName}`,
    };
  }

  if (preferred) {
    const hit = await checkProject(preferred);
    if (hit) return hit;
  }

  const projects = (await getAllPagesProjectsForAccount(acc, { token: tok })) || [];
  for (const p of projects) {
    if (preferred && String(p.name || "").toLowerCase() === preferred) continue;
    const hit = await checkProject(p.name);
    if (hit) return hit;
  }
  return { ok: false, detail: `Chưa thấy ${norm} trên Pages acc ${acc.slice(0, 8)}…` };
}

/** @deprecated dùng pagesAccountHasDomain — giữ alias tránh break import cũ */
export async function frezePagesHasDomain(domain, preferredProject = "") {
  return pagesAccountHasDomain(getPrimaryAccountId(), domain, preferredProject);
}

/**
 * Thiết lập toàn diện Cloudflare (Zone + DNS + Nameservers + Pages Domain)
 * Thứ tự chống 1014: Pages custom domain → CNAME → (Admin) chờ active
 */
export async function setupCloudflare(domain, customTarget, templatePath = "") {
  const zone = await getOrCreateZone(domain);
  const nameservers = getZoneNameservers(zone);

  await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) });

  let projectName = "";
  if (customTarget && customTarget.includes(".pages.dev")) {
    projectName = customTarget.replace(".pages.dev", "").trim();
  }

  let pagesResult = null;
  let finalTarget = customTarget;
  pagesResult = await addPagesDomain(domain, projectName, templatePath);
  if (pagesResult?.canonicalSubdomain) {
    finalTarget = pagesResult.canonicalSubdomain;
  }

  const cname = await ensurePagesCname(domain, finalTarget);

  // ensurePagesCname đã re-assert cross-user nếu cần; ở đây chỉ chờ SSL active
  if (isAdminAccountZone(zone) && pagesResult?.projectName) {
    try {
      await waitForPagesDomainActive(
        pagesResult.projectName,
        domain,
        pagesResult.accountId || getPrimaryAccountId(),
        180000
      );
    } catch (waitErr) {
      console.warn(`[Cloudflare] Admin cross-user chờ active: ${waitErr.message}`);
    }
  }

  return {
    zone,
    nameservers,
    needsNsPropagation: zone.status !== "active",
    pagesDomain: domain,
    target: finalTarget,
    project: pagesResult?.projectName || projectName,
    cname,
  };
}

export async function finishCloudflareAfterNs(domain, customTarget, templatePath = "") {
  await waitForZoneActive(domain);
  const zone = await findZoneByName(domain);
  if (zone) {
    await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) });
  }

  let projectName = "";
  if (customTarget && customTarget.includes(".pages.dev")) {
    projectName = customTarget.replace(".pages.dev", "").trim();
  }

  let finalTarget = customTarget;
  try {
    const pagesResult = await addPagesDomain(domain, projectName, templatePath);
    if (pagesResult?.canonicalSubdomain) {
      finalTarget = pagesResult.canonicalSubdomain;
    }
  } catch {}

  await sleep(2000);
  const cname = await ensurePagesCname(domain, finalTarget);
  return { pagesDomain: domain, cname, target: finalTarget };
}

// ── Cloudflare Page Rules (Chuyển hướng trực tiếp 301/302) ───────────────────
export async function getPageRules(zoneId, opts = {}) {
  try {
    return await cfRequest(`/zones/${zoneId}/pagerules`, opts);
  } catch (err) {
    return [];
  }
}

/** Lấy Page Rules — Admin zone: Admin token trước, Freze fallback */
export async function getPageRulesForZone(zone) {
  if (!zone?.id) return [];
  for (const token of tokensForPageRules(zone)) {
    try {
      const rules = await cfRequest(`/zones/${zone.id}/pagerules`, { token });
      return Array.isArray(rules) ? rules : [];
    } catch (err) {
      if (!/403|401|Unauthorized|Authentication/i.test(String(err.message || ""))) {
        console.warn(`[PageRules] GET fail:`, err.message);
      }
    }
  }
  return [];
}

export async function updateOrCreatePageRule(domain, targetUrl, statusCode = 302) {
  const zone = await findZoneByName(domain);
  if (!zone) {
    throw new Error(`Không tìm thấy Zone Cloudflare cho tên miền ${domain}`);
  }

  const rules = await getPageRulesForZone(zone);
  const forwardingRule = rules.find((r) =>
    r.actions?.some((a) => a.id === "forwarding_url")
  );

  const targetPattern = `*${domain}/*`;
  const ruleBody = {
    targets: [
      {
        target: "url",
        constraint: {
          operator: "matches",
          value: targetPattern,
        },
      },
    ],
    actions: [
      {
        id: "forwarding_url",
        value: {
          url: targetUrl,
          status_code: statusCode,
        },
      },
    ],
    status: "active",
  };

  if (forwardingRule) {
    const updated = await cfRequestZoneFallback(
      zone,
      `/zones/${zone.id}/pagerules/${forwardingRule.id}`,
      { method: "PUT", body: ruleBody },
      tokensForPageRules(zone)
    );
    return { action: "updated", rule: updated, zone, cfAccount: isAdminAccountZone(zone) ? "admin" : "freze" };
  }

  const created = await cfRequestZoneFallback(
    zone,
    `/zones/${zone.id}/pagerules`,
    { method: "POST", body: ruleBody },
    tokensForPageRules(zone)
  );
  return { action: "created", rule: created, zone, cfAccount: isAdminAccountZone(zone) ? "admin" : "freze" };
}

// ── Cài đặt trỏ 302 trực tiếp (Direct 302 Redirect) ─────────────────────────
export async function setupDirect302Redirect(domain, targetUrl, opts = {}) {
  // Gỡ khỏi Cloudflare Pages (ưu tiên project đúng mẫu — tránh quét hàng trăm project)
  await removeDomainFromAllPagesProjects(domain, null, {
    hintProjects: opts.hintProjects,
  }).catch(() => {});

  const zone = await getOrCreateZone(domain);
  const nameservers = getZoneNameservers(zone);
  const zOpts = { token: tokenForZone(zone) };

  // Tạo dummy A record trỏ tới 8.8.8.8 (proxied) để Cloudflare Edge bắt request và thực thi Page Rule 302
  try {
    const records = await cfRequest(`/zones/${zone.id}/dns_records`, zOpts);
    const rootA = records?.find(
      (r) => (r.name === domain || r.name === `${domain}.`) && (r.type === "A" || r.type === "CNAME")
    );
    if (!rootA) {
      await cfRequest(`/zones/${zone.id}/dns_records`, {
        method: "POST",
        ...zOpts,
        body: {
          type: "A",
          name: "@",
          content: "8.8.8.8",
          proxied: true,
          ttl: 1,
        },
      });
    } else {
      await cfRequest(`/zones/${zone.id}/dns_records/${rootA.id}`, {
        method: "PUT",
        ...zOpts,
        body: {
          type: "A",
          name: "@",
          content: "8.8.8.8",
          proxied: true,
          ttl: 1,
        },
      }).catch(async () => {
        if (!rootA.proxied) {
          await cfRequest(`/zones/${zone.id}/dns_records/${rootA.id}`, {
            method: "PATCH",
            ...zOpts,
            body: { proxied: true },
          });
        }
      });
    }

    const wwwA = records?.find((r) => r.name === `www.${domain}` || r.name === `www.${domain}.`);
    if (!wwwA) {
      await cfRequest(`/zones/${zone.id}/dns_records`, {
        method: "POST",
        ...zOpts,
        body: {
          type: "A",
          name: "www",
          content: "8.8.8.8",
          proxied: true,
          ttl: 1,
        },
      });
    } else {
      await cfRequest(`/zones/${zone.id}/dns_records/${wwwA.id}`, {
        method: "PUT",
        ...zOpts,
        body: {
          type: "A",
          name: "www",
          content: "8.8.8.8",
          proxied: true,
          ttl: 1,
        },
      }).catch(async () => {
        if (!wwwA.proxied) {
          await cfRequest(`/zones/${zone.id}/dns_records/${wwwA.id}`, {
            method: "PATCH",
            ...zOpts,
            body: { proxied: true },
          });
        }
      });
    }
  } catch (err) {
    console.error(`Lỗi tạo DNS dummy 8.8.8.8 cho 302 trên ${domain}:`, err.message);
  }

  // Tạo hoặc kích hoạt Page Rule 302
  const pageRule = await updateOrCreatePageRule(domain, targetUrl, 302);

  return {
    zone,
    nameservers,
    pageRule,
    accountName: isAdminAccountZone(zone)
      ? zone.account?.name || "Admin"
      : zone.account?.name || "Freze",
    cfAccountType: isAdminAccountZone(zone) ? "admin" : "freze",
  };
}
