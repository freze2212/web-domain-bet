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

export async function cfRequestFull(path, { method = "GET", headers = {}, body } = {}) {
  const url = `${config.cloudflare.baseUrl}${path}`;
  const customAuth = headers?.Authorization || headers?.authorization;
  const customToken = customAuth ? customAuth.replace(/^Bearer\s+/i, "").trim() : null;

  const token = customToken || getPrimaryToken();

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
    throw new Error(`Cloudflare API ${response.status}: ${errors}`);
  }
  return data;
}

export async function cfRequest(path, options = {}) {
  const full = await cfRequestFull(path, options);
  return full?.result;
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

export async function getPagesProjectDomainsCount(accId, projectName) {
  try {
    const data = await cfRequestFull(
      `/accounts/${accId}/pages/projects/${encodeURIComponent(projectName)}/domains`
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

export async function findZoneByName(domain) {
  const norm = (domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const accountId = getPrimaryAccountId();
  const data = await cfRequestFull(
    `/zones?name=${encodeURIComponent(norm)}&account.id=${encodeURIComponent(accountId)}`
  );
  if (!Array.isArray(data?.result) || data.result.length === 0) return null;
  const activeZone = data.result.find((z) => z.status === "active");
  const pendingZone = data.result.find((z) => z.status === "pending" || z.status === "initializing");
  return activeZone || pendingZone || data.result[0] || null;
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
export async function getAllPagesProjectsForAccount(accId) {
  let page = 1;
  const allProjects = [];
  while (true) {
    try {
      const res = await cfRequestFull(`/accounts/${accId}/pages/projects?page=${page}&per_page=10`);
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
  let base = baseProjectName || config.cloudflare.pagesProject();
  if (base.includes(".pages.dev")) {
    base = base.replace(".pages.dev", "").trim();
  }

  let list = [];
  try {
    list = (await getAllPagesProjectsForAccount(accId)) || [];
  } catch {}

  const rootBase = base.replace(/-\d+$/, "");
  const matchingProjects = list.filter(
    (p) => p.name === rootBase || p.name.startsWith(`${rootBase}-`)
  );

  let candidate = null;
  let maxIndex = 1;

  // Ưu tiên đúng tên base nếu là Git + còn chỗ, rồi các Git instance khác
  const ordered = [
    ...matchingProjects.filter((p) => p.name === base),
    ...matchingProjects.filter((p) => p.name !== base),
  ];

  for (const p of ordered) {
    const numMatch = p.name.match(new RegExp(`^${rootBase}-(\\d+)$`));
    if (numMatch) {
      const idx = parseInt(numMatch[1], 10);
      if (idx > maxIndex) maxIndex = idx;
    }

    if (!isGitConnectedPagesProject(p)) {
      console.log(`[Pages Capacity] Bỏ qua ${p.name} (không phải Git-connected)`);
      continue;
    }

    const totalCount = await getPagesProjectDomainsCount(accId, p.name);
    console.log(`[Pages Capacity] Dự án ${p.name} hiện có ${totalCount} domains`);
    if (totalCount < 95) {
      const canonicalSubdomain = p.subdomain.endsWith(".pages.dev")
        ? p.subdomain
        : `${p.subdomain}.pages.dev`;
      candidate = { ...p, domainsCount: totalCount, canonicalSubdomain };
      break;
    }
  }

  if (candidate) return candidate;

  const newProjectName = `${rootBase}-${maxIndex + 1}`;
  console.warn(
    `[Pages Capacity] Các instance Git của ${rootBase} đã đầy. Hãy tạo Pages project Git-connected mới (${newProjectName}) trên Cloudflare Dashboard — không auto Direct Upload.`
  );
  throw new Error(
    `Hết chỗ Pages Git-connected cho ${rootBase}. Tạo project Git mới (vd. ${newProjectName}) rồi gắn repo, không dùng Direct Upload folder.`
  );
}

function isGitConnectedPagesProject(project) {
  const t = (project?.source?.type || "").toLowerCase();
  return t === "github" || t === "gitlab";
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
 * Xóa tên miền khỏi tất cả các project Pages trên mọi tài khoản (để tránh lỗi duplicate 8000018)
 */
export async function removeDomainFromAllPagesProjects(domain, targetAccountId = null) {
  const norm = domain.trim().toLowerCase().replace(/^www\./, "");
  const mainAcc = targetAccountId || getPrimaryAccountId();
  const accountsToClean = [mainAcc].filter(Boolean);
  const uniqueAccs = [...new Set(accountsToClean)];

  let hasDeleted = false;
  for (const accId of uniqueAccs) {
    try {
      const list = await getAllPagesProjectsForAccount(accId);
      if (!list || !Array.isArray(list)) continue;
      const names = [norm, `www.${norm}`];
      
      await Promise.allSettled(
        list.map(async (p) => {
          for (const n of names) {
            try {
              const delRes = await cfRequestFull(
                `/accounts/${accId}/pages/projects/${encodeURIComponent(p.name)}/domains/${encodeURIComponent(n)}`,
                { method: "DELETE" }
              );
              if (delRes?.success) {
                hasDeleted = true;
              }
            } catch {}
          }
        })
      );
    } catch {}
  }

  if (hasDeleted) {
    await sleep(2000);
  }
}

/**
 * Thêm Custom Domain vào Pages Project (Hỗ trợ tự động mở rộng instance khi đầy và đa tài khoản)
 */
export async function addPagesDomain(domain, projectName, templatePath = "") {
  let project = projectName || config.cloudflare.pagesProject();
  if (project && project.includes(".pages.dev")) {
    project = project.replace(".pages.dev", "").trim();
  }

  // Khóa single-account: luôn dùng CLOUDFLARE_ACCOUNT_ID
  const targetAccountId = getPrimaryAccountId();

  // 1. Dọn dẹp domain khỏi các project cũ để tránh lỗi xung đột duplicate
  await removeDomainFromAllPagesProjects(domain, targetAccountId);

  // 2. Tìm danh sách tất cả các instance ứng viên (root, -2, -3, -6...)
  const rootBase = project.replace(/-\d+$/, "");
  let candidateProjects = [];
  try {
    const list = (await getAllPagesProjectsForAccount(targetAccountId)) || [];
    candidateProjects = list.filter(
      (p) => p.name === rootBase || p.name.startsWith(`${rootBase}-`)
    );
  } catch {}

  if (candidateProjects.length === 0) {
    candidateProjects = [{ name: project }];
  }

  // CHỈ dùng Pages Git-connected (git push = live). Bỏ qua Direct Upload.
  const gitCandidates = candidateProjects.filter((p) => isGitConnectedPagesProject(p));
  if (gitCandidates.length > 0) {
    candidateProjects = gitCandidates;
  } else {
    console.warn(
      `[Pages Add Domain] ⚠️ Không có instance Git-connected cho ${rootBase} — tránh Direct Upload folder`
    );
  }

  // Trong nhóm Git: instance ít domain hơn trước
  candidateProjects.sort((a, b) => {
    const countA = Array.isArray(a.domains) ? a.domains.length : 0;
    const countB = Array.isArray(b.domains) ? b.domains.length : 0;
    return countA - countB;
  });

  const namesToAdd = [domain, `www.${domain}`];
  let successfulProject = null;
  let lastError = null;

  for (const p of candidateProjects) {
    const projName = p.name;
    let anySuccess = false;

    for (const name of namesToAdd) {
      try {
        await cfRequest(
          `/accounts/${targetAccountId}/pages/projects/${encodeURIComponent(projName)}/domains`,
          {
            method: "POST",
            body: { name },
          }
        );
        anySuccess = true;
      } catch (err) {
        if (/already exists|duplicate|already been added/i.test(err.message)) {
          anySuccess = true;
        } else {
          lastError = err.message;
        }
      }
    }

    if (anySuccess) {
      const subdomain = p.subdomain || projName;
      const canonicalSubdomain = subdomain.endsWith(".pages.dev")
        ? subdomain
        : `${subdomain}.pages.dev`;
      successfulProject = {
        name: projName,
        canonicalSubdomain,
      };
      console.log(`[Pages Add Domain] ✅ Đã gắn thành công ${domain} vào Pages Project: ${projName}`);
      break;
    }
  }

  // Nếu tất cả instance hiện tại đều lỗi, tự động tạo instance mới
  if (!successfulProject) {
    console.warn(`[Pages Add Domain] Không thể add vào các instance hiện có (${lastError}), đang tạo instance mới...`);
    const targetProject = await getAvailablePagesProject(project, templatePath, targetAccountId);
    const actualProjectName = targetProject.name;
    
    for (const name of namesToAdd) {
      try {
        await cfRequest(
          `/accounts/${targetAccountId}/pages/projects/${encodeURIComponent(actualProjectName)}/domains`,
          {
            method: "POST",
            body: { name },
          }
        );
      } catch (e) {}
    }

    successfulProject = {
      name: actualProjectName,
      canonicalSubdomain: targetProject.canonicalSubdomain || `${actualProjectName}.pages.dev`,
    };
  }

  // Không wrangler-deploy folder tại đây. Live sync = git push vào Pages Git-connected.

  return {
    projectName: successfulProject.name,
    canonicalSubdomain: successfulProject.canonicalSubdomain,
  };
}

export async function disableForwardingPageRules(zoneId) {
  try {
    const rules = await getPageRules(zoneId);
    const forwardingRules = rules.filter((r) =>
      r.actions?.some((a) => a.id === "forwarding_url")
    );
    for (const rule of forwardingRules) {
      if (rule.status !== "disabled") {
        await cfRequest(`/zones/${zoneId}/pagerules/${rule.id}`, {
          method: "PATCH",
          body: { status: "disabled" },
        }).catch(() => {});
      }
    }
    return { disabledCount: forwardingRules.length };
  } catch (err) {
    return { disabledCount: 0, error: err.message };
  }
}

/**
 * XOÁ hẳn mọi Page Rule forwarding (active + disabled).
 * Không chỉ disable — rule zombie disabled vẫn dễ bị bật lại / làm lệch detect mode.
 */
export async function deleteForwardingPageRules(zoneId) {
  try {
    const rules = await getPageRules(zoneId);
    const forwardingRules = rules.filter((r) =>
      r.actions?.some((a) => a.id === "forwarding_url")
    );
    let deletedCount = 0;
    for (const rule of forwardingRules) {
      await cfRequest(`/zones/${zoneId}/pagerules/${rule.id}`, {
        method: "DELETE",
      });
      deletedCount++;
    }
    return { deletedCount };
  } catch (err) {
    return { deletedCount: 0, error: err.message };
  }
}

export async function findActiveForwardingRule(zoneId) {
  try {
    const rules = await getPageRules(zoneId);
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
export async function findAnyForwardingRule(zoneId) {
  try {
    const rules = await getPageRules(zoneId);
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
 * Đảm bảo bản ghi CNAME cho cả @ và www trỏ chính xác về canonical subdomain của Cloudflare Pages
 */
export async function ensurePagesCname(domain, customTarget) {
  const zone = await getOrCreateZone(domain);
  let target = customTarget;
  if (!target) {
    const project = await getPagesProject();
    target = project.canonicalSubdomain;
  }

  // 1. Lấy tất cả DNS records của zone
  const records = await cfRequest(`/zones/${zone.id}/dns_records`);

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
    await cfRequest(`/zones/${zone.id}/dns_records/${cRec.id}`, { method: "DELETE" }).catch(() => {});
  }

  // 3. Cập nhật hoặc tạo CNAME cho root domain (@)
  const existingRootCname = records?.find(
    (r) => (r.name === domain || r.name === `${domain}.`) && r.type === "CNAME"
  );
  if (existingRootCname) {
    if (existingRootCname.content !== target || !existingRootCname.proxied) {
      await cfRequest(`/zones/${zone.id}/dns_records/${existingRootCname.id}`, {
        method: "PUT",
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

  return { created: true, target };
}

/**
 * Thiết lập toàn diện Cloudflare (Zone + DNS + Nameservers + Pages Domain)
 */
export async function setupCloudflare(domain, customTarget, templatePath = "") {
  const zone = await getOrCreateZone(domain);
  const nameservers = getZoneNameservers(zone);

  // 1. Tự động xóa bất kỳ Page Rule 302 nào đang tồn tại trên zone để tránh chặn Landing Page
  await deleteForwardingPageRules(zone.id);

  // 2. Trích xuất project name từ customTarget
  let projectName = "";
  if (customTarget && customTarget.includes(".pages.dev")) {
    projectName = customTarget.replace(".pages.dev", "").trim();
  }

  // 3. Đăng ký Custom Domain trên Pages với cơ chế auto-scale dung lượng
  let pagesResult = null;
  let finalTarget = customTarget;
  try {
    pagesResult = await addPagesDomain(domain, projectName, templatePath);
    if (pagesResult?.canonicalSubdomain) {
      finalTarget = pagesResult.canonicalSubdomain;
    }
  } catch (e) {
    console.warn(`[Cloudflare] Lỗi addPagesDomain cho ${domain}:`, e.message);
  }

  // 4. Cài đặt CNAME chuẩn cho cả root và www
  let cname = null;
  try {
    cname = await ensurePagesCname(domain, finalTarget);
  } catch (e) {
    console.warn(`[Cloudflare] Lỗi ensurePagesCname cho ${domain}:`, e.message);
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
    await deleteForwardingPageRules(zone.id);
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
export async function getPageRules(zoneId) {
  try {
    return await cfRequest(`/zones/${zoneId}/pagerules`);
  } catch (err) {
    return [];
  }
}

export async function updateOrCreatePageRule(domain, targetUrl, statusCode = 302) {
  const zone = await findZoneByName(domain);
  if (!zone) {
    throw new Error(`Không tìm thấy Zone Cloudflare cho tên miền ${domain}`);
  }

  const rules = await getPageRules(zone.id);
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
    const updated = await cfRequest(`/zones/${zone.id}/pagerules/${forwardingRule.id}`, {
      method: "PUT",
      body: ruleBody,
    });
    return { action: "updated", rule: updated, zone };
  } else {
    const created = await cfRequest(`/zones/${zone.id}/pagerules`, {
      method: "POST",
      body: ruleBody,
    });
    return { action: "created", rule: created, zone };
  }
}

// ── Cài đặt trỏ 302 trực tiếp (Direct 302 Redirect) ─────────────────────────
export async function setupDirect302Redirect(domain, targetUrl) {
  // Gỡ khỏi tất cả Cloudflare Pages projects nếu trước đó đã gắn Pages
  await removeDomainFromAllPagesProjects(domain).catch(() => {});

  const zone = await getOrCreateZone(domain);
  const nameservers = getZoneNameservers(zone);

  // Tạo dummy A record trỏ tới 8.8.8.8 (proxied) để Cloudflare Edge bắt request và thực thi Page Rule 302
  try {
    const records = await cfRequest(`/zones/${zone.id}/dns_records`);
    const rootA = records?.find(
      (r) => (r.name === domain || r.name === `${domain}.`) && (r.type === "A" || r.type === "CNAME")
    );
    if (!rootA) {
      await cfRequest(`/zones/${zone.id}/dns_records`, {
        method: "POST",
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
            body: { proxied: true },
          });
        }
      });
    }

    const wwwA = records?.find((r) => r.name === `www.${domain}` || r.name === `www.${domain}.`);
    if (!wwwA) {
      await cfRequest(`/zones/${zone.id}/dns_records`, {
        method: "POST",
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
  };
}
