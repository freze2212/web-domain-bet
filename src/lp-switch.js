import { config } from "./config.js";
import {
  addPagesDomain,
  ensurePagesCname,
  findZoneByName,
  tokenForZone,
  deleteForwardingPageRules,
  waitForPagesDomainActive,
  ensureLiveDomainLink,
  removeDomainFromAllPagesProjects,
  pagesTokenForAccount,
  resolvePagesAccountIdForDomain,
} from "./cloudflare.js";
import { updateTemplateDomainsJson } from "./templates.js";
import { findDomainInRepos, removeDomainFromRepo, findServingTemplate, sameTemplateFolder } from "./repo-scanner.js";
import { getServingPagesProject, readApexCnameProject } from "./pages-domain-map.js";
import { NO_LINK_ERROR } from "./link-resolve.js";

const stripPagesDev = (s) => String(s || "").trim().replace(/\.pages\.dev$/i, "");

/**
 * Đổi miền sang mẫu LP mà không để miền rơi vào link mặc định của mẫu:
 * 1. ghi link vào mẫu mới, chờ xxx.pages.dev phát link (DNS vẫn trỏ chỗ cũ)
 * 2. gắn Pages  3. trỏ CNAME  4. xác nhận miền đã chạy mẫu mới  5. mới dọn chỗ cũ.
 * Lỗi trước bước 3 thì chỗ cũ còn nguyên; bước 5 chỉ chạy khi bước 4 xác nhận xong.
 */
export async function switchDomainToTemplate({ domain, template, link, tele = "", pagesOpts = {}, onProgress = () => {} }) {
  if (!link) throw new Error(NO_LINK_ERROR);
  if (!template?.pagesProject) throw new Error(`Mẫu [${template?.name || "?"}] chưa có project Pages`);
  const zoneNow = await findZoneByName(domain).catch(() => null);
  if (zoneNow?.status && zoneNow.status !== "active") {
    throw new Error(
      `Zone Cloudflare của [${domain}] đang "${zoneNow.status}" (NS vừa đổi, chưa nhận) — Pages chưa thể chạy trên miền. Chưa đổi gì, miền vẫn chạy chỗ cũ. Chờ zone active (vài phút đến vài giờ) rồi đổi lại.`
    );
  }
  const accountId =
    pagesOpts.accountId ||
    (await resolvePagesAccountIdForDomain(domain, template.pagesProject, template.pagesAccountId || null).catch(() => null)) ||
    template.pagesAccountId ||
    config.cloudflare.accountId();
  const rootProject = stripPagesDev(template.cnameTarget) || template.pagesProject;

  const oldProjects = [...(getServingPagesProject(domain)?.projects || [])];

  const current = findServingTemplate(domain);
  if (current?.template?.id === template.id) {
    onProgress(`Miền đã chạy mẫu [${template.name}] — chỉ cập nhật link...`);
    const sync = await updateTemplateDomainsJson(template, domain, link, tele, {
      pagesProject: current.project,
      accountId,
      liveTimeoutMs: 8 * 60_000,
    });
    if (!sync?.liveEnsure?.ok) throw new Error(sync?.liveEnsure?.error || "Live chưa nhận link mới");
    onProgress("Đang dọn miền khỏi mẫu cũ (nếu lần đổi trước còn sót)...");
    const cleaned = await cleanupOldPlaces(domain, template, current.project, oldProjects);
    return { sameTemplate: true, finalTarget: `${current.project}.pages.dev`, ...cleaned };
  }

  // 1. Mẫu mới phát link trước khi có khách vào
  onProgress(`Đang ghi link vào mẫu [${template.name}] (miền vẫn chạy chỗ cũ)...`);
  const sinceMs = Date.now();
  const sync = await updateTemplateDomainsJson(template, domain, link, tele, { skipLiveEnsure: true });
  const addedEntry = !sync?.isExisting;
  const rollbackEntry = async () => {
    if (addedEntry) await removeDomainFromRepo(domain, template.path).catch(() => {});
  };

  onProgress(`Đang chờ Pages [${rootProject}] phát link mới...`);
  const built = await ensureLiveDomainLink(domain, link, {
    projectName: rootProject,
    accountId,
    sinceMs,
    timeoutMs: 8 * 60_000,
    projectOnly: true,
  });
  if (!built.ok) {
    await rollbackEntry();
    throw new Error(`Chưa đổi gì trên miền, miền vẫn chạy chỗ cũ. ${built.error}`);
  }

  // 2. Gắn custom domain (DNS chưa đổi)
  onProgress(`Đang gắn miền vào Pages [${template.pagesProject}]...`);
  let pagesRes;
  try {
    pagesRes = await addPagesDomain(domain, template.pagesProject, template.path, { accountId, ...pagesOpts });
  } catch (err) {
    await rollbackEntry();
    throw new Error(`Gắn Pages thất bại, miền vẫn chạy chỗ cũ. ${err.message}`);
  }
  const finalTarget = pagesRes?.canonicalSubdomain || template.cnameTarget;
  const instance = stripPagesDev(finalTarget);
  if (instance && instance !== rootProject) {
    onProgress(`Đang chờ [${instance}] phát link mới...`);
    const b2 = await ensureLiveDomainLink(domain, link, {
      projectName: instance,
      accountId,
      sinceMs,
      timeoutMs: 5 * 60_000,
      projectOnly: true,
    });
    if (!b2.ok) throw new Error(`Đã gắn Pages [${instance}] nhưng chưa trỏ DNS. ${b2.error}`);
  }

  // 3. Chuyển khách sang mẫu mới
  onProgress(`Đang trỏ CNAME → ${finalTarget}...`);
  await ensurePagesCname(domain, finalTarget);
  const zone = await findZoneByName(domain).catch(() => null);
  if (zone) {
    onProgress("Đang gỡ Page Rule 302 sau khi CNAME đã trỏ...");
    await deleteForwardingPageRules(zone.id, { token: tokenForZone(zone) }).catch(() => {});
  }

  // 4. Xác nhận: CNAME đúng project, Pages active, miền phát đúng link
  onProgress("Đang xác nhận miền đã chạy mẫu mới...");
  const cnameNow = await readApexCnameProject(domain).catch(() => null);
  if (cnameNow && cnameNow !== instance) {
    throw new Error(`CNAME đang trỏ ${cnameNow}, không phải ${instance}. Chưa dọn chỗ cũ.`);
  }
  let pagesActive = true;
  try {
    await waitForPagesDomainActive(instance, domain, accountId, 120_000, pagesTokenForAccount(accountId));
  } catch {
    pagesActive = false;
    onProgress("Cloudflare chưa báo active sau 2 phút — mở thử miền xem đã chạy mẫu mới chưa...");
    if (!(await waitDomainServesProject(domain, instance, 6 * 60_000))) {
      throw new Error(`Đã trỏ DNS nhưng sau 8 phút miền vẫn chưa phát trang của [${instance}]. Chưa dọn chỗ cũ.`);
    }
  }
  const live = await ensureLiveDomainLink(domain, link, {
    projectName: instance,
    cnameTarget: finalTarget,
    accountId,
    sinceMs,
    timeoutMs: pagesActive ? 3 * 60_000 : 8 * 60_000,
  });
  if (!live.ok) throw new Error(`Đã trỏ DNS nhưng miền chưa phát đúng link. Chưa dọn chỗ cũ. ${live.error || ""}`.trim());

  // 5. Dọn chỗ cũ
  onProgress("Đang dọn miền khỏi mẫu cũ...");
  const cleaned = await cleanupOldPlaces(domain, template, instance, oldProjects);
  return { sameTemplate: false, finalTarget, live, ...cleaned };
}

