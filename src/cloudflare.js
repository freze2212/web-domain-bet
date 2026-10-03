import { config } from "./config.js";
import { poll, sleep } from "./utils.js";
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
    const extra = (data.messages || []).map((m) => m.message).filter(Boolean).join("; ");
    const detail = [errors, extra].filter(Boolean).join(" — ");
    if (response.status === 429 && _retry429 < 6) {
      const waitMs = Math.min(90000, 6000 * 2 ** _retry429);
      console.warn(
        `[CF] 429 rate limit — chờ ${Math.round(waitMs / 1000)}s rồi thử lại (${_retry429 + 1}/6): ${method} ${path}`
      );
      await sleep(waitMs);
      return cfRequestFull(path, { method, headers, body, token: tokenOpt, _retry429: _retry429 + 1 });
    }
    throw new Error(`Cloudflare API ${response.status}: ${detail}`);
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

  const list = (await getAllPagesProjectsForAccount(accId, tOpts)) || [];

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
  // CF Pages list chỉ nhận per_page tối đa 10. per_page=25 trả 400 và danh sách rỗng.
  while (page <= 40) {
    let res;
    try {
      res = await cfRequestFull(
        `/accounts/${accId}/pages/projects?page=${page}&per_page=10`,
        reqOpts
      );
    } catch (err) {
      if (allProjects.length === 0) throw err;
      console.warn(`[Pages] list dừng ở page ${page}:`, err.message);
      break;
    }
    const items = res?.result;
    if (!items || !Array.isArray(items) || items.length === 0) break;
    allProjects.push(...items);
    const totalPages = res?.result_info?.total_pages || 1;
    if (page >= totalPages || items.length < 10) break;
    page++;
  }
  return allProjects;
}

/** Các instance gg88-lp-5uae, gg88-lp-5uae-2, … — không liệt kê cả account. */
async function listFamilyPagesProjects(accId, rootBase, token) {
  const tOpts = token ? { token } : {};
  const names = [rootBase];
  for (let i = 2; i <= 20; i++) names.push(`${rootBase}-${i}`);
  const found = [];
  let misses = 0;
  for (const name of names) {
    try {
      const proj = await cfRequest(
        `/accounts/${accId}/pages/projects/${encodeURIComponent(name)}`,
        tOpts
      );
      if (!proj?.name) {
        misses++;
      } else {
        found.push(proj);
        misses = 0;
      }
    } catch (err) {
      const msg = String(err.message || "");
      if (!/404|not found|10007|does not exist/i.test(msg)) throw err;
      misses++;
    }
    if (name !== rootBase && misses >= 2) break;
  }
  return found;
}