async function fetchPage(url) {
  try {
    const r = await fetch(`${url}${url.includes("?") ? "&" : "?"}_hub=${Date.now()}`, {
      headers: { "user-agent": "Mozilla/5.0 (LandingHub-switch-check)", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    return (await r.text())
      .replace(/<script[^>]*cloudflareinsights[\s\S]*?<\/script>/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return null;
  }
}

/** Miền đang phát đúng trang chủ của project (Cloudflare đôi khi báo pending dù đã phục vụ). */
async function waitDomainServesProject(domain, project, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const [onDomain, onProject] = await Promise.all([fetchPage(`https://${domain}/`), fetchPage(`https://${project}.pages.dev/`)]);
    if (onDomain && onProject && onDomain === onProject) return true;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  return false;
}

/** Gỡ miền khỏi domains.json của các mẫu khác và khỏi các project Pages khác project đang phục vụ. */
export async function cleanupOldPlaces(domain, template, servingProject, oldProjects = []) {
  const removedFrom = [];
  for (const m of findDomainInRepos(domain)) {
    if (sameTemplateFolder(m.folderPath, template.path)) continue;
    if (await removeDomainFromRepo(domain, m.filePath).catch(() => false)) removedFrom.push(m.folderPath);
  }

  const detachedFrom = [];
  const others = [...new Set(oldProjects)].filter((p) => p && p !== servingProject);
  if (others.length) {
    const accounts = [...new Set([config.cloudflare.accountId(), config.cloudflare.adminAccountId()].filter(Boolean))];
    for (const acc of accounts) {
      const r = await removeDomainFromAllPagesProjects(domain, acc, {
        onlyProjects: others,
        exceptProjects: [servingProject],
        token: pagesTokenForAccount(acc),
      }).catch(() => ({ removedFrom: [] }));
      detachedFrom.push(...(r.removedFrom || []));
    }
  }
  return { removedFrom, detachedFrom };
}