function customDomainCount(project) {
  const domains = Array.isArray(project?.domains) ? project.domains : [];
  return domains.filter((d) => !String(d).endsWith(".pages.dev")).length;
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

  const list = (await getAllPagesProjectsForAccount(accId, tOpts)) || [];

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

/** Pages nhận bản mới từ git push. Không upload folder bằng wrangler. */
export async function deployToAllPagesInstances() {
  return;
}

/** Giữ export để script cũ không crash. Không bao giờ upload folder. */
export async function forceDeployPagesProject() {
  throw new Error("Đã tắt wrangler. Pages chỉ cập nhật bằng git push, không upload folder.");
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

async function readHostDomainsJson(host, norm) {
  const res = await fetch(`https://${host}/domains.json?v=${Date.now()}`, {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return { host, readable: false, link: null };
  const j = await res.json();
  const e = j?.[norm] || j?.[`www.${norm}`];
  const raw = typeof e === "string" ? e : e?.main_url || e?.messenger_url || "";
  return { host, readable: true, link: raw ? normLiveLink(raw) : null };
}

async function probeDomainJsonLink(domain, extraHosts = []) {
  const norm = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const hosts = [...new Set([norm, `www.${norm}`, ...extraHosts].map((h) => String(h || "").trim()).filter(Boolean))];
  let sawFile = null;
  for (const host of hosts) {
    try {
      const row = await readHostDomainsJson(host, norm);
      if (row.link) return { host, link: row.link, readable: true };
      if (row.readable) sawFile = sawFile || { host, link: null, readable: true };
    } catch {}
  }
  return sawFile || { host: null, link: null, readable: false };
}

function deploymentCreatedMs(dep) {
  return new Date(dep?.created_on || dep?.modified_on || 0).getTime() || 0;
}

function deploymentSucceeded(dep) {
  const stage = dep?.latest_stage || {};
  return stage.name === "deploy" && stage.status === "success";
}

function deploymentFailed(dep) {
  const status = String(dep?.latest_stage?.status || "");
  return status === "failure" || status === "canceled";
}

async function readProjectDeployments(projectName, preferredAccountId) {
  const ids = [];
  for (const id of [preferredAccountId, getPrimaryAccountId(), getAdminAccountId()]) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  let lastErr = null;
  for (const accId of ids) {
    try {
      const deployments =
        (await cfRequest(
          `/accounts/${accId}/pages/projects/${encodeURIComponent(projectName)}/deployments?per_page=8`,
          { token: pagesTokenForAccount(accId) }
        )) || [];
      return { accountId: accId, deployments };
    } catch (err) {
      lastErr = err;
    }
  }
  return { accountId: preferredAccountId || null, deployments: [], error: lastErr?.message || "không đọc được deployment" };
}

const liveJsonWaitIds = new Set();

export function trackLiveJsonWait(historyId) {
  if (historyId) liveJsonWaitIds.add(historyId);
}

export function releaseLiveJsonWait(historyId) {
  liveJsonWaitIds.delete(historyId);
}

export function isLiveJsonWaitRunning(historyId) {
  return liveJsonWaitIds.has(historyId);
}

/**
 * Đợi domains.json live khớp link sau git push.
 * Không deploy folder lên project CNAME.
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
  const sinceMs = opts.sinceMs || Date.now();
  const projectHost = project ? `${project}.pages.dev` : "";
  const timeoutMs = opts.timeoutMs ?? 90000;
  const started = Date.now();
  let attempt = 0;
  let deployState = "waiting";
  let purgedAfterPublish = false;
  let projectMisses = 0;
  let apex = { host: null, link: null, readable: false };
  let published = { host: null, link: null, readable: false };

  async function purgeZone() {
    try {
      const zone = await findZoneByName(norm);
      if (!zone) return;
      await cfRequest(`/zones/${zone.id}/purge_cache`, {
        method: "POST",
        body: { purge_everything: true },
        token: tokenForZone(zone),
      }).catch(() => {});
    } catch {}
  }

  function pack(extra) {
    return {
      domain: norm,
      attempts: attempt,
      deployLog,
      sinceMs,
      project: project || null,
      deployState,
      ...extra,
    };
  }

  await purgeZone();

  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    if (project) {
      const snap = await readProjectDeployments(project, opts.accountId || null).catch(() => ({
        deployments: [],
      }));
      const fresh = (snap.deployments || []).filter((dep) => deploymentCreatedMs(dep) >= sinceMs - 20000);
      const failed = fresh.find(deploymentFailed);
      const succeeded = fresh.find(deploymentSucceeded);
      if (failed && !succeeded) {
        deployLog.error = failed.latest_stage?.status || "failure";
        return pack({
          ok: false,
          pending: false,
          link: null,
          host: null,
          error: `Pages deploy ${project} thất bại (${deployLog.error}). Git đã ghi link, deployment không lên.`,
        });
      }
      if (succeeded) {
        deployState = "success";
        deployLog.deployed = true;
      } else if (fresh.length) {
        deployState = "building";
      }
    }

    apex = await probeDomainJsonLink(norm);
    if (apex.link === want) {
      return pack({ ok: true, pending: false, link: apex.link, host: apex.host, error: null });
    }

    published = projectHost
      ? await readHostDomainsJson(projectHost, norm).catch(() => ({
          host: projectHost,
          readable: false,
          link: null,
        }))
      : { host: null, link: null, readable: false };
    const projectLink = published.link;
    const projectReadable = published.readable;

    if (projectLink === want) {
      deployState = "success";
      deployLog.deployed = true;
      if (!purgedAfterPublish) {
        purgedAfterPublish = true;
        await purgeZone();
      }
      apex = await probeDomainJsonLink(norm);
      if (apex.link === want) {
        return pack({ ok: true, pending: false, link: apex.link, host: apex.host, error: null });
      }
    } else if (deployState === "success" && projectReadable && projectLink && projectLink !== want) {
      projectMisses += 1;
      if (projectMisses >= 3) {
        return pack({
          ok: false,
          pending: false,
          link: projectLink,
          host: projectHost,
          error: `Live link lệch: live=${projectLink} | want=${want}`,
        });
      }
    } else if (deployState === "success" && projectReadable && !projectLink) {
      projectMisses += 1;
      if (projectMisses >= 3) {
        return pack({
          ok: false,
          pending: false,
          link: null,
          host: projectHost,
          error: `Pages ${project} đã deploy nhưng domains.json không có [${norm}]`,
        });
      }
    } else {
      projectMisses = 0;
    }

    await sleep(4000);
  }

  if (apex.link === want) {
    return pack({ ok: true, pending: false, link: apex.link, host: apex.host, error: null });
  }

  if (!opts.failIfPending) {
    return pack({
      ok: false,
      pending: true,
      link: apex.link || published.link || null,
      host: apex.host || published.host || null,
      error: null,
    });
  }

  if (published.link === want || (projectHost && published.host === projectHost && published.link === want)) {
    return pack({
      ok: false,
      pending: false,
      link: want,
      host: projectHost,
      error: `Pages ${project || "?"} đã có link nhưng ${norm} chưa nhận domains.json mới.`,
    });
  }

  if (deployState !== "success") {
    return pack({
      ok: false,
      pending: false,
      link: apex.link || null,
      host: apex.host || null,
      error: `Pages chưa phát xong bản mới của ${project || "?"} cho [${norm}]. Git đã ghi link.`,
    });
  }

  return pack({
    ok: false,
    pending: false,
    link: apex.link || null,
    host: apex.host || null,
    error: apex.link
      ? `Live link lệch: live=${apex.link} | want=${want}`
      : `Live chưa có entry domains.json cho [${norm}] (project=${project || "?"})`,
  });
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

  const removedFrom = [];
  const onlyProjects = (opts.onlyProjects || []).map((p) => String(p || "").trim()).filter(Boolean);
  if (onlyProjects.length > 0) {
    let hasDeleted = false;
    for (const accId of uniqueAccs) {
      for (const name of onlyProjects) {
        if (except.has(name.toLowerCase())) continue;
        const deleted = await deleteDomainFromPagesProject(accId, name, norm, reqOpts).catch(() => false);
        if (deleted) {
          hasDeleted = true;
          removedFrom.push(name);
        }
      }
    }
    return { hasDeleted, removedFrom };
  }

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
          if (deleted) {
            hasDeleted = true;
            removedFrom.push(p.name);
          }
        }
        if (hasDeleted && hintProjects.length > 0) break;
        if (hintProjects.length === 0) break;
      }
    } catch {}
  }

  if (hasDeleted) {
    await sleep(2000);
  }
  return { hasDeleted, removedFrom };
}

/**
 * Thêm Custom Domain vào Pages Project (Freze mặc định; opts.accountId = Admin khi mẫu UAE).
 * Cross-account (zone Admin → Pages Freze): KHÔNG xoá project cũ trước khi add xong
 * (tránh Error 1014 CNAME Cross-User Banned).
 */
export async function addPagesDomain(domain, projectName, templatePath = "", opts = {}) {
  domain = String(domain || "").trim().toLowerCase().replace(/^www\./, "");
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
    candidateProjects = await listFamilyPagesProjects(targetAccountId, rootBase, pagesToken);
  } catch (err) {
    console.warn(`[Pages Add Domain] Không đọc được family ${rootBase}: ${err.message}`);
  }

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

  // Instance mới (số lớn) còn chỗ. Instance cũ thường đã đầy 100 — đừng POST thử từng cái.
  candidateProjects.sort((a, b) => {
    const diff = customDomainCount(a) - customDomainCount(b);
    if (diff !== 0) return diff;
    const na = parseInt(String(a.name).match(/-(\d+)$/)?.[1] || "1", 10);
    const nb = parseInt(String(b.name).match(/-(\d+)$/)?.[1] || "1", 10);
    return nb - na;
  });
  const withRoom = candidateProjects.filter((p) => customDomainCount(p) < 98);
  if (withRoom.length > 0) candidateProjects = withRoom;

  const namesToAdd = [domain];
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

  function domainCount(p) {
    return Array.isArray(p?.domains) ? p.domains.length : 0;
  }

  // CF chỉ cho một custom domain trên một project. except mọi project anh em
  // khiến domain kẹt ở instance đầy (apex một nơi, www một nơi) và add luôn 400.
  const removedDuringMove = [];

  async function consolidateOnto(proj) {
    if (!proj?.name) return null;
    console.warn(`[Pages Add Domain] Chuyển ${domain} về ${proj.name} (gỡ khỏi project khác)`);
    const removed = await removeDomainFromAllPagesProjects(domain, targetAccountId, {
      exceptProjects: [proj.name],
      token: pagesToken,
    }).catch(() => ({ removedFrom: [] }));
    const added = await tryAddToProject(proj.name, proj.subdomain || proj.canonicalSubdomain || proj.name);
    if (!added) {
      for (const name of removed?.removedFrom || []) removedDuringMove.push(name);
    }
    return added;
  }

  async function restoreRemovedHosts() {
    const names = [...new Set(removedDuringMove.filter(Boolean))];
    if (!names.length) return;
    const apex = String(domain).toLowerCase().replace(/^www\./, "");
    for (const projName of names) {
      for (const host of [apex]) {
        try {
          await cfRequest(
            `/accounts/${targetAccountId}/pages/projects/${encodeURIComponent(projName)}/domains`,
            { method: "POST", body: { name: host }, ...tOpts }
          );
        } catch (err) {
          const msg = String(err.message || "");
          if (!/already exists|duplicate|already (been )?added|already been registered/i.test(msg)) {
            console.warn(`[Pages Add Domain] Không gắn lại ${host} vào ${projName}: ${msg}`);
          }
        }
      }
      console.warn(`[Pages Add Domain] Gắn mới thất bại — đã gắn lại ${apex} vào ${projName} để CNAME cũ không bị 522`);
    }
  }

  // 2) Đã nằm ở project anh em: gom apex + www vào project Git còn chỗ
  if (!successfulProject) {
    console.warn(`[Pages Add Domain] Add trực tiếp fail (${lastError}), gom về một project...`);
    const dest = [...candidateProjects]
      .filter((p) => domainCount(p) <= 98)
      .sort((a, b) => domainCount(a) - domainCount(b))[0];
    if (dest) successfulProject = await consolidateOnto(dest);
  }

  if (!successfulProject) {
    console.warn(`[Pages Add Domain] Vẫn fail, tạo instance mới...`);
    const targetProject = await getAvailablePagesProject(project, templatePath, targetAccountId);
    successfulProject = await consolidateOnto(targetProject);
  }

  if (!successfulProject) {
    await restoreRemovedHosts();
    throw new Error(
      `Không gắn được custom domain [${domain}] lên Pages [${project}] (acc ${targetAccountId.slice(0, 8)}…). ${lastError || "unknown"}`
    );
  }

  // Chỉ gỡ khỏi instance cùng mẫu. Không DELETE lần lượt mọi project của account.
  await removeDomainFromAllPagesProjects(domain, targetAccountId, {
    exceptProjects: [successfulProject.name],
    onlyProjects: candidateProjects.map((p) => p.name),
    token: pagesToken,
  }).catch(() => {});

  // Chờ active nếu DNS đã trỏ — với cross-account thường cần CNAME trước nên chỉ soft-wait ở đây
  try {
    await waitForPagesDomainActive(successfulProject.name, domain, targetAccountId, 8000, pagesToken);
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
      last = [apex].filter(Boolean);
      const apexOk = apex && apex.status === "active";
      // Apex active là đủ để đi tiếp. www pending không được giữ job thêm 2 phút.
      if (apexOk) {
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

  // Không giữ www. Bản ghi www khiến Pages tốn slot và www.domain ra 522 khi không còn custom hostname.
  const wwwHost = `www.${domain}`.toLowerCase();
  for (const rec of records || []) {
    const recName = String(rec.name || "").toLowerCase().replace(/\.$/, "");
    if (recName !== wwwHost) continue;
    await cfRequest(`/zones/${zone.id}/dns_records/${rec.id}`, { method: "DELETE", ...zOpts }).catch(() => {});
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
  const apex = String(domain || "").trim().toLowerCase().replace(/^www\./, "");
  for (const name of [apex, `www.${apex}`]) {
    await cfRequest(
      `/accounts/${acc}/pages/projects/${encodeURIComponent(proj)}/domains/${encodeURIComponent(name)}`,
      { method: "DELETE", ...tOpts }
    ).catch(() => {});
  }
  await sleep(1200);
  for (const name of [apex]) {
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
    const hit = [apex].filter(Boolean);
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
  // Chỉ gỡ 302 sau khi CNAME đã thay A 8.8.8.8. Gỡ trước đó thì request rơi vào dns.google.
  await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) });

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

  let projectName = "";
  if (customTarget && customTarget.includes(".pages.dev")) {
    projectName = customTarget.replace(".pages.dev", "").trim();
  }

  let finalTarget = customTarget;
  let pagesOk = false;
  try {
    const pagesResult = await addPagesDomain(domain, projectName, templatePath);
    if (pagesResult?.canonicalSubdomain) {
      finalTarget = pagesResult.canonicalSubdomain;
    }
    pagesOk = true;
  } catch {}

  await sleep(2000);
  const cname = await ensurePagesCname(domain, finalTarget);
  if (pagesOk && zone) {
    await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) });
  }
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

  if (zone.status && zone.status !== "active") {
    throw new Error(
      `Zone Cloudflare của [${domain}] đang "${zone.status}". Page Rule 302 chỉ tạo được khi zone active — chờ nameserver trỏ xong rồi đổi lại.`
    );
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

  try {
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
  } catch (err) {
    if (/403|Unauthorized to access requested resource/i.test(String(err.message || ""))) {
      const account = isAdminAccountZone(zone) ? "Admin" : "Freze";
      throw new Error(
        `Token Cloudflare ${account} đọc được Page Rule của [${domain}] nhưng không có quyền sửa. Bật Page Rules Edit cho token ${account} rồi đổi link lại.`
      );
    }
    throw err;
  }
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

    const wwwHost = `www.${domain}`.toLowerCase();
    for (const rec of records || []) {
      const recName = String(rec.name || "").toLowerCase().replace(/\.$/, "");
      if (recName !== wwwHost) continue;
      await cfRequest(`/zones/${zone.id}/dns_records/${rec.id}`, { method: "DELETE", ...zOpts }).catch(() => {});
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
