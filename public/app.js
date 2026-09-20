function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function authHeaders() {
  const token = localStorage.getItem("freze_auth_token") || "";
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// ── FREZE DOMAIN HUB - CORE APPLICATION LOGIC ─────────────────────────────
// Global fetch interceptor to automatically attach JWT token to all /api/ calls
const _nativeFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const token = localStorage.getItem("freze_auth_token");
  if (token && typeof url === "string" && url.startsWith("/api/")) {
    options = options || {};
    if (!options.headers) {
      options.headers = {};
    }
    if (options.headers instanceof Headers) {
      if (!options.headers.has("Authorization")) {
        options.headers.set("Authorization", `Bearer ${token}`);
      }
    } else if (Array.isArray(options.headers)) {
      options.headers.push(["Authorization", `Bearer ${token}`]);
    } else {
      if (!options.headers["Authorization"] && !options.headers["authorization"]) {
        options.headers["Authorization"] = `Bearer ${token}`;
      }
    }
  }
  const response = await _nativeFetch(url, options);
  if (response.status === 401 && typeof url === "string" && !url.includes("/api/auth/login")) {
    localStorage.removeItem("freze_auth_token");
    window.location.href = "/login";
  }
  return response;
};

let allTemplates = [];
let allDomains = [];
let allHistory = [];
let currentUser = null;
let authReady = false;
let currentFilter = "all";
let currentSearch = "";
let currentDomainSearch = "";
let currentHistorySearch = "";
let domainsPage = 1;
let domainsLimit = 50;
let domainsTotal = 0;
let domainsTotalPages = 1;
let domainsSearchTimer = null;
let historyPage = 1;
let historyLimit = 50;
let historyTotal = 0;
let historyTotalPages = 1;
let historySearchTimer = null;
let historyFetchSeq = 0;
let historyRenderFingerprint = "";
let selectedTemplate = null;
let activeDomainToEdit = null;

// Quản lý theo dõi tên miền & thông báo popup 200 OK
let monitoredDomainsFor200 = new Set();
let notified200Domains = new Set(JSON.parse(sessionStorage.getItem("notified200Domains") || "[]"));
let historyPollingInterval = null;

// Picker Context: targetType ('buy' | 'point' | 'switch'), domain, link
let pickerContext = { targetType: "buy", domain: null, link: null };
let selectedPickerTemplate = null;
let pickerBrandFilter = "all";
let pickerSearch = "";

// ── DOM ELEMENTS ──────────────────────────────────────────────────────────
const navTabs = document.querySelectorAll(".nav-tab");
const tabPanes = document.querySelectorAll(".tab-pane");
const globalRefreshBtn = document.getElementById("globalRefreshBtn");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const filterTabs = document.getElementById("filterTabs");
const templatesGrid = document.getElementById("templatesGrid");
const loadingState = document.getElementById("loadingState");
const emptyState = document.getElementById("emptyState");

// Wizard Elements
const subPills = document.querySelectorAll(".sub-pill");
const buyLpTemplateSelect = document.getElementById("buyLpTemplate");
const pointLpTemplateSelect = document.getElementById("pointLpTemplate");
const switchTemplateSelect = document.getElementById("switchTemplateSelect");
const buyLpTemplatePreview = document.getElementById("buyLpTemplatePreview");
const pointLpTemplatePreview = document.getElementById("pointLpTemplatePreview");

// Domain Manager Elements
const domainSearchInput = document.getElementById("domainSearchInput");
const clearDomainSearch = document.getElementById("clearDomainSearch");
const refreshDomainsBtn = document.getElementById("refreshDomainsBtn");
const domainsTable = document.getElementById("domainsTable");
const domainsTableBody = document.getElementById("domainsTableBody");
const domainsLoading = document.getElementById("domainsLoading");
const domainsEmpty = document.getElementById("domainsEmpty");
const statTotalDomains = document.getElementById("statTotalDomains");
const statFilteredDomains = document.getElementById("statFilteredDomains");
const badgeDomainsCount = document.getElementById("badgeDomainsCount");

// Inspector Elements
const inspectorDomainInput = document.getElementById("inspectorDomainInput");
const btnInspectDomain = document.getElementById("btnInspectDomain");
const inspectorLoading = document.getElementById("inspectorLoading");
const inspectorResult = document.getElementById("inspectorResult");

// History Elements
const badgeHistoryCount = document.getElementById("badgeHistoryCount");
const historyTable = document.getElementById("historyTable");
const historyTableBody = document.getElementById("historyTableBody");
const historyLoading = document.getElementById("historyLoading");
const historyEmpty = document.getElementById("historyEmpty");
const historySearchInput = document.getElementById("historySearchInput");
const clearHistorySearch = document.getElementById("clearHistorySearch");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const verifyAllHistoryBtn = document.getElementById("verifyAllHistoryBtn");
const statTotalHistory = document.getElementById("statTotalHistory");
const statLiveHistory = document.getElementById("statLiveHistory");
const statBuyHistory = document.getElementById("statBuyHistory");
const statLpHistory = document.getElementById("statLpHistory");




// ── 1. INITIALIZATION & NAVIGATION ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  document.body.classList.add("auth-pending");

  // Clear any unwanted browser autofill from search inputs
  const searchInputs = [
    document.getElementById("searchInput"),
    document.getElementById("domainSearchInput"),
    document.getElementById("historySearchInput"),
    document.getElementById("inspectorDomainInput"),
    document.getElementById("pickerSearchInput"),
  ];
  searchInputs.forEach((inp) => {
    if (inp) {
      inp.value = "";
      inp.setAttribute("autocomplete", "off");
    }
  });

  // Anti-autofill delayed purge (Chrome / Edge password managers often autofill after 150-300ms)
  setTimeout(() => {
    searchInputs.forEach((inp) => {
      if (inp && inp !== document.activeElement) {
        inp.value = "";
      }
    });
  }, 250);

  const authed = await checkAuth();
  if (!authed) return;

  bootHubApp();
});

async function fetchHistoryBadgeCount() {
  try {
    const res = await fetch("/api/history?page=1&limit=1", { headers: authHeaders() });
    const data = await res.json();
    if (data.success && data.stats) updateHistoryStats(data.stats);
  } catch (err) {
    console.warn("fetchHistoryBadgeCount:", err);
  }
}

function bootHubApp() {
  setupNavigation();
  setupSubPills();
  setupBatchTab();
  fetchTemplates();
  fetchDomainBadgeCount();
  fetchHistoryBadgeCount();
  loadCurrentCfToken();
  setupForms();
  setupPickerListeners();
  loadTasksList();
  if (typeof startTaskPolling === "function") startTaskPolling();
  if (typeof startHistoryPolling === "function") startHistoryPolling();
}

function renderPaginationBar(containerEl, { page, totalPages, total, limit, onPage, label = "mục" }) {
  if (!containerEl) return;
  if (!total) {
    containerEl.innerHTML = "";
    return;
  }
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= totalPages ? "disabled" : "";
  containerEl.innerHTML = `
    <div class="pagination-bar">
      <span class="pagination-info">${start}–${end} / ${total} ${label}</span>
      <div class="pagination-controls">
        <button type="button" class="btn btn-sm btn-secondary pagination-btn" data-page="1" ${prevDisabled}>«</button>
        <button type="button" class="btn btn-sm btn-secondary pagination-btn" data-page="${page - 1}" ${prevDisabled}>‹</button>
        <span class="pagination-page">${page} / ${totalPages}</span>
        <button type="button" class="btn btn-sm btn-secondary pagination-btn" data-page="${page + 1}" ${nextDisabled}>›</button>
        <button type="button" class="btn btn-sm btn-secondary pagination-btn" data-page="${totalPages}" ${nextDisabled}>»</button>
      </div>
    </div>
  `;
  containerEl.querySelectorAll(".pagination-btn").forEach((btn) => {
    if (btn.hasAttribute("disabled")) return;
    btn.addEventListener("click", () => {
      const target = parseInt(btn.dataset.page, 10);
      if (target >= 1 && target <= totalPages) onPage(target);
    });
  });
}

async function fetchDomainBadgeCount() {
  try {
    const res = await fetch("/api/domains-list?page=1&limit=1", { headers: authHeaders() });
    const data = await res.json();
    if (data.success) {
      const total = data.total ?? data.count ?? 0;
      if (badgeDomainsCount) badgeDomainsCount.textContent = total;
      if (statTotalDomains) statTotalDomains.textContent = total;
    }
  } catch (err) {
    console.warn("fetchDomainBadgeCount:", err);
  }
}

function setupNavigation() {
  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTabId = tab.dataset.tab;
      navTabs.forEach((t) => t.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const activePane = document.getElementById(targetTabId);
      if (activePane) activePane.classList.add("active");

      if (targetTabId === "tab-domains" && allDomains.length === 0) {
        fetchDomains(1);
      }
      if (targetTabId === "tab-history" && allHistory.length === 0) {
        fetchHistory(1);
      }
      if (targetTabId === "tab-wallet") {
        loadWalletData();
        loadDomainOrdersList();
      }
      if (targetTabId === "tab-tasks") {
        loadTasksList();
      }
      if (targetTabId === "tab-domain-perms") {
        loadPermsData();
      }
    });
  });

  globalRefreshBtn.addEventListener("click", () => {
    fetchTemplates();
    fetchDomainBadgeCount();
    const domainsTabActive = document.querySelector('.nav-tab[data-tab="tab-domains"]')?.classList.contains("active");
    const historyTabActive = document.querySelector('.nav-tab[data-tab="tab-history"]')?.classList.contains("active");
    if (domainsTabActive) fetchDomains(domainsPage);
    if (historyTabActive) fetchHistory(historyPage);
    showToast("🔄 Đã làm mới dữ liệu hệ thống!");
  });
}

function setupSubPills() {
  subPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const parentContainer = pill.closest(".wizard-container");
      const targetSub = pill.dataset.sub;

      parentContainer.querySelectorAll(".sub-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");

      if (targetSub === "buy-lp") {
        document.getElementById("form-buy-lp").style.display = "block";
        document.getElementById("form-buy-302").style.display = "none";
        const fBatch = document.getElementById("form-check-batch");
        if (fBatch) fBatch.style.display = "none";
      } else if (targetSub === "buy-302") {
        document.getElementById("form-buy-lp").style.display = "none";
        document.getElementById("form-buy-302").style.display = "block";
        const fBatch = document.getElementById("form-check-batch");
        if (fBatch) fBatch.style.display = "none";
      } else if (targetSub === "check-batch") {
        document.getElementById("form-buy-lp").style.display = "none";
        document.getElementById("form-buy-302").style.display = "none";
        const fBatch = document.getElementById("form-check-batch");
        if (fBatch) fBatch.style.display = "block";
      } else if (targetSub === "point-lp") {
        document.getElementById("form-point-lp").style.display = "block";
        document.getElementById("form-point-302").style.display = "none";
      } else if (targetSub === "point-302") {
        document.getElementById("form-point-lp").style.display = "none";
        document.getElementById("form-point-302").style.display = "block";
      }
    });
  });
}

// ── 2. TEMPLATES GALLERY (TAB 1) ───────────────────────────────────────────
async function fetchTemplates() {
  loadingState.style.display = "flex";
  emptyState.style.display = "none";
  templatesGrid.innerHTML = "";

  try {
    const res = await fetch("/api/templates", { headers: authHeaders() });
    const data = await res.json();
    if (data.success && Array.isArray(data.templates)) {
      allTemplates = data.templates;
      updateFilterCounts();
      renderTemplates();
      populateTemplateSelects();
    } else {
      showToast("❌ Không thể nạp danh sách mẫu: " + (data.error || "Lỗi máy chủ"));
    }
  } catch (err) {
    console.error("Fetch templates error:", err);
    showToast("❌ Lỗi kết nối tới máy chủ");
  } finally {
    loadingState.style.display = "none";
  }
}

function getTemplateLiveHost(t) {
  return String(t?.cnameTarget || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();
}

function getTemplateLiveUrl(t) {
  const host = getTemplateLiveHost(t);
  return host ? `https://${host}` : "#";
}

function getTemplateLiveName(t) {
  if (t?.pagesProject) return t.pagesProject;
  const host = getTemplateLiveHost(t);
  return host.replace(/\.pages\.dev$/i, "") || "Mẫu live";
}

function getBrandForTemplate(t) {
  if (t.brand && ["GG88", "MM88", "LLWIN", "XX88"].includes(t.brand.toUpperCase())) return t.brand.toUpperCase();
  const full = ((t.id || "") + " " + (t.name || "") + " " + (t.title || "") + " " + (t.folder || "") + " " + (t.cnameTarget || "")).toLowerCase();
  if (full.includes("xx88") || full.includes("xx-") || full.includes("1a-xx88")) return "XX88";
  if (full.includes("llwin") || full.includes("ll-") || full.includes("llwind") || full.includes("lltong") || full.includes("7f-llwin") || full.includes("xoamaan-6c") || full.includes("c168")) return "LLWIN";
  if (full.includes("mm88") || full.includes("mm-") || full.includes("mm88sin") || full.includes("mm88top") || full.includes("bcr") || full.includes("checkmadaily") || full.includes("check_user")) return "MM88";
  return "GG88";
}

function updateFilterCounts() {
  const counts = { all: allTemplates.length, GG88: 0, MM88: 0, LLWIN: 0, XX88: 0 };
  allTemplates.forEach((t) => {
    const brand = getBrandForTemplate(t);
    t.brand = brand;
    if (counts[brand] !== undefined) counts[brand]++;
    else counts.GG88++;
  });

  const countAllEl = document.getElementById("countAll");
  if (countAllEl) countAllEl.textContent = counts.all;

  const brandTabIds = ["GG88", "MM88", "LLWIN", "XX88"];
  for (const b of brandTabIds) {
    const countEl = document.getElementById("count" + b);
    if (countEl) {
      countEl.textContent = counts[b] || 0;
      const btn = countEl.closest(".filter-btn");
      if (btn) btn.style.display = "inline-flex";
    }
    const pickerCountEl = document.getElementById("pickerCount" + b);
    if (pickerCountEl) {
      pickerCountEl.textContent = counts[b] || 0;
    }
  }
  const pickerCountAll = document.getElementById("pickerCountAll");
  if (pickerCountAll) pickerCountAll.textContent = counts.all;
}

function filterTemplatesList() {
  return allTemplates.filter((t) => {
    const brand = getBrandForTemplate(t);
    if (currentFilter !== "all" && brand.toUpperCase() !== currentFilter.toUpperCase()) {
      return false;
    }
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      const matchName = t.name?.toLowerCase().includes(q);
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchTarget = t.cnameTarget?.toLowerCase().includes(q);
      const matchLive = getTemplateLiveName(t).toLowerCase().includes(q) || (t.pagesProject || "").toLowerCase().includes(q);
      const matchDir = t.folder?.toLowerCase().includes(q);
      const matchBrand = brand.toLowerCase().includes(q) || (t.brandLabel || "").toLowerCase().includes(q);
      return matchName || matchTitle || matchTarget || matchLive || matchDir || matchBrand;
    }
    return true;
  });
}

function renderTemplates() {
  const filtered = filterTemplatesList();
  templatesGrid.innerHTML = "";

  if (filtered.length === 0) {
    emptyState.style.display = "flex";
    return;
  }
  emptyState.style.display = "none";

  filtered.forEach((t) => {
    const brand = getBrandForTemplate(t).toLowerCase();
    const brandLabel = t.brandLabel || brand.toUpperCase();
    const card = document.createElement("div");
    card.className = "template-card";
    card.dataset.id = t.id;

    const brandBadgeClass = `badge-${brand}`;
    const previewUrl = getTemplateLiveUrl(t);
    const liveName = getTemplateLiveName(t);
    const screenshotSrc = t.screenshotUrl || getFallbackPlaceholder(t.name);

    card.innerHTML = `
      <div class="card-preview">
        <img src="${screenshotSrc}" alt="${t.title || t.name}" class="preview-img" onerror="this.src='${getFallbackPlaceholder(t.name)}'" loading="lazy">
        <div class="card-overlay">
          <button class="btn btn-sm btn-secondary btn-preview" data-id="${t.id}">Xem trước</button>
        </div>
        <span class="brand-badge ${brandBadgeClass}">${brandLabel}</span>
      </div>
      <div class="card-body">
        <h4 class="card-title" title="${t.title || t.name}">${t.title || t.name}</h4>
        <div class="card-meta">
          <span class="tpl-chip">Mẫu</span>
          <a class="tpl-live-name" href="${previewUrl}" target="_blank" rel="noopener noreferrer" title="Mở trang mẫu live">${liveName}</a>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-primary btn-apply" data-id="${t.id}">Áp dụng</button>
          <a href="${previewUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-open-live">Mở web</a>
        </div>
      </div>
    `;

    templatesGrid.appendChild(card);
  });

  attachTemplateCardEvents();
}

function attachTemplateCardEvents() {
  document.querySelectorAll(".btn-preview").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openPreviewModal(btn.dataset.id);
    };
  });

  document.querySelectorAll(".btn-apply").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const t = allTemplates.find((x) => x.id === btn.dataset.id);
      if (t) {
        // Chuyển thẳng sang tab Mua Miền & Chọn mẫu này & Focus ô nhập tên miền
        const buyTab = document.querySelector('.nav-tab[data-tab="tab-buy"]');
        if (buyTab) buyTab.click();
        if (buyLpTemplateSelect) {
          buyLpTemplateSelect.value = t.id;
          triggerTemplatePreviewChange(t.id, buyLpTemplatePreview);
        }
        const domainInput = document.getElementById("buyLpDomain");
        if (domainInput) domainInput.focus();
        showToast(`🎯 Đã chọn mẫu [${t.name}]! Vui lòng nhập tên miền.`);
      }
    };
  });

  document.querySelectorAll(".cname-link, .tpl-live-name, .btn-open-live").forEach((link) => {
    link.onclick = (e) => e.stopPropagation();
  });
}

function populateTemplateSelects() {
  const optionsHtml = allTemplates
    .map((t) => {
      const brand = getBrandForTemplate(t);
      return `<option value="${t.id}">[${brand}] ${t.name} (${getTemplateLiveName(t)})</option>`;
    })
    .join("");

  if (buyLpTemplateSelect) {
    buyLpTemplateSelect.innerHTML = `<option value="">-- Chọn mẫu Landing Page --</option>` + optionsHtml;
    buyLpTemplateSelect.onchange = () => triggerTemplatePreviewChange(buyLpTemplateSelect.value, buyLpTemplatePreview);
  }
  if (pointLpTemplateSelect) {
    pointLpTemplateSelect.innerHTML = `<option value="">-- Chọn mẫu Landing Page --</option>` + optionsHtml;
    pointLpTemplateSelect.onchange = () => triggerTemplatePreviewChange(pointLpTemplateSelect.value, pointLpTemplatePreview);
  }
  if (switchTemplateSelect) {
    switchTemplateSelect.innerHTML = `<option value="">-- Chọn mẫu Landing Page mới --</option>` + optionsHtml;
    switchTemplateSelect.onchange = () => triggerTemplatePreviewChange(switchTemplateSelect.value, document.getElementById("switchTemplatePreview"));
  }
}

async function resolveUiCurrentLink(domain, fallbackLink = "", fallbackTele = "") {
  const fromList = (typeof allDomains !== "undefined" ? allDomains : [])?.find?.(
    (d) => d.domain?.toLowerCase() === String(domain || "").toLowerCase()
  );
  let link = fallbackLink || fromList?.mainUrl || "";
  let tele = fallbackTele || fromList?.teleUrl || fromList?.telegramUrl || "";
  if (link && link !== "Chưa gán link" && link !== "https://" && link !== "http://") {
    return { link, tele };
  }
  try {
    const res = await fetch(`/api/resolve-link?domain=${encodeURIComponent(domain)}`, {
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.success && data.link) {
      return { link: data.link, tele: data.tele || tele || "" };
    }
  } catch {}
  return { link: link === "Chưa gán link" ? "" : link || "", tele: tele || "" };
}

async function openSwitchTemplateModal(domain, currentTplId = "", currentLink = "", currentTele = "") {
  activeDomainToEdit = domain;
  const subtitleEl = document.getElementById("switchTemplateDomainSubtitle");
  if (subtitleEl) subtitleEl.textContent = `Tên miền: ${domain}`;

  if (!allTemplates || allTemplates.length === 0) {
    await fetchTemplates();
  }
  populateTemplateSelects();

  const select = document.getElementById("switchTemplateSelect");
  const preview = document.getElementById("switchTemplatePreview");
  const linkInput = document.getElementById("switchTemplateLinkInput");
  const teleInput = document.getElementById("switchTemplateTeleInput");

  if (select) {
    if (currentTplId) {
      select.value = currentTplId;
    }
    triggerTemplatePreviewChange(select.value, preview);
    select.onchange = () => triggerTemplatePreviewChange(select.value, preview);
  }

  const resolved = await resolveUiCurrentLink(domain, currentLink, currentTele);
  if (linkInput) {
    linkInput.value = resolved.link || "";
    linkInput.placeholder = resolved.link
      ? resolved.link
      : "Để trống = giữ link cũ (tự kế thừa)";
  }
  if (teleInput) teleInput.value = resolved.tele || "";

  openModal("switchTemplateModal");
}

function triggerTemplatePreviewChange(templateId, previewContainer) {
  if (!previewContainer) return;
  const t = allTemplates.find((x) => x.id === templateId);
  if (!t) {
    previewContainer.innerHTML = "";
    previewContainer.style.display = "none";
    return;
  }
  previewContainer.style.display = "flex";
  previewContainer.innerHTML = `
    <img src="${t.screenshotUrl || getFallbackPlaceholder(t.name)}" alt="${t.name}">
    <div class="template-inline-preview-info">
      <div><b>${t.name}</b></div>
      <div style="color: var(--accent-cyan); font-family: var(--font-mono);">
        <a href="${getTemplateLiveUrl(t)}" target="_blank" rel="noopener noreferrer" style="color: inherit;">${getTemplateLiveName(t)}</a>
      </div>
      <div style="color: var(--text-dim);">${t.folder || ""}</div>
    </div>
  `;
}

function getFallbackPlaceholder(text) {
  const cleanText = (text || "Landing Page").replace(/[^a-zA-Z0-9 -]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="50%" stop-color="#1e1b4b"/>
        <stop offset="100%" stop-color="#311042"/>
      </linearGradient>
    </defs>
    <rect width="600" height="380" fill="url(#g)"/>
    <circle cx="300" cy="160" r="48" fill="#6366f1" opacity="0.2"/>
    <text x="50%" y="168" font-family="sans-serif" font-size="36" fill="#818cf8" text-anchor="middle" font-weight="bold">⚡</text>
    <text x="50%" y="235" font-family="sans-serif" font-size="20" fill="#f8fafc" text-anchor="middle" font-weight="600">${cleanText}</text>
    <text x="50%" y="265" font-family="sans-serif" font-size="13" fill="#94a3b8" text-anchor="middle">Cloudflare Pages Live Template</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Filter tabs & search listeners
if (filterTabs) {
  filterTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderTemplates();
  });
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    currentSearch = e.target.value.trim();
    clearSearch.style.display = currentSearch ? "block" : "none";
    renderTemplates();
  });
}

if (clearSearch) {
  clearSearch.addEventListener("click", () => {
    searchInput.value = "";
    currentSearch = "";
    clearSearch.style.display = "none";
    renderTemplates();
    searchInput.focus();
  });
}

// ── 3. DOMAIN MANAGER (TAB 4) ──────────────────────────────────────────────
async function fetchDomains(page = domainsPage) {
  domainsPage = Math.max(1, page);
  const hadRows = Array.isArray(allDomains) && allDomains.length > 0;
  if (domainsLoading) domainsLoading.style.display = hadRows ? "none" : "flex";
  if (!hadRows) {
    if (domainsTable) domainsTable.style.display = "none";
    if (domainsEmpty) domainsEmpty.style.display = "none";
  }

  try {
    const q = encodeURIComponent(currentDomainSearch || "");
    const res = await fetch(`/api/domains-list?page=${domainsPage}&limit=${domainsLimit}&q=${q}`, { headers: authHeaders() });
    const data = await res.json();
    if (data.success && Array.isArray(data.domains)) {
      allDomains = data.domains;
      domainsTotal = data.total ?? allDomains.length;
      domainsTotalPages = data.totalPages ?? 1;
      if (statTotalDomains) statTotalDomains.textContent = domainsTotal;
      if (badgeDomainsCount) badgeDomainsCount.textContent = domainsTotal;
      if (statFilteredDomains) {
        const start = domainsTotal ? (domainsPage - 1) * domainsLimit + 1 : 0;
        const end = Math.min(domainsPage * domainsLimit, domainsTotal);
        statFilteredDomains.textContent = currentDomainSearch
          ? `${domainsTotal} khớp`
          : domainsTotal
            ? `${start}–${end}`
            : "0";
      }
      renderDomainsTable();
      renderPaginationBar(document.getElementById("domainsPagination"), {
        page: domainsPage,
        totalPages: domainsTotalPages,
        total: domainsTotal,
        limit: domainsLimit,
        onPage: (p) => fetchDomains(p),
        label: "miền",
      });
    } else {
      showToast("❌ Không thể nạp danh sách domains: " + (data.error || "Lỗi máy chủ"));
    }
  } catch (err) {
    console.error("Fetch domains error:", err);
  } finally {
    if (domainsLoading) domainsLoading.style.display = "none";
  }
}

function renderDomainsTable() {
  const filtered = allDomains;
  if (filtered.length === 0) {
    if (domainsTable) domainsTable.style.display = "none";
    if (domainsEmpty) domainsEmpty.style.display = "flex";
    return;
  }

  if (domainsEmpty) domainsEmpty.style.display = "none";
  if (domainsTable) domainsTable.style.display = "table";
  if (!domainsTableBody) return;

  const rowOffset = (domainsPage - 1) * domainsLimit;

  domainsTableBody.innerHTML = filtered
    .map((d, index) => {
      const brand = d.brand || "KHAC";
      const brandBadgeClass = `badge-${brand.toLowerCase()}`;
      const shortUrl = d.mainUrl || "Chưa gán link";
      const teleUrl = d.telegramUrl || d.messengerUrl || "";

      return `
        <tr>
          <td style="color: var(--text-dim); font-family: var(--font-mono);">${rowOffset + index + 1}</td>
          <td>
            <a href="https://${d.domain}" target="_blank" rel="noopener noreferrer" class="dom-name-link">
              ${d.domain}
            </a>
          </td>
          <td>
            <span class="brand-badge ${brandBadgeClass}" style="position: static; display: inline-block; margin-right: 6px;">${brand}</span>
            <span style="font-weight: 600;">${d.templateName || d.primaryFolder}</span>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; color: var(--text-dim); min-width: 38px;">Link:</span>
                <span class="dom-target-url" title="${shortUrl}">${shortUrl}</span>
                ${d.mainUrl ? `<button class="btn-copy" onclick="copyText('${d.mainUrl}')" title="Sao chép link đích">📋</button>` : ""}
              </div>
              ${teleUrl ? `
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; color: var(--accent-amber); min-width: 38px;">Tele:</span>
                <span class="dom-target-url" style="color: var(--accent-amber);" title="${teleUrl}">${teleUrl}</span>
                <button class="btn-copy" onclick="copyText('${teleUrl}')" title="Sao chép link Telegram">📋</button>
              </div>` : ""}
            </div>
          </td>
          <td>
            <span class="dom-repo-tag">${d.primaryFolder}</span>
          </td>
          <td>
            <div class="action-btn-group">
              <button class="btn btn-sm btn-secondary" onclick="openEditLinkModal('${d.domain}', '${d.mainUrl || ""}', '${teleUrl}')" title="Đổi link chuyển hướng & Telegram">
                ✏️ Sửa Link
              </button>
              <button class="btn btn-sm btn-secondary" onclick="openSwitchTemplateModal('${d.domain}', '${d.templateId || ""}', '${d.mainUrl || ""}', '${teleUrl}')" title="Đổi sang mẫu Landing Page khác">
                🎨 Đổi Mẫu
              </button>
              <button class="btn-switch-mode" onclick="openSwitchModeModal('${d.domain}', '${d.sourceType === 'redirect_302' ? '302' : 'LP'}', '${d.mainUrl || ''}')" title="Chuyển đổi 1-click giữa 302 và Landing Page">
                🔁 302/LP
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

if (domainSearchInput) {
  domainSearchInput.addEventListener("input", (e) => {
    currentDomainSearch = e.target.value.trim();
    if (clearDomainSearch) clearDomainSearch.style.display = currentDomainSearch ? "block" : "none";
    clearTimeout(domainsSearchTimer);
    domainsSearchTimer = setTimeout(() => fetchDomains(1), 350);
  });
}

if (clearDomainSearch) {
  clearDomainSearch.addEventListener("click", () => {
    domainSearchInput.value = "";
    currentDomainSearch = "";
    clearDomainSearch.style.display = "none";
    fetchDomains(1);
    domainSearchInput.focus();
  });
}

if (refreshDomainsBtn) {
  refreshDomainsBtn.addEventListener("click", () => {
    fetchDomains(domainsPage);
    showToast("⏳ Đang tải lại danh sách tên miền...");
  });
}

window.syncCloudflareDomains = async function () {
  showToast("⏳ Đang đồng bộ zone Cloudflare (Freze + Admin)...");
  try {
    const res = await fetch("/api/sync-cloudflare", {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ ${data.message || "Đã đồng bộ CF"} — đang nạp lại danh sách (gồm zone CF chưa gắn LP)...`);
      await fetchDomains(1);
      await fetchDomainBadgeCount();
      const hasTong = domainsTotal > 0 && currentDomainSearch.toLowerCase().includes("tong88vip");
      console.log("[sync CF] domains total", domainsTotal, "tong88vip search?", hasTong);
    } else {
      showToast(`❌ Lỗi: ${data.error || "Không thể đồng bộ"}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  }
};

// ── 4. WIZARDS EXECUTION & FORM HANDLERS ────────────────────────────────────
function setupForms() {
  // Check giá miền trên Form Buy LP
  const btnCheckBuyLp = document.getElementById("btnCheckBuyLp");
  if (btnCheckBuyLp) {
    btnCheckBuyLp.onclick = () => {
      const dom = document.getElementById("buyLpDomain").value.trim();
      const statusEl = document.getElementById("buyLpDomainStatus");
      checkDomainAvailabilityLive(dom, statusEl);
    };
  }

  // Check giá miền trên Form Buy 302
  const btnCheckBuy302 = document.getElementById("btnCheckBuy302");
  if (btnCheckBuy302) {
    btnCheckBuy302.onclick = () => {
      const dom = document.getElementById("buy302Domain").value.trim();
      const statusEl = document.getElementById("buy302DomainStatus");
      checkDomainAvailabilityLive(dom, statusEl);
    };
  }

  // Form 1: Mua & Gán Landing Page
  const buyLpForm = document.getElementById("buyLpForm");
  if (buyLpForm) {
    buyLpForm.onsubmit = async (e) => {
      e.preventDefault();
      const domain = document.getElementById("buyLpDomain").value.trim();
      const link = document.getElementById("buyLpLink").value.trim();
      const tele = document.getElementById("buyLpTele") ? document.getElementById("buyLpTele").value.trim() : "";
      const templateId = document.getElementById("buyLpTemplate").value;
      const targetUserId = document.getElementById("buyLpTargetUser")?.value?.trim() || "";

      if (!domain || !link || !templateId) {
        showToast("⚠️ Vui lòng điền đầy đủ thông tin tên miền, link và chọn mẫu!");
        return;
      }
      if (!isAdminUser()) {
        const priceInfo = await fetchDomainOrderPrice(domain);
        openConfirmDomainPurchaseModal(domain, priceInfo.priceXu, priceInfo.ruleApplied, {
          link,
          tele,
          templateId,
          deployMode: "LP",
        });
        return;
      }

      await executeDeployFlow({ domain, link, tele, templateId, isBuy: true, type: "lp", targetUserId: targetUserId || undefined });
    };
  }

  // Form 2: Mua & Trỏ 302
  const buy302Form = document.getElementById("buy302Form");
  if (buy302Form) {
    buy302Form.onsubmit = async (e) => {
      e.preventDefault();
      const domain = document.getElementById("buy302Domain").value.trim();
      const link = document.getElementById("buy302Link").value.trim();
      const targetUserId = document.getElementById("buy302TargetUser")?.value?.trim() || "";

      if (!domain || !link) {
        showToast("⚠️ Vui lòng điền đầy đủ tên miền và link!");
        return;
      }
      if (!isAdminUser()) {
        const priceInfo = await fetchDomainOrderPrice(domain);
        openConfirmDomainPurchaseModal(domain, priceInfo.priceXu, priceInfo.ruleApplied, {
          link,
          deployMode: "302",
        });
        return;
      }

      await executeDeployFlow({ domain, link, isBuy: true, type: "302", targetUserId: targetUserId || undefined });
    };
  }

  // Form 3: Trỏ Miền Có Sẵn ➔ Landing Page
  const pointLpForm = document.getElementById("pointLpForm");
  if (pointLpForm) {
    pointLpForm.onsubmit = async (e) => {
      e.preventDefault();
      const domain = document.getElementById("pointLpDomain").value.trim();
      const link = document.getElementById("pointLpLink").value.trim();
      const tele = document.getElementById("pointLpTele") ? document.getElementById("pointLpTele").value.trim() : "";
      const templateId = document.getElementById("pointLpTemplate").value;

      if (!domain || !link || !templateId) {
        showToast("⚠️ Vui lòng điền đầy đủ tên miền, link và chọn mẫu!");
        return;
      }

      await executeDeployFlow({ domain, link, tele, templateId, isBuy: false, type: "lp" });
    };
  }

  // Form 4: Trỏ 302 Miền Có Sẵn
  const point302Form = document.getElementById("point302Form");
  if (point302Form) {
    point302Form.onsubmit = async (e) => {
      e.preventDefault();
      const domain = document.getElementById("point302Domain").value.trim();
      const link = document.getElementById("point302Link").value.trim();

      if (!domain || !link) {
        showToast("⚠️ Vui lòng điền đầy đủ tên miền và link!");
        return;
      }

      await executeDeployFlow({ domain, link, isBuy: false, type: "302" });
    };
  }

  // Form 5: Sửa Link & Telegram Modal
  const editLinkForm = document.getElementById("editLinkForm");
  if (editLinkForm) {
    editLinkForm.onsubmit = async (e) => {
      e.preventDefault();
      const domain = activeDomainToEdit;
      const newLink = document.getElementById("editLinkInput").value.trim();
      const newTele = document.getElementById("editTeleInput") ? document.getElementById("editTeleInput").value.trim() : "";
      if (!domain || !newLink) return;

      // Đóng modal ngay lập tức để người dùng tiếp tục thao tác khác
      closeModal("editLinkModal");
      startHubProgressWatch({ domain, label: "Đang cập nhật link" });

      // Xử lý ngầm (background)
      (async () => {
        try {
          const res = await fetch("/api/set-link", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ domain, link: newLink, tele: newTele }),
          });
          const data = await res.json();
          if (data.success && data.verified !== false) {
            const liveHint = data.liveLink ? ` → ${data.liveLink}` : "";
            showToast(`✅ Live đã khớp link [${domain}]${liveHint}`, "success");
            fetchDomains();
            fetchHistory();
          } else {
            showToast(`❌ ${data.error || "Live chưa khớp link đích"}`, "error");
            fetchHistory();
          }
        } catch (err) {
          showToast(`❌ Lỗi kết nối khi cập nhật [${domain}]: ${err.message}`, "error");
        } finally {
          loadTasksList();
        }
      })();
    };
  }

  // Form 6: Đổi Mẫu Modal
  const switchTemplateForm = document.getElementById("switchTemplateForm");
  if (switchTemplateForm) {
    switchTemplateForm.onsubmit = async (e) => {
      e.preventDefault();
      const domain = activeDomainToEdit;
      const targetTemplateId = document.getElementById("switchTemplateSelect").value;
      const newLink = document.getElementById("switchTemplateLinkInput").value.trim();
      const newTele = document.getElementById("switchTemplateTeleInput") ? document.getElementById("switchTemplateTeleInput").value.trim() : "";
      if (!domain || !targetTemplateId) return;

      // Đóng modal ngay lập tức để người dùng làm việc tiếp
      closeModal("switchTemplateModal");
      startHubProgressWatch({ domain, label: "Đang đổi mẫu LP" });

      // Xử lý ngầm (background)
      (async () => {
        try {
          const res = await fetch("/api/switch-template", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              domain,
              targetTemplateId,
              newLink: newLink || undefined,
              newTele: newTele || undefined,
            }),
          });
          const data = await res.json();
          if (data.success) {
            showToast(`🎉 Đã đổi mẫu thành công cho [${domain}] sang [${data.templateName || targetTemplateId}]!`, "success");
            fetchDomains();
            fetchHistory();
          } else {
            showToast(`❌ Lỗi đổi mẫu [${domain}]: ${data.error || "Thất bại"}`, "error");
            fetchHistory();
          }
        } catch (err) {
          showToast(`❌ Lỗi kết nối khi đổi mẫu [${domain}]: ${err.message}`, "error");
        } finally {
          loadTasksList();
        }
      })();
    };
  }

  // Form 7: Batch Set Link Modal
  const batchSetLinkForm = document.getElementById("batchSetLinkForm");
  if (batchSetLinkForm) {
    batchSetLinkForm.onsubmit = async (e) => {
      e.preventDefault();
      const rawText = document.getElementById("batchDomainsTextarea").value;
      const newLink = document.getElementById("batchLinkInput").value.trim();

      const domains = rawText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (domains.length === 0 || !newLink) {
        showToast("⚠️ Vui lòng nhập ít nhất 1 tên miền và link đích!");
        return;
      }

      closeModal("batchSetLinkModal");
      showProcessingToast(`đổi link ${domains.length} miền`);
      openModal("batchProgressModal");

      const progressBar = document.getElementById("batchProgressBarFill");
      const statusText = document.getElementById("batchProgressStatusText");
      const percentText = document.getElementById("batchProgressPercentText");
      const successCountEl = document.getElementById("batchSuccessCount");
      const errorCountEl = document.getElementById("batchErrorCount");
      const totalCountEl = document.getElementById("batchTotalCount");
      const tableBody = document.getElementById("batchResultsTableBody");

      if (totalCountEl) totalCountEl.textContent = domains.length;
      if (successCountEl) successCountEl.textContent = "0";
      if (errorCountEl) errorCountEl.textContent = "0";
      if (tableBody) tableBody.innerHTML = "";
      if (progressBar) progressBar.style.width = "5%";
      if (percentText) percentText.textContent = "5%";
      if (statusText) statusText.textContent = `Đang gửi yêu cầu cập nhật ${domains.length} tên miền...`;
      startHubProgressWatch({ label: `Đang đổi link ${domains.length} miền`, switchTab: true });

      try {
        const res = await fetch("/api/batch-setlink", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ domains, link: newLink }),
        });
        const data = await res.json();

        if (progressBar) progressBar.style.width = "100%";
        if (percentText) percentText.textContent = "100%";

        if (data.success && Array.isArray(data.results)) {
          let sCount = 0;
          let eCount = 0;
          if (statusText) statusText.textContent = `✅ Hoàn tất xử lý ${data.results.length} tên miền!`;

          if (tableBody) {
            tableBody.innerHTML = data.results
              .map((item, idx) => {
                const isOk = item.status === "success";
                if (isOk) sCount++;
                else eCount++;
                return `
                  <tr>
                    <td style="color: var(--text-dim);">${idx + 1}</td>
                    <td style="font-weight: 700; font-family: var(--font-mono); color: #fff;">${item.domain}</td>
                    <td>
                      <span class="dom-tag ${isOk ? 'active' : 'inactive'}">
                        ${isOk ? '✅ Thành Công' : '❌ Thất Bại'}
                      </span>
                    </td>
                    <td><span class="dom-tag">${item.type === 'landing_page' ? 'Landing Page' : '302 Redirect'}</span></td>
                    <td style="font-size: 12px; color: ${isOk ? 'var(--accent-emerald)' : 'var(--accent-red)'};">
                      ${isOk ? 'Đã đổi link đích & purge cache' : (item.error || 'Lỗi không xác định')}
                    </td>
                  </tr>
                `;
              })
              .join("");
          }

          if (successCountEl) successCountEl.textContent = sCount;
          if (errorCountEl) errorCountEl.textContent = eCount;

          fetchDomains();
          fetchHistory();
        } else {
          if (statusText) statusText.textContent = `❌ Lỗi: ${data.error || 'Cập nhật hàng loạt thất bại'}`;
        }
      } catch (err) {
        if (statusText) statusText.textContent = `❌ Lỗi kết nối: ${err.message}`;
      }
    };
  }
}

// Live Check Availability on Type/Button
function escapeHtmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function checkDomainAvailabilityLive(domain, statusEl) {
  if (!domain) {
    showToast("⚠️ Vui lòng nhập tên miền trước!");
    return;
  }
  if (statusEl) {
    statusEl.className = "field-feedback";
    statusEl.innerHTML = `⏳ Đang kiểm tra <b>${domain}</b> trên Registry & Cloudflare...`;
  }

  try {
    const res = await fetch("/api/check-domain", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    if (data.success) {
      if (data.isAvailable && !data.isPremium) {
        if (statusEl) {
          statusEl.className = "field-feedback available";
          const formatted = `${data.priceXu || 250} Xu (≈ ${((data.priceVnd || 250000) / 1000).toLocaleString("vi-VN")}k đ)`;
          const ruleLabel = escapeHtmlText(data.ruleApplied || "Quy chuẩn");
          const domainAttr = escapeHtmlText(data.domain || domain);
          statusEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div>
                ✅ Tên miền còn trống! Báo giá: <b style="color: #10b981; font-size: 14px;">${formatted}</b>
                <span style="font-size: 11px; color: #38bdf8; margin-left: 6px;">[${ruleLabel}]</span>
              </div>
              ${
                isAdminUser()
                  ? ""
                  : buildOrderDomainButtonHtml({
                      domain: data.domain || domain,
                      priceXu: data.priceXu || 250,
                      ruleApplied: data.ruleApplied || "Quy chuẩn",
                      extra: collectBuyFormExtraFromUi(),
                    })
              }
            </div>
          `;
        }
      } else {
        if (statusEl) {
          statusEl.className = "field-feedback unavailable";
          if (data.isPremium) {
            statusEl.innerHTML = `❌ Tên miền không khả dụng (Thuộc danh mục Premium / Aftermarket - Không hỗ trợ đăng ký)`;
          } else {
            statusEl.innerHTML = `ℹ️ Tên miền đã có chủ sở hữu / Đã được đăng ký trước đó. (Tài khoản CF: <b>${data.cfAccount || "Chưa rõ"}</b>)`;
          }
        }
      }
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `❌ Không kiểm tra được: ${err.message}`;
  }
}



// ── 5. REAL-TIME DEPLOY EXECUTION (PROGRESS MODAL & PROCESSING POPUP) ───────
function isAdminUser() {
  return !!(authReady && currentUser && currentUser.role === "admin");
}

async function fetchDomainOrderPrice(domain) {
  try {
    const res = await fetch("/api/check-domain", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    if (data.success) {
      return {
        priceXu: data.priceXu || 250,
        ruleApplied: data.ruleApplied || "Quy chuẩn",
        available: !!(data.isAvailable && !data.isPremium),
      };
    }
  } catch {}
  return { priceXu: 250, ruleApplied: "Quy chuẩn", available: true };
}

function showOrderSubmittingModal(domain) {
  const titleEl = document.querySelector("#domainProcessingModal h3");
  const subtitleEl = document.querySelector("#domainProcessingModal .modal-subtitle");
  if (titleEl) titleEl.textContent = "Đang Gửi Yêu Cầu";
  if (subtitleEl) subtitleEl.textContent = "Hệ thống đang xử lý — vui lòng đợi vài giây";
  showDomainProcessingModal({
    domain,
    link: "Chờ Admin duyệt & kích hoạt",
    customActionText: "📤 Gửi yêu cầu đặt mua tên miền",
    type: "lp",
    isBuy: false,
    skipMonitor: true,
  });
}

function showDomainProcessingModal({ domain, link, tele, templateId, isBuy, type, customActionText, skipMonitor }) {
  const domEl = document.getElementById("processingModalDomainName");
  const actionEl = document.getElementById("processingModalActionType");
  const targetEl = document.getElementById("processingModalTargetUrl");
  const suffixEl = document.getElementById("processingModalDomainSuffix");
  const titleEl = document.querySelector("#domainProcessingModal h3");
  const subtitleEl = document.querySelector("#domainProcessingModal .modal-subtitle");

  if (!customActionText && !skipMonitor) {
    if (titleEl) titleEl.textContent = "Yêu Cầu Đang Được Xử Lý";
    if (subtitleEl) subtitleEl.textContent = "Vui lòng theo dõi ở Tiến trình";
  }

  const template = allTemplates.find((t) => t.id === templateId);
  const tplName = template ? template.name : (type === "302" ? "Trỏ 302 Trực Tiếp" : "Landing Page");

  if (domEl) domEl.textContent = domain || "-";
  if (suffixEl) suffixEl.textContent = domain ? ` cho [${domain}]` : "";
  if (actionEl) {
    if (customActionText) {
      actionEl.textContent = customActionText;
    } else if (isBuy) {
      actionEl.textContent = type === "302" ? "🛒 Mua Mới & Trỏ 302 Trực Tiếp" : `🛒 Mua Mới & Landing Page (${tplName})`;
    } else {
      actionEl.textContent = type === "302" ? "⚡ Trỏ 302 Miền Có Sẵn" : `🎨 Trỏ Miền Có Sẵn ➔ Landing Page (${tplName})`;
    }
  }
  if (targetEl) targetEl.textContent = link || "N/A";

  if (domain && !skipMonitor) {
    monitoredDomainsFor200.add(domain.toLowerCase());
  }

  openModal("domainProcessingModal");
  if (!skipMonitor) showProcessingToast(domain || "");
}

function goToTasksFromProcessingModal() {
  closeModal("domainProcessingModal");
  closeModal("progressModal");
  startHubProgressWatch({ switchTab: true });
}

/** Bật theo dõi tab Tiến trình — dùng cho mọi thao tác dài (mua, đổi link, LP, 302, đơn...) */
function startHubProgressWatch({ domain, title, label, switchTab = true } = {}) {
  if (domain) {
    pushOptimisticHubTask({
      domain,
      title: title || (label ? `${label} — ${domain}` : `Đang xử lý — ${domain}`),
      label,
    });
  }
  startTaskPolling();
  loadTasksList();
  if (switchTab) switchToTab("tab-tasks");
  if (domain && label) {
    showToast(`⏳ ${label} [${domain}] — tab Tiến trình`, "info");
  }
}

/** @deprecated dùng goToTasksFromProcessingModal */
function goToHistoryFromProcessingModal() {
  goToTasksFromProcessingModal();
}

function showDomainReady200Modal(item) {
  if (!item || !item.domain) return;
  const domName = item.domain.toLowerCase();
  if (notified200Domains.has(domName)) return;

  notified200Domains.add(domName);
  sessionStorage.setItem("notified200Domains", JSON.stringify([...notified200Domains]));

  const domEl = document.getElementById("ready200DomainName");
  const tplEl = document.getElementById("ready200TemplateName");
  const targetEl = document.getElementById("ready200TargetUrl");
  const timeEl = document.getElementById("ready200CompletedTime");
  const visitBtn = document.getElementById("ready200VisitBtn");
  const ssWrap = document.getElementById("ready200ScreenshotWrap");
  const ssImg = document.getElementById("ready200ScreenshotImg");

  if (domEl) domEl.textContent = item.domain;
  if (tplEl) tplEl.textContent = item.templateName || (item.actionType?.includes("302") ? "Chuyển Hướng 302" : "Landing Page");
  if (targetEl) targetEl.textContent = item.link || ("https://" + item.domain);
  if (timeEl) timeEl.textContent = item.verifiedAt ? formatHistoryDate(item.verifiedAt) : "Vừa xong";
  if (visitBtn) visitBtn.href = `https://${item.domain}`;

  if (item.liveScreenshot && ssWrap && ssImg) {
    ssImg.src = item.liveScreenshot;
    ssWrap.style.display = "block";
  } else if (ssWrap) {
    ssWrap.style.display = "none";
  }

  // Đóng modal processing nếu đang hiển thị
  closeModal("domainProcessingModal");
  openModal("domainReady200Modal");
  showToast(`🎉 Tên miền [${item.domain}] đã 200 OK hoàn tất!`, "success");
}

function goToHistoryFromReadyModal() {
  closeModal("domainReady200Modal");
  const histTab = document.querySelector('.nav-tab[data-tab="tab-history"]');
  if (histTab) histTab.click();
  fetchHistory();
}

let dismissedError15mDomains = new Set(JSON.parse(localStorage.getItem("dismissedError15mDomains") || "[]"));
let activeErrorAlertDomain = null;
/** Chỉ auto-popup cảnh báo 15p tối đa 1 lần / phiên trình duyệt */
let error15mAutoPopupDone = sessionStorage.getItem("error15mAutoPopupDone") === "1";

function saveDismissedError15mDomains() {
  localStorage.setItem("dismissedError15mDomains", JSON.stringify([...dismissedError15mDomains]));
}

function collectOverdue15mDomains(historyList) {
  const list = Array.isArray(historyList) ? historyList : allHistory || [];
  const out = new Set();
  for (const h of list) {
    if (!h?.domain || h.status === "failed" || h.liveStatus === "200_OK") continue;
    const dom = h.domain.toLowerCase();
    const ageMinutes = h.timestamp ? (Date.now() - new Date(h.timestamp).getTime()) / 60000 : 999;
    if (h.liveStatus === "ERROR_15M_ALERT" || ageMinutes >= 15) {
      out.add(dom);
    }
  }
  return out;
}

function acknowledgeDomainErrorAlert(domain) {
  const domName = (domain || activeErrorAlertDomain || document.getElementById("errorAlertDomainName")?.textContent || "")
    .toLowerCase()
    .trim();
  if (domName) dismissedError15mDomains.add(domName);

  // Đóng 1 lần = bỏ qua TẤT CẢ miền đang lỗi 15p hiện có — không xếp hàng popup tiếp theo
  for (const d of collectOverdue15mDomains(allHistory)) {
    dismissedError15mDomains.add(d);
  }
  saveDismissedError15mDomains();

  error15mAutoPopupDone = true;
  sessionStorage.setItem("error15mAutoPopupDone", "1");
  activeErrorAlertDomain = null;
}

function showDomainErrorAlertModal(item, { auto = true } = {}) {
  if (!item || !item.domain) return;
  const domName = item.domain.toLowerCase();
  if (dismissedError15mDomains.has(domName)) return;
  if (activeErrorAlertDomain) return; // đang mở 1 popup rồi — tuyệt đối không mở thêm

  if (auto) {
    if (error15mAutoPopupDone) return;
    error15mAutoPopupDone = true;
    sessionStorage.setItem("error15mAutoPopupDone", "1");
    // Đánh dấu luôn domain này để reload cũng không spam lại
    dismissedError15mDomains.add(domName);
    saveDismissedError15mDomains();
  }

  activeErrorAlertDomain = domName;

  const domEl = document.getElementById("errorAlertDomainName");
  const targetEl = document.getElementById("errorAlertTargetUrl");
  const detailsEl = document.getElementById("errorAlertDetails");
  const visitBtn = document.getElementById("errorAlertVisitBtn");

  if (domEl) domEl.textContent = item.domain;
  if (targetEl) targetEl.textContent = item.link || ("https://" + item.domain);
  if (detailsEl) detailsEl.textContent = item.lastCheckError || "Quá 15 phút chưa phản hồi HTTP 200";
  if (visitBtn) visitBtn.href = `https://${item.domain}`;

  closeModal("domainProcessingModal");
  openModal("domainErrorAlertModal");
  showToast(`⚠️ CẢNH BÁO: Tên miền [${item.domain}] quá 15 phút chưa sẵn sàng!`);
}

function openErrorAlertModalForDomain(domain, link = "", details = "") {
  // Mở thủ công từ lịch sử — không tính vào hàng đợi auto
  const domEl = document.getElementById("errorAlertDomainName");
  const targetEl = document.getElementById("errorAlertTargetUrl");
  const detailsEl = document.getElementById("errorAlertDetails");
  const visitBtn = document.getElementById("errorAlertVisitBtn");

  if (domEl) domEl.textContent = domain;
  if (targetEl) targetEl.textContent = link || ("https://" + domain);
  if (detailsEl) detailsEl.textContent = details || "Quá 15 phút chưa phản hồi. Vui lòng truy cập kiểm tra & liên hệ admin @frezeit";
  if (visitBtn) visitBtn.href = `https://${domain}`;

  activeErrorAlertDomain = (domain || "").toLowerCase();
  openModal("domainErrorAlertModal");
}

function closeDomainErrorAlertModal() {
  acknowledgeDomainErrorAlert();
  closeModal("domainErrorAlertModal");
}

let spaceshipBuyConfirmResolver = null;
let spaceshipBuyConfirmPayload = null;

async function fetchSpaceshipQuote(domain) {
  const res = await fetch("/api/spaceship/quote", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ domain }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Không lấy được báo giá Spaceship (HTTP ${res.status})`);
  }
  return data.quote;
}

function fillSpaceshipQuoteModal(quote, { batchRows = null, batchTotal = null } = {}) {
  const domEl = document.getElementById("ssQuoteDomain");
  const regEl = document.getElementById("ssQuoteReg");
  const privEl = document.getElementById("ssQuotePrivacy");
  const totalEl = document.getElementById("ssQuoteTotal");
  const noteEl = document.getElementById("ssQuoteNote");
  const batchWrap = document.getElementById("ssQuoteBatchWrap");
  const btn = document.getElementById("btnConfirmSpaceshipBuy");

  if (batchRows && batchRows.length > 1) {
    if (domEl) domEl.textContent = `${batchRows.length} miền`;
    if (regEl) regEl.textContent = "—";
    if (privEl) privEl.textContent = "Xem bảng bên dưới";
    if (totalEl) totalEl.textContent = `$${Number(batchTotal || 0).toFixed(2)} USD`;
    if (batchWrap) {
      batchWrap.style.display = "block";
      batchWrap.innerHTML = batchRows
        .map(
          (r) =>
            `<div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06);"><span>${r.domain}</span><span style="color:#ef4444;font-weight:700;">$${Number(r.totalUsd || 0).toFixed(2)}</span></div>`,
        )
        .join("");
    }
  } else if (quote) {
    if (domEl) domEl.textContent = quote.domain || "-";
    if (regEl) regEl.textContent = `$${Number(quote.regUsd || 0).toFixed(2)} USD`;
    if (privEl) {
      privEl.textContent =
        quote.privacyUsd > 0
          ? `${quote.privacyLabel || quote.privacyLevel} (+$${Number(quote.privacyUsd).toFixed(2)})`
          : quote.privacyLabel || "Public (không phí privacy)";
    }
    if (totalEl) totalEl.textContent = quote.formattedTotal || `$${Number(quote.totalUsd || 0).toFixed(2)} USD`;
    if (batchWrap) {
      batchWrap.style.display = "none";
      batchWrap.innerHTML = "";
    }
  }

  if (noteEl) {
    const q = quote || {};
    noteEl.textContent =
      q.message ||
      (q.priceSource === "spaceship_catalog"
        ? "Giá TLD thường theo bảng Spaceship trên hub. Premium lấy trực tiếp từ API."
        : "Báo giá từ Spaceship API.");
  }
  if (btn) {
    btn.textContent =
      quote?.skipCharge || Number(quote?.totalUsd) === 0
        ? "✅ Tiếp Tục (Không Trừ Tiền Mua)"
        : "✅ Đồng Ý — Trừ Tiền & Mua";
  }
}

function closeSpaceshipBuyConfirmModal(confirmed) {
  closeModal("spaceshipBuyConfirmModal");
  const resolver = spaceshipBuyConfirmResolver;
  const payload = spaceshipBuyConfirmPayload;
  spaceshipBuyConfirmResolver = null;
  spaceshipBuyConfirmPayload = null;
  if (resolver) resolver(confirmed ? payload : null);
}

function openSpaceshipBuyConfirmModal(quote, extra = {}) {
  fillSpaceshipQuoteModal(quote, extra);
  return new Promise((resolve) => {
    spaceshipBuyConfirmResolver = resolve;
    spaceshipBuyConfirmPayload = { quote, ...extra };
    openModal("spaceshipBuyConfirmModal");
  });
}

async function requireSpaceshipBuyConfirmation(deployArgs) {
  if (!deployArgs?.isBuy || !deployArgs?.domain) return deployArgs;
  if (!isAdminUser()) return deployArgs;
  const quote = await fetchSpaceshipQuote(deployArgs.domain);
  if (!quote.canPurchase) {
    throw new Error(quote.message || `Không thể mua ${deployArgs.domain} trên Spaceship`);
  }
  const confirmed = await openSpaceshipBuyConfirmModal(quote);
  if (!confirmed) return null;
  return {
    ...deployArgs,
    spaceshipBuyConfirmed: true,
    quotedTotalUsd: quote.totalUsd,
    spaceshipQuote: quote,
  };
}

async function requireSpaceshipBatchBuyConfirmation(domains) {
  if (!isAdminUser()) return null;
  const quotes = [];
  for (const domain of domains) {
    const quote = await fetchSpaceshipQuote(domain);
    if (!quote.canPurchase) {
      throw new Error(`${domain}: ${quote.message || "không mua được"}`);
    }
    quotes.push(quote);
  }
  const batchTotal = quotes.reduce((s, q) => s + Number(q.totalUsd || 0), 0);
  const batchRows = quotes.map((q) => ({ domain: q.domain, totalUsd: q.totalUsd }));
  const confirmed = await openSpaceshipBuyConfirmModal(quotes[0], { batchRows, batchTotal, quotes });
  if (!confirmed) return null;
  const byDomain = Object.fromEntries(quotes.map((q) => [q.domain, q]));
  return byDomain;
}

async function handleDeployApiResponse(res, data, domain) {
  const d = (domain || "").toLowerCase();
  if (res.status === 202 || data?.queued) {
    showToast(`⏳ [${domain}] đang xử lý ngầm — theo dõi tab Tiến trình`, "info");
    return "queued";
  }
  if ([502, 503, 504, 524].includes(res.status)) {
    showToast(`⏳ [${domain}] gateway timeout — job có thể vẫn chạy, xem tab Tiến trình`, "warning");
    return "timeout";
  }
  if (data?.success) {
    showToast(`✨ [${domain}] cài xong! Xem tab Lịch sử để theo dõi trạng thái live.`, "success");
    return "ok";
  }
  if (d) monitoredDomainsFor200.delete(d);
  const errMsg = data?.error || `HTTP ${res.status}`;
  showToast(`❌ THẤT BẠI [${domain}]: ${errMsg}`, "error");
  alert(`❌ Mua/cài đặt thất bại: ${domain}\n\n${errMsg}`);
  return "fail";
}

async function executeDeployFlow({ domain, link, tele, templateId, isBuy, type, spaceshipBuyConfirmed, quotedTotalUsd, targetUserId, orderId }) {
  const submitBtns = document.querySelectorAll('button[type="submit"]');
  submitBtns.forEach((b) => {
    b.disabled = true;
    b.dataset.origHtml = b.innerHTML;
    b.innerHTML = `<span>⏳ Đang tiếp nhận...</span>`;
  });

  if (isBuy && !isAdminUser()) {
    showToast("⚠️ Thành viên gửi yêu cầu qua nút Đặt Mua Ngay sau khi tra cứu giá.", "warning");
    openConfirmDomainPurchaseModal(domain, 250, "", { link, tele, templateId, deployMode: type === "302" ? "302" : "LP" });
    submitBtns.forEach((b) => {
      b.disabled = false;
      if (b.dataset.origHtml) b.innerHTML = b.dataset.origHtml;
    });
    return;
  }

  let deployArgs = { domain, link, tele, templateId, isBuy, type, spaceshipBuyConfirmed, quotedTotalUsd, targetUserId, orderId };

  try {
    if (isBuy && !spaceshipBuyConfirmed && isAdminUser()) {
      const confirmedArgs = await requireSpaceshipBuyConfirmation(deployArgs);
      if (!confirmedArgs) {
        showToast("Đã hủy — chưa mua trên Spaceship.", "info");
        return;
      }
      deployArgs = confirmedArgs;
    }
  } catch (err) {
    showToast(`❌ ${err.message}`, "error");
    alert(`❌ Không thể báo giá Spaceship:\n\n${err.message}`);
    submitBtns.forEach((b) => {
      b.disabled = false;
      if (b.dataset.origHtml) b.innerHTML = b.dataset.origHtml;
    });
    return;
  }

  const { domain: d, link: l, tele: t, templateId: tpl, isBuy: buy, type: tp, spaceshipBuyConfirmed: sbc, quotedTotalUsd: qtu, targetUserId: tuid, orderId: oid } = deployArgs;

  if (d) {
    monitoredDomainsFor200.add(d.toLowerCase());
  }

  startTaskPolling();
  loadTasksList();
  switchToTab("tab-tasks");
  showToast(`⏳ Đang xử lý [${d}] — tab Tiến trình`, "info");

  const endpoint = tp === "lp" ? "/api/deploy-lp" : "/api/deploy-302";
  const ownerFields = {};
  if (tuid) ownerFields.targetUserId = tuid;
  if (oid) ownerFields.orderId = oid;
  const payload =
    tp === "lp"
      ? { domain: d, link: l, tele: t, templateId: tpl, isBuy: buy, spaceshipBuyConfirmed: sbc, quotedTotalUsd: qtu, ...ownerFields }
      : { domain: d, link: l, isBuy: buy, spaceshipBuyConfirmed: sbc, quotedTotalUsd: qtu, ...ownerFields };

  (async () => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      await handleDeployApiResponse(res, data, d);
    } catch (err) {
      if (d) monitoredDomainsFor200.delete(d.toLowerCase());
      showToast(`⏳ [${d}] lỗi kết nối — kiểm tra tab Tiến trình (job có thể vẫn chạy)`, "warning");
    } finally {
      fetchDomains();
      fetchHistory();
      if (typeof checkAuth === "function") checkAuth();
      if (typeof loadTasksList === "function") loadTasksList();
    }
  })();

  setTimeout(() => {
    submitBtns.forEach((b) => {
      b.disabled = false;
      if (b.dataset.origHtml) b.innerHTML = b.dataset.origHtml;
    });
  }, 1000);
}

// ── 6. TAB 5: INSPECTOR ───────────────────────────────────────────────────
if (btnInspectDomain) {
  btnInspectDomain.onclick = inspectDomain;
}
if (inspectorDomainInput) {
  inspectorDomainInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") inspectDomain();
  });
}

function switchCheckSubTab(mode) {
  const pills = document.querySelectorAll("#tab-check .sub-pill");
  pills.forEach((p) => p.classList.remove("active"));
  const activePill = document.querySelector(`#tab-check .sub-pill[data-sub="check-${mode}"]`);
  if (activePill) activePill.classList.add("active");

  const singlePanel = document.getElementById("check-single-panel");
  const batchPanel = document.getElementById("check-batch-panel");

  if (mode === "single") {
    if (singlePanel) singlePanel.style.display = "block";
    if (batchPanel) batchPanel.style.display = "none";
  } else {
    if (singlePanel) singlePanel.style.display = "none";
    if (batchPanel) batchPanel.style.display = "block";
  }
}

function inspectSpecificDomain(domain) {
  switchCheckSubTab("single");
  if (inspectorDomainInput) {
    inspectorDomainInput.value = domain;
    inspectDomain();
  }
}

function extractClientDomains(input) {
  if (!input) return [];
  if (Array.isArray(input)) return [...new Set(input.flatMap(extractClientDomains))];
  const cleaned = String(input).replace(/[^\x20-\x7E\r\n\t]/g, " ");
  const rawTokens = cleaned.split(/[\r\n,;\s\t|]+/);
  const list = [];
  for (let token of rawTokens) {
    token = token.trim();
    if (!token) continue;
    token = token.replace(/^[\d+.)\-*•>#]+/, "").trim();
    token = token.replace(/[`"'()\[\]{}<>]/g, "").trim();
    token = token.replace(/^https?:\/\//i, "").trim();
    token = token.split("/")[0].split("?")[0].split("#")[0].split(":")[0].trim();
    token = token.replace(/[.,;:]+$/, "").trim().toLowerCase();
    if (token && token.includes(".") && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(token)) {
      list.push(token);
    }
  }
  return [...new Set(list)];
}

async function inspectDomain() {
  const raw = inspectorDomainInput.value.trim();
  if (!raw) {
    showToast("⚠️ Vui lòng nhập tên miền cần chẩn đoán!");
    return;
  }

  const domainList = extractClientDomains(raw);
  if (domainList.length === 0) {
    showToast("⚠️ Không tìm thấy tên miền hợp lệ trong nội dung bạn nhập!");
    return;
  }

  if (domainList.length > 1) {
    showToast(`⚡ Nhận diện thông minh: ${domainList.length} tên miền! Đang tự động chuyển sang chế độ Quét Hàng Loạt...`);
    switchCheckSubTab("batch");
    const textarea = document.getElementById("batchCheckTextarea");
    if (textarea) textarea.value = domainList.join("\n");
    startBatchHealthInspection();
    return;
  }

  const dom = domainList[0];
  inspectorDomainInput.value = dom;
  inspectorLoading.style.display = "flex";
  inspectorResult.style.display = "none";

  try {
    const res = await fetch("/api/inspect-health", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain: dom }),
    });
    const data = await res.json();

    if (data.success) {
      if (data.isBatch && Array.isArray(data.reports)) {
        batchHealthReports = data.reports;
        switchCheckSubTab("batch");
        renderBatchCheckTable();
        return;
      }
      if (data.report) {
        renderInspectorResult(data.report);
      }
    } else {
      showToast("❌ Lỗi chẩn đoán: " + (data.error || "Thất bại"));
    }
  } catch (err) {
    showToast("❌ Lỗi chẩn đoán: " + err.message);
  } finally {
    inspectorLoading.style.display = "none";
  }
}

function renderInspectorResult(r) {
  if (!r || !inspectorResult) return;

  let scoreBadgeColor = "var(--accent-emerald)";
  let scoreBadgeText = "🟢 HOÀN HẢO - ĐANG CHẠY ỔN ĐỊNH";
  if (r.overallStatus === "CRITICAL") {
    scoreBadgeColor = "var(--accent-rose)";
    scoreBadgeText = "🔴 SỰ CỐ NGHIÊM TRỌNG - KHÔNG THỂ TRUY CẬP";
  } else if (r.overallStatus === "DEGRADED") {
    scoreBadgeColor = "var(--accent-amber)";
    scoreBadgeText = "🟡 CẢNH BÁO - CÓ LỖI CẦN KHẮC PHỤC";
  }

  // Checklist HTML
  const checklistHtml = (r.checklist || [])
    .map((c) => {
      const icon = c.passed ? "✅" : "❌";
      const titleColor = c.passed ? "var(--accent-emerald)" : "var(--accent-rose)";
      const bgColor = c.passed ? "rgba(16, 185, 129, 0.05)" : "rgba(244, 63, 94, 0.08)";
      const borderColor = c.passed ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.35)";

      return `
        <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 14px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-weight: 700; font-size: 13px; color: ${titleColor}; display: flex; align-items: center; gap: 8px;">
              <span>${icon}</span>
              <span>${c.title}</span>
            </div>
            <span style="font-size: 11px; font-weight: 600; color: ${c.passed ? "var(--accent-emerald)" : "var(--accent-rose)"}; background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 4px;">
              ${c.statusText}
            </span>
          </div>
          <div style="font-size: 12px; color: var(--text-dim); margin-left: 24px; line-height: 1.5;">
            ${c.detail}
          </div>
          ${
            !c.passed && c.actionGuide
              ? `
            <div style="margin-top: 8px; margin-left: 24px; padding: 8px 12px; background: rgba(245, 158, 11, 0.1); border-left: 3px solid var(--accent-amber); border-radius: 4px; font-size: 12px; color: #fff;">
              <strong style="color: var(--accent-amber);">💡 Cách xử lý:</strong> ${c.actionGuide}
            </div>
          `
              : ""
          }
        </div>
      `;
    })
    .join("");

  // Issues summary box
  let issuesBoxHtml = "";
  if (r.issues && r.issues.length > 0) {
    issuesBoxHtml = `
      <div style="background: rgba(244, 63, 94, 0.12); border: 1px solid rgba(244, 63, 94, 0.4); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          <span style="font-size: 20px;">🚨</span>
          <h4 style="color: var(--accent-rose); margin: 0; font-size: 15px;">Phát hiện ${r.issues.length} vấn đề cần khắc phục:</h4>
        </div>
        <ul style="margin: 0; padding-left: 24px; color: #fff; font-size: 13px; line-height: 1.6;">
          ${r.issues.map((iss) => `<li><b>${iss.title}:</b> <span style="color: var(--accent-amber);">${iss.statusText}</span> - ${iss.detail}</li>`).join("")}
        </ul>
      </div>
    `;
  }

      inspectorResult.style.display = "block";
      inspectorResult.innerHTML = `
        <!-- Health Score Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 18px 24px; margin-bottom: 20px;">
          <div>
            <div style="font-size: 13px; color: var(--text-dim);">Kết Quả Chẩn Đoán Sức Khỏe Cho:</div>
            <div style="font-size: 22px; font-weight: 800; color: #fff; font-family: var(--font-mono); margin-top: 2px;">
              ${r.domain}
            </div>
            <div style="font-size: 12px; font-weight: 700; color: ${scoreBadgeColor}; margin-top: 4px;">
              ${scoreBadgeText}
            </div>
          </div>

          <div style="text-align: right;">
            <div style="font-size: 32px; font-weight: 900; color: ${scoreBadgeColor}; font-family: var(--font-mono); line-height: 1;">
              ${r.healthPercent}%
            </div>
            <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">
              Đạt ${r.healthScore}/${r.maxScore} Tiêu Chí
            </div>
          </div>
        </div>

        ${issuesBoxHtml}

        <!-- 7-Point Checklist -->
        <div style="margin-bottom: 24px;">
          <h4 style="font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 12px;">📋 Chi Tiết 7 Tiêu Chí Kiểm Tra Hệ Thống:</h4>
          ${checklistHtml}
        </div>

        <!-- Master Action Buttons -->
        <div style="display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 16px;">
          ${
            r.healthScore < r.maxScore
              ? `
            <button class="btn btn-primary btn-lg" onclick="fixCurrentDomain('${r.domain}')" style="background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%); border-color: #f43f5e; box-shadow: 0 4px 15px rgba(244,63,94,0.4);">
              <span class="btn-icon">⚡</span>
              <span>TỰ ĐỘNG SỬA TẤT CẢ LỖI (1-CLICK AUTO FIX)</span>
            </button>
          `
              : `
            <div style="color: var(--accent-emerald); font-weight: 700; display: flex; align-items: center; gap: 8px; margin-right: auto;">
              <span>🎉</span>
              <span>Tên miền này đang hoàn hảo 100%, không phát hiện lỗi nào!</span>
            </div>
          `
          }
          <button class="btn btn-secondary" onclick="inspectDomain()">
            🔄 Quét Lại
          </button>
          ${
            r.detectedLink
              ? `
            <button class="btn btn-secondary" onclick="openEditLinkModal('${r.domain}', '${r.detectedLink}', '${r.detectedTele || ""}')">
              ✏️ Sửa Link
            </button>
            <button class="btn btn-secondary" onclick="openSwitchTemplateModal('${r.domain}', '', '${r.detectedLink}', '${r.detectedTele || ""}')">
              🎨 Đổi Mẫu
            </button>
          `
              : ""
          }
        </div>
      `;
}

async function fixCurrentDomain(domain) {
  showProcessingToast(domain);
  if (inspectorLoading) {
    inspectorLoading.style.display = "flex";
    inspectorLoading.querySelector("p").textContent = `Đang tự động sửa lỗi DNS, Pages & Deploy cho [${domain}]...`;
  }
  if (inspectorResult) inspectorResult.style.display = "none";

  try {
    const res = await fetch("/api/fix-domain", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();

    if (data.success) {
      showToast(`🎉 ĐÃ SỬA XONG CHO [${domain}]! Đang tải lại báo cáo sức khỏe...`, "success");
      // Re-inspect domain to show updated results
      await inspectDomain();
      fetchHistory();
    } else {
      showToast(`⚠️ Lỗi sửa miền: ${data.error || "Không thể tự sửa"}`);
      await inspectDomain();
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối: " + err.message);
    if (inspectorLoading) inspectorLoading.style.display = "none";
  }
}

// ── 6A. BATCH HEALTH INSPECTOR & BATCH AUTO FIX ────────────────────────────
let batchHealthReports = [];

function loadAllDomainsForBatchCheck() {
  const textarea = document.getElementById("batchCheckTextarea");
  if (!textarea) return;

  fetch("/api/domains-list?all=1&fields=names", { headers: authHeaders() })
    .then((r) => r.json())
    .then((data) => {
      if (data.success && Array.isArray(data.domains)) {
        const domainList = [...new Set(data.domains)].join("\n");
        textarea.value = domainList;
        showToast(`📋 Đã nạp ${data.domains.length} tên miền vào danh sách!`);
      }
    })
    .catch(() => showToast("❌ Không thể nạp danh sách miền"));
}

async function startBatchHealthInspection() {
  const textarea = document.getElementById("batchCheckTextarea");
  const rawText = textarea ? textarea.value.trim() : "";

  let domainList = [];
  if (rawText) {
    domainList = rawText
      .split(/[\n,;]+/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.includes("."));
  }

  const loading = document.getElementById("batchCheckLoading");
  const loadingText = document.getElementById("batchCheckLoadingText");
  const tableWrapper = document.getElementById("batchCheckTableWrapper");
  const statsBar = document.getElementById("batchCheckStatsBar");
  const fixAllBtn = document.getElementById("btnFixAllFailingDomains");

  if (loading) {
    loading.style.display = "flex";
    if (loadingText) loadingText.textContent = `Đang quét và chẩn đoán toàn diện cho ${domainList.length || "toàn bộ"} tên miền...`;
  }
  if (tableWrapper) tableWrapper.style.display = "none";
  if (statsBar) statsBar.style.display = "none";
  if (fixAllBtn) fixAllBtn.style.display = "none";

  showToast(`🩺 Đang bắt đầu chẩn đoán danh sách tên miền...`);

  try {
    const res = await fetch("/api/inspect-batch-health", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domains: domainList }),
    });
    const data = await res.json();

    if (data.success && Array.isArray(data.reports)) {
      batchHealthReports = data.reports;

      // Update stats
      const totalEl = document.getElementById("statBatchTotal");
      const healthyEl = document.getElementById("statBatchHealthy");
      const degradedEl = document.getElementById("statBatchDegraded");
      const criticalEl = document.getElementById("statBatchCritical");

      if (totalEl) totalEl.textContent = data.total;
      if (healthyEl) healthyEl.textContent = data.healthyCount;
      if (degradedEl) degradedEl.textContent = data.degradedCount;
      if (criticalEl) criticalEl.textContent = data.criticalCount;

      if (statsBar) statsBar.style.display = "flex";

      // Show Fix All button if there are errors
      const failingCount = data.total - data.healthyCount;
      if (fixAllBtn) {
        if (failingCount > 0) {
          fixAllBtn.style.display = "inline-flex";
          fixAllBtn.querySelector("span:last-child").textContent = `⚡ TỰ ĐỘNG SỬA TẤT CẢ ${failingCount} TÊN MIỀN BỊ LỖI (1-CLICK FIX ALL)`;
        } else {
          fixAllBtn.style.display = "none";
        }
      }

      renderBatchCheckTable();
      showToast(`✨ Đã chẩn đoán xong: ${data.healthyCount}/${data.total} tên miền đạt 100% sức khỏe!`);
    } else {
      showToast(`❌ Lỗi chẩn đoán: ${data.error || "Thất bại"}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  } finally {
    if (loading) loading.style.display = "none";
  }
}

function renderBatchCheckTable() {
  const tbody = document.getElementById("batchCheckTableBody");
  const tableWrapper = document.getElementById("batchCheckTableWrapper");
  if (!tbody || !tableWrapper) return;

  if (batchHealthReports.length === 0) {
    tableWrapper.style.display = "none";
    return;
  }

  tableWrapper.style.display = "block";
  tbody.innerHTML = batchHealthReports
    .map((r, index) => {
      let scoreBadgeColor = "var(--accent-emerald)";
      let scoreBadgeText = "🟢 100% Hoàn Hảo";
      if (r.overallStatus === "CRITICAL" || r.healthScore < 5) {
        scoreBadgeColor = "var(--accent-rose)";
        scoreBadgeText = "🔴 Sự Cố";
      } else if (r.overallStatus === "DEGRADED" || r.healthScore < r.maxScore) {
        scoreBadgeColor = "var(--accent-amber)";
        scoreBadgeText = "🟡 Cảnh Báo";
      }

      const issuesList = r.issues && r.issues.length > 0
        ? r.issues.map((i) => `<div style="color: var(--accent-amber); font-size: 11px;">• <b>${i.title}:</b> ${i.statusText}</div>`).join("")
        : `<span style="color: var(--accent-emerald); font-size: 11px;">✅ Đầy đủ 7 tiêu chí</span>`;

      const httpCheck = r.checklist?.find((c) => c.id === "http_live");
      const httpStatusBadge = httpCheck?.passed
        ? `<span style="color: var(--accent-emerald); font-weight: 700; font-size: 12px;">✅ 200 OK</span>`
        : `<span style="color: var(--accent-rose); font-weight: 700; font-size: 12px;">❌ ${httpCheck?.statusText || "522"}</span>`;

      return `
        <tr>
          <td style="color: var(--text-dim); font-family: var(--font-mono); font-size: 11px;">${index + 1}</td>
          <td>
            <a href="https://${r.domain}" target="_blank" class="dom-name-link" style="font-weight: 700;">
              ${r.domain}
            </a>
          </td>
          <td>
            <span style="font-weight: 800; font-family: var(--font-mono); color: ${scoreBadgeColor}; font-size: 14px;">
              ${r.healthScore}/${r.maxScore} (${r.healthPercent}%)
            </span>
          </td>
          <td>
            <span class="badge-status" style="background: rgba(0,0,0,0.3); color: ${scoreBadgeColor}; border: 1px solid ${scoreBadgeColor};">
              ${scoreBadgeText}
            </span>
          </td>
          <td>
            <div style="max-width: 320px;">${issuesList}</div>
          </td>
          <td>
            ${httpStatusBadge}
          </td>
          <td style="text-align: right; white-space: nowrap;">
            ${
              r.healthScore < r.maxScore
                ? `
              <button class="btn btn-primary btn-sm" onclick="fixSingleDomainFromBatch('${r.domain}')" style="background: var(--accent-rose); border-color: var(--accent-rose); padding: 3px 8px; font-size: 11px;">
                ⚡ Sửa Lỗi
              </button>
            `
                : ""
            }
            <button class="btn btn-secondary btn-sm" onclick="inspectSpecificDomain('${r.domain}')" style="padding: 3px 8px; font-size: 11px;">
              🔍 Xem
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function fixSingleDomainFromBatch(domain) {
  showProcessingToast(domain);
  try {
    const res = await fetch("/api/fix-domain", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain }),
    });
    const data = await res.json();
    if (data.success && data.report) {
      showToast(`🎉 Đã sửa xong cho [${domain}]!`, "success");
      const idx = batchHealthReports.findIndex((r) => r.domain === domain);
      if (idx !== -1) {
        batchHealthReports[idx] = data.report;
        renderBatchCheckTable();
      }
    } else {
      showToast(`⚠️ Lỗi sửa [${domain}]: ${data.error || "Thất bại"}`, "error");
    }
  } catch (e) {
    showToast(`❌ Lỗi kết nối: ${e.message}`, "error");
  }
}

async function startFixAllFailingDomains() {
  const failingReports = batchHealthReports.filter((r) => r.healthScore < r.maxScore);
  const failingDomains = failingReports.map((r) => r.domain);

  if (failingDomains.length === 0) {
    showToast("🎉 Tất cả các tên miền đều đang đạt chuẩn 100% sức khỏe!");
    return;
  }

  if (!confirm(`❓ Bạn có chắc chắn muốn TỰ ĐỘNG SỬA TOÀN BỘ ${failingDomains.length} tên miền bị lỗi này không?`)) {
    return;
  }

  const progressWrapper = document.getElementById("batchFixProgressWrapper");
  const progressBar = document.getElementById("batchFixProgressBar");
  const progressLabel = document.getElementById("batchFixProgressLabel");
  const progressPercent = document.getElementById("batchFixProgressPercent");
  const fixAllBtn = document.getElementById("btnFixAllFailingDomains");

  if (progressWrapper) progressWrapper.style.display = "block";
  if (fixAllBtn) fixAllBtn.disabled = true;

  showProcessingToast(`sửa ${failingDomains.length} miền`);

  let fixedCount = 0;
  for (let i = 0; i < failingDomains.length; i++) {
    const d = failingDomains[i];
    const pct = Math.round(((i + 1) / failingDomains.length) * 100);

    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
    if (progressLabel) progressLabel.textContent = `[${i + 1}/${failingDomains.length}] Đang tự động sửa cho: ${d}...`;

    try {
      const res = await fetch("/api/fix-domain", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ domain: d }),
      });
      const data = await res.json();
      if (data.success && data.report) {
        const idx = batchHealthReports.findIndex((r) => r.domain === d);
        if (idx !== -1) {
          batchHealthReports[idx] = data.report;
          renderBatchCheckTable();
        }
        if (data.report.healthScore === data.report.maxScore) fixedCount++;
      }
    } catch {}
  }

  if (progressLabel) progressLabel.textContent = `✨ Hoàn tất! Đã sửa thành công ${fixedCount}/${failingDomains.length} tên miền!`;
  if (fixAllBtn) fixAllBtn.disabled = false;

  showToast(`🎉 HOÀN TẤT BATCH FIX: Đã đưa ${fixedCount}/${failingDomains.length} tên miền về trạng thái 100% LIVE!`);
  fetchHistory();
}

// ── 6B. CLOUDFLARE API TOKEN MANAGER ──────────────────────────────────────
async function loadCurrentCfToken() {
  try {
    const res = await fetch("/api/cf-token", { headers: authHeaders() });
    const data = await res.json();
    const badge = document.getElementById("cfTokenStatusBadge");
    const input = document.getElementById("cfTokenInput");

    if (data.success && data.hasToken) {
      if (badge) {
        badge.className = "badge-status badge-success";
        badge.textContent = `🟢 Đã Cấu Hình: ${data.maskedToken}`;
      }
      if (input && !input.value) {
        input.placeholder = `Token hiện tại: ${data.maskedToken} (Nhập mã mới nếu muốn đổi)`;
      }
    } else {
      if (badge) {
        badge.className = "badge-status badge-warning";
        badge.textContent = "🟡 Chưa Cấu Hình Token";
      }
    }
  } catch (e) {
    console.warn("Lỗi nạp token:", e.message);
  }
}

function toggleTokenVisibility() {
  const input = document.getElementById("cfTokenInput");
  const btn = document.getElementById("btnToggleTokenVisibility");
  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (btn) btn.textContent = "🔒 Ẩn";
  } else {
    input.type = "password";
    if (btn) btn.textContent = "👁️ Hiện";
  }
}

async function checkCurrentCfToken() {
  const input = document.getElementById("cfTokenInput");
  const token = input ? input.value.trim() : "";
  const resultBox = document.getElementById("cfTokenVerifyResult");

  if (resultBox) {
    resultBox.style.display = "block";
    resultBox.style.background = "rgba(0,0,0,0.4)";
    resultBox.style.borderColor = "rgba(255,255,255,0.1)";
    resultBox.innerHTML = `⏳ Đang kiểm tra token trên máy chủ Cloudflare API...`;
  }

  try {
    const res = await fetch("/api/cf-token/verify", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ token }),
    });
    const data = await res.json();

    if (resultBox) {
      if (data.success && data.valid) {
        resultBox.style.background = "rgba(16, 185, 129, 0.12)";
        resultBox.style.borderColor = "rgba(16, 185, 129, 0.4)";
        resultBox.style.color = "var(--accent-emerald)";
        resultBox.innerHTML = `
          <div style="font-weight: 700; margin-bottom: 4px;">✅ TOKEN HỢP LỆ & ĐẦY ĐỦ QUYỀN HẠN!</div>
          <div style="color: #fff; font-size: 12px;">
            • Quản lý: <b style="color: var(--accent-cyan);">${data.zonesCount}</b> Zones & <b style="color: var(--accent-amber);">${data.pagesCount}</b> Cloudflare Pages Projects<br>
            • Quyền Pages: <b style="color: var(--accent-emerald);">Đầy đủ quyền Edit & Thêm Custom Domain</b><br>
            • Danh sách Pages: <code style="color: var(--text-dim);">${data.pagesProjects?.join(", ") || "N/A"}</code>
          </div>
        `;
        showToast("🎉 Mã API Token Cloudflare hợp lệ & đầy đủ quyền!");
      } else {
        resultBox.style.background = "rgba(244, 63, 94, 0.12)";
        resultBox.style.borderColor = "rgba(244, 63, 94, 0.4)";
        resultBox.style.color = "var(--accent-rose)";
        resultBox.innerHTML = `
          <div style="font-weight: 700; margin-bottom: 4px;">❌ TOKEN KHÔNG HỢP LỆ HOẶC THIẾU QUYỀN:</div>
          <div style="color: #fff; font-size: 12px;">${data.error || "Không thể xác thực token"}</div>
        `;
        showToast("⚠️ Token không hợp lệ hoặc thiếu quyền!");
      }
    }
  } catch (err) {
    if (resultBox) {
      resultBox.style.background = "rgba(244, 63, 94, 0.12)";
      resultBox.style.borderColor = "rgba(244, 63, 94, 0.4)";
      resultBox.style.color = "var(--accent-rose)";
      resultBox.innerHTML = `❌ Lỗi kết nối kiểm tra: ${err.message}`;
    }
  }
}

async function saveNewCfToken() {
  const input = document.getElementById("cfTokenInput");
  const token = input ? input.value.trim() : "";

  if (!token) {
    showToast("⚠️ Vui lòng nhập mã API Token để lưu!");
    return;
  }

  showToast("⏳ Đang lưu và kiểm tra token mới...");
  try {
    const res = await fetch("/api/cf-token/save", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ token }),
    });
    const data = await res.json();

    if (data.success) {
      showToast("🎉 ĐÃ LƯU TOKEN THÀNH CÔNG!");
      loadCurrentCfToken();
      checkCurrentCfToken();
    } else {
      showToast(`❌ Lỗi lưu token: ${data.error || "Thất bại"}`);
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối: " + err.message);
  }
}

function quickBuyDomain(domain) {
  document.querySelector('.nav-tab[data-tab="tab-buy"]').click();
  document.querySelector('.sub-pill[data-sub="buy-lp"]').click();
  document.getElementById("buyLpDomain").value = domain;
  document.getElementById("buyLpDomain").focus();
}

function quickBuy302(domain) {
  document.querySelector('.nav-tab[data-tab="tab-buy"]').click();
  document.querySelector('.sub-pill[data-sub="buy-302"]').click();
  document.getElementById("buy302Domain").value = domain;
  document.getElementById("buy302Domain").focus();
}

function quickPoint302(domain, link) {
  document.querySelector('.nav-tab[data-tab="tab-point"]').click();
  document.querySelector('.sub-pill[data-sub="point-302"]').click();
  document.getElementById("point302Domain").value = domain;
  if (link) document.getElementById("point302Link").value = link;
  document.getElementById("point302Link").focus();
}

// ── 7. MODALS HELPERS ──────────────────────────────────────────────────────
function ensureModalPortal(modal) {
  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
}

function closeAllModals(exceptId = null) {
  document.querySelectorAll(".modal").forEach((m) => {
    if (m.id && m.id !== exceptId) {
      m.classList.remove("active");
      m.style.display = "none";
    }
  });
  if (!exceptId) {
    document.body.classList.remove("modal-open");
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  closeAllModals(modalId);
  ensureModalPortal(modal);
  document.body.classList.add("modal-open");
  modal.classList.add("active");
  modal.style.display = "flex";
  requestAnimationFrame(() => {
    const focusable = modal.querySelector(
      "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])"
    );
    if (focusable) focusable.focus({ preventScroll: true });
  });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
  if (modalId === "topupModal" && typeof stopTopupBalancePoll === "function") {
    stopTopupBalancePoll();
  }
  if (!document.querySelector(".modal.active")) {
    document.body.classList.remove("modal-open");
  }
}

function openPreviewModal(templateId) {
  const t = allTemplates.find((x) => x.id === templateId);
  if (!t) return;
  selectedTemplate = t;

  document.getElementById("modalTitle").textContent = t.title || t.name;
  document.getElementById("modalTarget").textContent = `Mẫu · ${getTemplateLiveName(t)}`;
  document.getElementById("modalImage").src = t.screenshotUrl || getFallbackPlaceholder(t.name);
  document.getElementById("modalLiveDemo").href = getTemplateLiveUrl(t);

  const selectBtn = document.getElementById("modalSelectBtn");
  if (selectBtn) {
    selectBtn.onclick = () => {
      closeModal("previewModal");
      const buyTab = document.querySelector('.nav-tab[data-tab="tab-buy"]');
      if (buyTab) buyTab.click();
      if (buyLpTemplateSelect) {
        buyLpTemplateSelect.value = t.id;
        triggerTemplatePreviewChange(t.id, buyLpTemplatePreview);
      }
      const domainInput = document.getElementById("buyLpDomain");
      if (domainInput) domainInput.focus();
      showToast(`🎯 Đã chọn mẫu [${t.name}]! Vui lòng nhập tên miền.`);
    };
  }

  openModal("previewModal");
}

function openEditLinkModal(domain, currentLink = "", currentTele = "") {
  activeDomainToEdit = domain;
  const sub = document.getElementById("editLinkDomainSubtitle");
  const linkInp = document.getElementById("editLinkInput");
  const teleInp = document.getElementById("editTeleInput");

  if (sub) sub.textContent = `Tên miền: ${domain}`;
  if (linkInp) linkInp.value = currentLink && currentLink !== "Chưa gán link" ? currentLink : "";
  if (teleInp) teleInp.value = currentTele || "";

  openModal("editLinkModal");
  requestAnimationFrame(() => {
    if (linkInp) linkInp.focus({ preventScroll: true });
  });
}

function openBatchSetLinkModal() {
  openModal("batchSetLinkModal");
  requestAnimationFrame(() => {
    const ta = document.getElementById("batchDomainsTextarea");
    if (ta) ta.focus({ preventScroll: true });
  });
}

function openQuickDeployModal() {
  openVisualTemplatePicker("buy");
}

// ── 8. VISUAL TEMPLATE PICKER & CONFIRMATION FLOW ───────────────────────────
if (historySearchInput) {
  historySearchInput.addEventListener("input", (e) => {
    currentHistorySearch = e.target.value.trim();
    if (clearHistorySearch) clearHistorySearch.style.display = currentHistorySearch ? "block" : "none";
    clearTimeout(historySearchTimer);
    historySearchTimer = setTimeout(() => fetchHistory(1), 350);
  });
}

if (clearHistorySearch) {
  clearHistorySearch.addEventListener("click", () => {
    historySearchInput.value = "";
    currentHistorySearch = "";
    clearHistorySearch.style.display = "none";
    fetchHistory(1);
    historySearchInput.focus();
  });
}

if (refreshHistoryBtn) {
  refreshHistoryBtn.addEventListener("click", () => {
    fetchHistory(historyPage);
    showToast("🔄 Đang làm mới lịch sử...");
  });
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", async () => {
    if (!confirm("❓ Bạn có chắc chắn muốn xoá toàn bộ lịch sử không?")) return;
    try {
      const res = await fetch("/api/history/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showToast("🗑️ Đã xoá sạch lịch sử thành công!");
        fetchHistory();
      }
    } catch (err) {
      showToast("❌ Không thể xoá lịch sử: " + err.message);
    }
  });
}

function openVisualTemplatePicker(targetType, domain = null, currentLink = null, currentTele = null) {
  pickerContext = {
    targetType,
    domain: domain || activeDomainToEdit,
    link: currentLink,
    tele: currentTele,
  };

  const titleEl = document.getElementById("templatePickerModalTitle");
  const subtitleEl = document.getElementById("templatePickerModalSubtitle");

  if (targetType === "switch" && pickerContext.domain) {
    if (titleEl) titleEl.textContent = `🎨 Chọn Mẫu Cho Tên Miền: ${pickerContext.domain}`;
    if (subtitleEl) subtitleEl.textContent = `Bấm chọn mẫu để chuyển đổi giao diện và tự động tắt 302 cũ nếu có`;
  } else if (targetType === "buy") {
    if (titleEl) titleEl.textContent = `🚀 Chọn Mẫu Để Mua Tên Miền Mới`;
    if (subtitleEl) subtitleEl.textContent = `Xem ảnh thực tế các mẫu giao diện và bấm chọn mẫu phù hợp`;
  } else {
    if (titleEl) titleEl.textContent = `⚡ Chọn Mẫu Cho Tên Miền Có Sẵn`;
    if (subtitleEl) subtitleEl.textContent = `Xem ảnh thực tế các mẫu giao diện và bấm chọn mẫu phù hợp`;
  }

  // Update counts in picker modal
  const counts = { all: allTemplates.length, GG88: 0, LLWIN: 0, MM88: 0 };
  allTemplates.forEach((t) => {
    const b = t.brand || "GG88";
    if (counts[b] !== undefined) counts[b]++;
  });
  const cAll = document.getElementById("pickerCountAll");
  const cGG = document.getElementById("pickerCountGG88");
  const cLL = document.getElementById("pickerCountLLWIN");
  const cMM = document.getElementById("pickerCountMM88");
  const cXX = document.getElementById("pickerCountXX88");
  if (cAll) cAll.textContent = counts.all;
  if (cGG) cGG.textContent = counts.GG88;
  if (cLL) cLL.textContent = counts.LLWIN;
  if (cMM) cMM.textContent = counts.MM88;
  if (cXX) cXX.textContent = counts.XX88 || 0;

  renderPickerTemplates();
  openModal("templatePickerModal");
}

function renderPickerTemplates() {
  const grid = document.getElementById("pickerTemplatesGrid");
  if (!grid) return;

  const filtered = allTemplates.filter((t) => {
    const brand = t.brand || "GG88";
    const matchesBrand = pickerBrandFilter === "all" || brand.toUpperCase() === pickerBrandFilter.toUpperCase();
    const query = pickerSearch.toLowerCase();
    const matchesSearch =
      !query ||
      (t.name && t.name.toLowerCase().includes(query)) ||
      (t.title && t.title.toLowerCase().includes(query)) ||
      (t.folder && t.folder.toLowerCase().includes(query)) ||
      (t.cnameTarget && t.cnameTarget.toLowerCase().includes(query)) ||
      (t.pagesProject && t.pagesProject.toLowerCase().includes(query));
    return matchesBrand && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);">
        <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
        <p>Không tìm thấy mẫu nào phù hợp với từ khoá "${pickerSearch}"</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map((t) => {
      const brand = t.brand || "GG88";
      const brandBadgeClass = `badge-${brand.toLowerCase()}`;
      const imgSrc = t.screenshotUrl || getFallbackPlaceholder(t.name);

      return `
        <div class="template-card" onclick="openConfirmSelectTemplateModal('${t.id}')" style="cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; border: 1px solid var(--border-subtle);">
          <div class="template-thumbnail" style="height: 140px;">
            <img src="${imgSrc}" alt="${t.name}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
            <span class="brand-badge ${brandBadgeClass}">${brand}</span>
          </div>
          <div class="template-body" style="padding: 12px;">
            <h4 class="template-title" style="font-size: 13px; line-height: 1.3; height: 34px; overflow: hidden;" title="${t.name}">${t.name}</h4>
            <a href="${getTemplateLiveUrl(t)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" style="display: block; font-size: 11px; color: var(--accent-cyan); font-family: var(--font-mono); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none;">
              ${getTemplateLiveName(t)} ↗
            </a>
            <button type="button" class="btn btn-primary btn-sm" style="width: 100%; margin-top: 8px;" onclick="event.stopPropagation(); openConfirmSelectTemplateModal('${t.id}')">
              📌 Chọn Mẫu Này
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function openConfirmSelectTemplateModal(templateId) {
  const t = allTemplates.find((x) => x.id === templateId);
  if (!t) return;
  selectedPickerTemplate = t;

  const imgEl = document.getElementById("confirmTplPreviewImg");
  const nameEl = document.getElementById("confirmTplName");
  const brandEl = document.getElementById("confirmTplBrandBadge");
  const cnameEl = document.getElementById("confirmTplCname");
  const liveDemoBtn = document.getElementById("confirmTplLiveDemoBtn");
  const contextBox = document.getElementById("confirmTplContextBox");

  if (imgEl) imgEl.src = t.screenshotUrl || getFallbackPlaceholder(t.name);
  if (nameEl) nameEl.textContent = t.name;
  if (brandEl) {
    const brand = t.brand || "GG88";
    brandEl.className = `brand-badge badge-${brand.toLowerCase()}`;
    brandEl.textContent = brand;
  }
  if (cnameEl) {
    cnameEl.innerHTML = `<a href="${getTemplateLiveUrl(t)}" target="_blank" rel="noopener noreferrer" style="color: inherit;">Mẫu · ${getTemplateLiveName(t)} ↗</a>`;
  }
  if (liveDemoBtn) liveDemoBtn.href = getTemplateLiveUrl(t);

  if (contextBox) {
    const { targetType, domain } = pickerContext;
    if (targetType === "switch" && domain) {
      contextBox.innerHTML = `
        <div><b>🌐 Tên miền:</b> <code style="color: var(--accent-cyan); font-size: 14px;">${domain}</code></div>
        <div style="margin-top: 4px;">❓ Bạn có chắc chắn muốn <b>đổi sang mẫu [${t.name}]</b> không?</div>
        <div style="margin-top: 6px; font-size: 12px; color: var(--text-dim);">
          ⚡ Hệ thống sẽ tự động tắt rule 302 cũ nếu có, cập nhật CNAME và Git Push kích hoạt ngay lập tức!
        </div>
      `;
    } else if (targetType === "buy") {
      contextBox.innerHTML = `
        <div>❓ Bạn có chắc chắn muốn chọn mẫu <b>[${t.name}]</b> để đăng ký tên miền?</div>
        <div style="margin-top: 6px; font-size: 12px; color: var(--text-dim);">
          ⚡ Sau khi chọn, hệ thống sẽ tự động gán vào form mua miền cho bạn.
        </div>
      `;
    } else {
      contextBox.innerHTML = `
        <div>❓ Bạn có chắc chắn muốn gán mẫu <b>[${t.name}]</b> cho tên miền có sẵn?</div>
        <div style="margin-top: 6px; font-size: 12px; color: var(--text-dim);">
          ⚡ Sau khi chọn, hệ thống sẽ tự động gán vào form cấu hình.
        </div>
      `;
    }
  }

  openModal("confirmSelectTemplateModal");
}

function setupPickerListeners() {
  const filterTabs = document.querySelectorAll("#pickerFilterTabs .filter-tab");
  filterTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterTabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      pickerBrandFilter = btn.dataset.brand;
      renderPickerTemplates();
    });
  });

  const searchInp = document.getElementById("pickerSearchInput");
  if (searchInp) {
    searchInp.addEventListener("input", (e) => {
      pickerSearch = e.target.value.trim();
      renderPickerTemplates();
    });
  }

  const confirmBtn = document.getElementById("btnConfirmSelectTpl");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      if (!selectedPickerTemplate) return;
      const t = selectedPickerTemplate;
      const { targetType, domain, link, tele, batchRowIndex } = pickerContext;

      closeModal("confirmSelectTemplateModal");
      closeModal("templatePickerModal");

      if (targetType === "switch") {
        const targetDomain = domain || activeDomainToEdit;
        if (targetDomain) {
          openSwitchTemplateModal(targetDomain, t.id, link, tele);
          showToast(`✅ Đã chọn mẫu [${t.name}]! Bấm "🚀 Thực Hiện Đổi Mẫu" để kích hoạt.`);
        }
      } else if (targetType === "buy") {
        if (buyLpTemplateSelect) {
          buyLpTemplateSelect.value = t.id;
          updateTemplatePreview(t.id, "buy");
        }
        document.querySelector('.nav-tab[data-tab="tab-buy"]')?.click();
        showToast(`✅ Đã chọn mẫu [${t.name}] cho Form Mua Miền!`);
      } else if (targetType === "point") {
        if (pointLpTemplateSelect) {
          pointLpTemplateSelect.value = t.id;
          updateTemplatePreview(t.id, "point");
        }
        document.querySelector('.nav-tab[data-tab="tab-point"]')?.click();
        showToast(`✅ Đã chọn mẫu [${t.name}] cho Form Trỏ Miền!`);
      } else if (targetType === "batch-global") {
        const gSelect = document.getElementById("batchGlobalTemplateSelect");
        if (gSelect) {
          gSelect.value = t.id;
          updateBatchGlobalThumbnail(t.id);
        }
        let appliedCount = 0;
        batchItems.forEach((item) => {
          item.templateId = t.id;
          appliedCount++;
        });
        renderBatchTable();
        showToast(`✨ Đã chọn mẫu [${t.name}] và gán cho toàn bộ ${appliedCount} tên miền!`);
      } else if (targetType === "batch" && batchRowIndex !== undefined) {
        if (batchItems[batchRowIndex]) {
          batchItems[batchRowIndex].templateId = t.id;
          renderBatchTable();
          showToast(`✅ Đã chọn mẫu [${t.name}] cho dòng #${batchRowIndex + 1}!`);
        }
      }
    });
  }
}

// ── 8B. BATCH SMART PARSER & MULTI-DOMAIN DEPLOYER (TAB BATCH) ──────────────
let batchItems = [];
let isBatchRunning = false;
let isBatchStopped = false;

function setBatchFeedback(msg, type = "error") {
  const fb = document.getElementById("batchParseFeedback");
  if (!fb) return;
  fb.style.display = "block";
  if (type === "error") {
    fb.style.background = "rgba(244, 63, 94, 0.15)";
    fb.style.border = "1px solid rgba(244, 63, 94, 0.4)";
    fb.style.color = "#fda4af";
  } else if (type === "success") {
    fb.style.background = "rgba(16, 185, 129, 0.15)";
    fb.style.border = "1px solid rgba(16, 185, 129, 0.4)";
    fb.style.color = "#6ee7b7";
  } else if (type === "warning") {
    fb.style.background = "rgba(245, 158, 11, 0.15)";
    fb.style.border = "1px solid rgba(245, 158, 11, 0.4)";
    fb.style.color = "#fcd34d";
  }
  fb.innerHTML = msg;
}

function clearBatchFeedback() {
  const fb = document.getElementById("batchParseFeedback");
  if (fb) {
    fb.style.display = "none";
    fb.innerHTML = "";
  }
}

window.handleBatchParseClick = function () {
  const rawTextarea = document.getElementById("batchRawText");
  const text = rawTextarea ? rawTextarea.value.trim() : "";
  if (!text) {
    setBatchFeedback("⚠️ Vui lòng dán văn bản danh sách tên miền & link vào ô trước khi bấm Phân Tích!", "warning");
    showToast("⚠️ Vui lòng dán văn bản danh sách tên miền & link trước!");
    return;
  }
  parseBatchRawText(text);
};

window.handleBatchSampleClick = function () {
  const sampleText = `1: trangchugg88.com trỏ qua link : https://gg8845.com/?id=489735814
2: ggsing88.com trỏ qua link : https://gg8845.com/?id=489735814
3: gg88tong.us trỏ qua link : https://gg8845.com/?id=489735814
4: gg8us.com trỏ qua link : https://gg8845.com/?id=489735814
5 : gg88tong.co trỏ qua link : https://gg8832.com/?id=825873513`;
  const rawTextarea = document.getElementById("batchRawText");
  if (rawTextarea) rawTextarea.value = sampleText;
  parseBatchRawText(sampleText);
};

window.handleBatchPasteClick = async function () {
  const rawTextarea = document.getElementById("batchRawText");
  try {
    const text = await navigator.clipboard.readText();
    if (text && rawTextarea) {
      rawTextarea.value = text;
      parseBatchRawText(text);
      showToast("📋 Đã dán nội dung từ Clipboard và phân tích!");
    }
  } catch (err) {
    showToast("⚠️ Vui lòng ấn Ctrl+V để dán trực tiếp vào ô nhập.");
  }
};

window.handleBatchClearClick = function () {
  const rawTextarea = document.getElementById("batchRawText");
  if (rawTextarea) rawTextarea.value = "";
  batchItems = [];
  clearBatchFeedback();
  const resSec = document.getElementById("batchResultSection");
  if (resSec) resSec.style.display = "none";
  showToast("🗑️ Đã xoá toàn bộ văn bản!");
};

function setupBatchTab() {
  const btnParse = document.getElementById("btnBatchParse");
  const btnSample = document.getElementById("btnBatchSample");
  const btnPaste = document.getElementById("btnBatchPasteClipboard");
  const btnClear = document.getElementById("btnBatchClear");
  const btnAddRow = document.getElementById("btnBatchAddRow");
  const btnApplyGlobal = document.getElementById("btnBatchApplyGlobalTpl");
  const selectAll = document.getElementById("batchSelectAll");
  const btnStart = document.getElementById("btnStartBatchExecution");
  const btnStop = document.getElementById("btnStopBatchExecution");
  const rawTextarea = document.getElementById("batchRawText");

  if (btnParse) {
    btnParse.onclick = window.handleBatchParseClick;
  }

  if (btnSample) {
    btnSample.onclick = window.handleBatchSampleClick;
  }

  if (btnPaste) {
    btnPaste.onclick = window.handleBatchPasteClick;
  }

  if (btnClear) {
    btnClear.onclick = window.handleBatchClearClick;
  }

  if (btnAddRow) {
    btnAddRow.addEventListener("click", () => {
      const defaultTpl = allTemplates.find(t => t.id === 'gg88_lp_5uae')?.id || allTemplates[0]?.id || "";
      batchItems.push({
        id: "batch_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
        selected: true,
        domain: "",
        link: "https://",
        tele: "",
        templateId: defaultTpl,
        status: "ready",
        statusText: "Sẵn sàng",
        error: null,
      });
      renderBatchTable();
    });
  }

  if (btnApplyGlobal) {
    btnApplyGlobal.addEventListener("click", () => {
      const gTplSelect = document.getElementById("batchGlobalTemplateSelect");
      const chosenTpl = gTplSelect ? gTplSelect.value : "";
      if (!chosenTpl) return;

      let appliedCount = 0;
      batchItems.forEach((item) => {
        if (item.selected) {
          item.templateId = chosenTpl;
          appliedCount++;
        }
      });
      renderBatchTable();
      showToast(`✨ Đã áp dụng mẫu cho ${appliedCount} tên miền được chọn!`);
    });
  }

  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      batchItems.forEach((item) => (item.selected = isChecked));
      renderBatchTable();
    });
  }

  if (btnStart) {
    btnStart.addEventListener("click", startBatchExecution);
  }

  if (btnStop) {
    btnStop.addEventListener("click", () => {
      isBatchStopped = true;
      showToast("⏹️ Đang dừng tiến trình chạy hàng loạt...");
    });
  }
}

function parseBatchRawText(text) {
  if (!text || typeof text !== "string") return;

  const rawLines = text.split(/\r?\n/);
  const cleanedLines = [];

  // Regex lọc bỏ header tin nhắn / thời gian telegram / zalo / skype
  const chatHeaderRegex = /^\[?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s+\d{1,2}:\d{1,2}(?::\d{1,2})?\]?\s*[-:]?\s*[^:]+:\s*/i;
  const timeHeaderRegex = /^\[\d{1,2}:\d{1,2}(?::\d{1,2})?\]\s*[^:]*:\s*/i;

  for (let l of rawLines) {
    let line = l.trim();
    if (!line) continue;
    line = line.replace(chatHeaderRegex, "").replace(timeHeaderRegex, "").trim();
    if (line) cleanedLines.push(line);
  }

  const urlRegex = /(https?:\/\/[^\s"'<>\n]+)/gi;
  const teleRegex = /(https?:\/\/t\.me\/[^\s"'<>\n]+|@[a-zA-Z0-9_]{4,})/i;
  const domainRegex = /([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)/i;

  const defaultTpl = allTemplates.find((t) => t.id === "gg88_lp_5uae")?.id || allTemplates[0]?.id || "";
  const rawResults = [];
  let pendingItem = null;

  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];
    let remaining = line;

    // 1. Nhận diện Telegram
    let tele = "";
    const teleMatch = remaining.match(teleRegex);
    if (teleMatch) {
      tele = teleMatch[1];
      remaining = remaining.replace(teleMatch[0], " ");
    }

    // 2. Nhận diện các liên kết URLs
    const allUrls = remaining.match(urlRegex) || [];

    // Lọc bỏ từ ngữ đệm trong tin nhắn chat
    remaining = remaining
      .replace(/^(?:trỏ\s+về|trỏ\s+qua|chuyển\s+về|link\s+đăng\s+kí|link\s+đăng\s+ký|link\s+dk|link\s+aff|link\s+ref|link\s+này)\s*:?/gi, " ")
      .replace(/link\s+(?:đăng\s+kí|đăng\s+ký|dk|dki|aff|ref|target)/gi, " ")
      .replace(/(?:trỏ\s+về|trỏ\s+qua|chuyển\s+về|nhờ\s+trỏ|gắn\s+vào|mua\s+giúp\s+em(?:\s+tên\s+miền\s+này\s*:)?|link\s+này\s+giúp\s+em\s+với\s+ạ\s*:?)\s*:?/gi, " ")
      .replace(/->|=>|\|/g, " ")
      .trim();

    // Phân tích trường hợp 1: Dòng chứa cả tên miền gốc dạng URL và link đích (2 URLs)
    if (allUrls.length >= 2) {
      if (pendingItem) {
        rawResults.push(pendingItem);
        pendingItem = null;
      }
      try {
        const u1 = new URL(allUrls[0]);
        const dom = u1.hostname.replace(/^www\./i, "").toLowerCase();
        const target = allUrls[1];
        rawResults.push({
          domain: dom,
          link: target,
          tele: tele,
        });
        continue;
      } catch (e) {}
    }

    // Phân tích trường hợp 2: Dòng chứa 1 URL
    if (allUrls.length === 1) {
      const url = allUrls[0];
      remaining = remaining.replace(url, " ").trim();

      const domMatch = remaining.match(domainRegex);
      let dom = domMatch ? domMatch[1].toLowerCase().replace(/^www\./i, "") : null;

      if (dom && !dom.includes("google") && !dom.includes("t.me") && !dom.includes("telegram")) {
        if (pendingItem) {
          rawResults.push(pendingItem);
          pendingItem = null;
        }
        rawResults.push({
          domain: dom,
          link: url,
          tele: tele,
        });
        continue;
      } else {
        if (pendingItem) {
          pendingItem.link = url;
          if (tele) pendingItem.tele = tele;
          rawResults.push(pendingItem);
          pendingItem = null;
          continue;
        } else {
          try {
            const u = new URL(url);
            if (!u.search && (!u.pathname || u.pathname === "/")) {
              const domFromUrl = u.hostname.replace(/^www\./i, "").toLowerCase();
              if (domFromUrl && !domFromUrl.includes("google") && !domFromUrl.includes("t.me")) {
                pendingItem = {
                  domain: domFromUrl,
                  link: "https://",
                  tele: tele,
                };
                continue;
              }
            }
          } catch (e) {}
        }
      }
    }

    // Phân tích trường hợp 3: Dòng không có URL mà chỉ có tên miền
    if (allUrls.length === 0) {
      const domMatch = remaining.match(domainRegex);
      if (domMatch) {
        const dom = domMatch[1].toLowerCase().replace(/^www\./i, "");
        if (!dom.includes("google") && !dom.includes("t.me") && !dom.includes("telegram")) {
          if (pendingItem) {
            rawResults.push(pendingItem);
          }
          pendingItem = {
            domain: dom,
            link: "https://",
            tele: tele,
          };
          continue;
        }
      }
    }
  }

  if (pendingItem) {
    rawResults.push(pendingItem);
  }

  if (rawResults.length === 0) {
    const previewTxt = text.length > 50 ? text.slice(0, 50) + "..." : text;
    const errorMsg = `⚠️ <b>Không tìm thấy tên miền hợp lệ nào:</b> "<code>${escapeHtml(previewTxt)}</code>"<br><span style="font-size: 12px; opacity: 0.9; margin-top: 5px; display: inline-block;">💡 Vui lòng nhập đúng định dạng tên miền (Ví dụ: <code>abc.com</code> hoặc <code>abc.com trỏ qua link https://...</code>) hoặc bấm nút <b>'💡 Dán Ví Dụ Mẫu'</b> ở trên để thử.</span>`;
    setBatchFeedback(errorMsg, "error");
    showToast("⚠️ Không tìm thấy tên miền hợp lệ!");
    return;
  }

  const parsed = rawResults.map((item, idx) => ({
    id: "batch_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6) + "_" + idx,
    selected: true,
    domain: item.domain,
    link: item.link || "https://",
    tele: item.tele || "",
    templateId: defaultTpl,
    status: "ready",
    statusText: "Sẵn sàng",
    error: null,
  }));

  batchItems = parsed;
  populateBatchGlobalTemplateSelect();
  renderBatchTable();

  const resSec = document.getElementById("batchResultSection");
  if (resSec) {
    resSec.style.display = "block";
    resSec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  setBatchFeedback(`🎉 <b>Phân tích thành công ${parsed.length} tên miền!</b> Hãy kiểm tra và điều chỉnh các dòng trong bảng cấu hình bên dưới.`, "success");
  showToast(`🎉 Đã phân tích thông minh thành công ${parsed.length} tên miền!`);
}

function updateBatchGlobalThumbnail(tplId) {
  const imgEl = document.getElementById("batchGlobalTplThumb");
  if (!imgEl) return;
  if (tplId === "302_DIRECT") {
    imgEl.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='70' viewBox='0 0 100 70'><rect width='100%' height='100%' fill='%231e293b'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2338bdf8' font-size='12' font-family='sans-serif' font-weight='bold'>302 REDIRECT</text></svg>";
    return;
  }
  const t = allTemplates.find((x) => x.id === tplId);
  if (t) {
    imgEl.src = t.screenshotUrl || getFallbackPlaceholder(t.name);
  }
}

function openVisualPickerForGlobalBatch() {
  pickerContext = {
    targetType: "batch-global",
  };

  const titleEl = document.getElementById("templatePickerModalTitle");
  const subtitleEl = document.getElementById("templatePickerModalSubtitle");
  if (titleEl) titleEl.textContent = "🎨 Chọn Mẫu Giao Diện Cho Tất Cả Tên Miền Hàng Loạt";
  if (subtitleEl) subtitleEl.textContent = "Bấm vào mẫu bạn ưng ý để gán nhanh cho toàn bộ danh sách tên miền đang cấu hình";

  renderPickerTemplates();
  openModal("templatePickerModal");
}

function populateBatchGlobalTemplateSelect() {
  const gSelect = document.getElementById("batchGlobalTemplateSelect");
  if (!gSelect) return;

  const defaultTpl = allTemplates.find((t) => t.id === "gg88_lp_5uae")?.id || allTemplates[0]?.id;

  let optionsHtml = `<option value="302_DIRECT">⚡ Trỏ 302 Trực Tiếp (Forwarding)</option>`;
  optionsHtml += allTemplates
    .map((t) => {
      const selected = t.id === defaultTpl ? "selected" : "";
      return `<option value="${t.id}" ${selected}>[${t.brand || "GG88"}] ${t.name}</option>`;
    })
    .join("");

  gSelect.innerHTML = optionsHtml;
  updateBatchGlobalThumbnail(defaultTpl);

  gSelect.onchange = function () {
    updateBatchGlobalThumbnail(this.value);
  };
}

function renderBatchTable() {
  const tbody = document.getElementById("batchTableBody");
  const countEl = document.getElementById("batchItemCount");
  const selCountEl = document.getElementById("batchSelectedCount");
  if (!tbody) return;

  const selectedCount = batchItems.filter((i) => i.selected).length;
  if (countEl) countEl.textContent = batchItems.length;
  if (selCountEl) selCountEl.textContent = `Đã chọn: ${selectedCount}`;

  tbody.innerHTML = batchItems
    .map((item, index) => {
      let tplOptionsHtml = `<option value="302_DIRECT" ${item.templateId === "302_DIRECT" ? "selected" : ""}>⚡ Trỏ 302 Trực Tiếp</option>`;
      tplOptionsHtml += allTemplates
        .map((t) => {
          const isSel = item.templateId === t.id ? "selected" : "";
          return `<option value="${t.id}" ${isSel}>[${t.brand || "GG88"}] ${t.name}</option>`;
        })
        .join("");

      let statusBadge = `<span style="color: var(--text-dim); font-size: 11px;">⏳ Sẵn sàng</span>`;
      if (item.status === "running") {
        statusBadge = `<span style="color: var(--accent-amber); font-weight: 600; font-size: 11px;"><span class="spinner" style="width: 10px; height: 10px; display: inline-block; vertical-align: middle; margin-right: 4px;"></span>${item.statusText}</span>`;
      } else if (item.status === "success") {
        statusBadge = `<span style="color: var(--accent-emerald); font-weight: 700; font-size: 11px;">✅ Hoàn tất</span>`;
      } else if (item.status === "error") {
        statusBadge = `
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="color: var(--accent-rose); font-weight: 600; font-size: 11px;" title="${item.error || ""}">❌ Lỗi</span>
            <button type="button" class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 10px; color: #f59e0b;" onclick="retrySingleBatchRow(${index})" title="Thử lại riêng tên miền này">
              🔄 Thử lại
            </button>
          </div>
        `;
      }

      return `
        <tr class="batch-row-card" data-index="${index}" style="${item.status === 'running' ? 'background: rgba(99, 102, 241, 0.08);' : ''}">
          <td class="batch-cell-check" data-label="Chọn" style="text-align: center;">
            <input type="checkbox" class="batch-row-checkbox" data-index="${index}" ${item.selected ? "checked" : ""} ${isBatchRunning ? "disabled" : ""}>
          </td>
          <td class="batch-cell-stt" data-label="STT" style="color: var(--text-dim); font-family: var(--font-mono); font-size: 11px;">${index + 1}</td>
          <td class="batch-cell-domain" data-label="Tên miền">
            <input type="text" class="batch-domain-inp" data-index="${index}" value="${item.domain}" placeholder="domain.com" ${isBatchRunning ? "disabled" : ""}>
          </td>
          <td class="batch-cell-link" data-label="Link đích">
            <input type="text" class="batch-link-inp" data-index="${index}" value="${item.link}" placeholder="https://gg88..." ${isBatchRunning ? "disabled" : ""}>
          </td>
          <td class="batch-cell-tele" data-label="Telegram CSKH">
            <input type="text" class="batch-tele-inp" data-index="${index}" value="${item.tele}" placeholder="https://t.me/..." ${isBatchRunning ? "disabled" : ""}>
          </td>
          <td class="batch-cell-tpl" data-label="Mẫu / Chế độ">
            <div class="batch-tpl-select-cell">
              <select class="batch-tpl-select" data-index="${index}" ${isBatchRunning ? "disabled" : ""}>
                ${tplOptionsHtml}
              </select>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openVisualPickerForBatchRow(${index})" title="Mở kho ảnh mẫu trực quan" ${isBatchRunning ? "disabled" : ""}>
                🎨
              </button>
            </div>
          </td>
          <td class="batch-cell-status" data-label="Trạng thái">
            ${statusBadge}
          </td>
          <td class="batch-cell-del" data-label="Xoá" style="text-align: center;">
            <button type="button" class="btn-clear" onclick="deleteBatchRow(${index})" title="Xoá dòng này" ${isBatchRunning ? "disabled" : ""}>&times;</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll(".batch-row-checkbox").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      batchItems[idx].selected = e.target.checked;
      const sel = batchItems.filter((i) => i.selected).length;
      if (selCountEl) selCountEl.textContent = `Đã chọn: ${sel}`;
    });
  });

  tbody.querySelectorAll(".batch-domain-inp").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      batchItems[idx].domain = e.target.value.trim().toLowerCase();
    });
  });

  tbody.querySelectorAll(".batch-link-inp").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      batchItems[idx].link = e.target.value.trim();
    });
  });

  tbody.querySelectorAll(".batch-tele-inp").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      batchItems[idx].tele = e.target.value.trim();
    });
  });

  tbody.querySelectorAll(".batch-tpl-select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      batchItems[idx].templateId = sel.value;
    });
  });
}

function openVisualPickerForBatchRow(index) {
  const item = batchItems[index];
  if (!item) return;

  pickerContext = {
    targetType: "batch",
    batchRowIndex: index,
    domain: item.domain,
    link: item.link,
    tele: item.tele,
  };

  const titleEl = document.getElementById("templatePickerModalTitle");
  const subtitleEl = document.getElementById("templatePickerModalSubtitle");
  if (titleEl) titleEl.textContent = `🎨 Chọn Mẫu Cho Tên Miền #${index + 1}: ${item.domain || "Dòng " + (index + 1)}`;
  if (subtitleEl) subtitleEl.textContent = `Bấm vào mẫu bạn ưng ý để gán cho riêng dòng này trong danh sách hàng loạt`;

  renderPickerTemplates();
  openModal("templatePickerModal");
}

function deleteBatchRow(index) {
  batchItems.splice(index, 1);
  renderBatchTable();
}

async function startBatchExecution() {
  const selectedList = batchItems.filter((i) => i.selected && i.domain);
  if (selectedList.length === 0) {
    showToast("⚠️ Vui lòng chọn ít nhất 1 tên miền có dữ liệu hợp lệ!");
    return;
  }

  const modeRadio = document.querySelector('input[name="batchDeployMode"]:checked');
  const isBuy = modeRadio ? modeRadio.value === "buy" : true;

  if (isBuy) {
    if (!isAdminUser()) {
      showToast("⚠️ Chế độ mua hàng loạt chỉ dành cho Admin.", "warning");
      return;
    }
    let batchQuoteMap = null;
    try {
      batchQuoteMap = await requireSpaceshipBatchBuyConfirmation(selectedList.map((i) => i.domain.trim().toLowerCase()));
    } catch (err) {
      showToast(`❌ ${err.message}`, "error");
      alert(`❌ Báo giá Spaceship thất bại:\n\n${err.message}`);
      return;
    }
    if (!batchQuoteMap) return;
    selectedList.forEach((item) => {
      const q = batchQuoteMap[item.domain.trim().toLowerCase()];
      if (q) {
        item.spaceshipBuyConfirmed = true;
        item.quotedTotalUsd = q.totalUsd;
      }
    });
  } else {
    if (!confirm(`❓ Bạn có chắc chắn muốn TRỎ và CÀI ĐẶT ${selectedList.length} tên miền này không?`)) {
      return;
    }
  }

  isBatchRunning = true;
  isBatchStopped = false;
  showProcessingToast(`hàng loạt ${selectedList.length} miền`);

  const btnStart = document.getElementById("btnStartBatchExecution");
  const btnStop = document.getElementById("btnStopBatchExecution");
  const progressWrapper = document.getElementById("batchProgressBarWrapper");
  const progressBar = document.getElementById("batchProgressBar");
  const progressLabel = document.getElementById("batchProgressLabel");
  const progressPercent = document.getElementById("batchProgressPercent");
  const logBox = document.getElementById("batchLogBox");
  const logContent = document.getElementById("batchLogContent");

  if (btnStart) btnStart.style.display = "none";
  if (btnStop) btnStop.style.display = "inline-block";
  if (progressWrapper) progressWrapper.style.display = "block";
  if (logBox) logBox.style.display = "block";
  if (logContent) logContent.innerHTML = "";

  const addLog = (msg, type = "step") => {
    if (!logContent) return;
    const time = new Date().toLocaleTimeString();
    const div = document.createElement("div");
    div.className = `batch-log-line ${type}`;
    div.textContent = `[${time}] ${msg}`;
    logContent.appendChild(div);
    logBox.scrollTop = logBox.scrollHeight;
  };

  const concurrencySetting = parseInt(document.getElementById("batchConcurrencySelect")?.value || "15", 10);
  const concurrency = isNaN(concurrencySetting) || concurrencySetting <= 0 ? 15 : concurrencySetting;

  addLog(`🚀 BẮT ĐẦU CHẠY HÀNG LOẠT: ${selectedList.length} tên miền (Chế độ: ${isBuy ? "Mua Spaceship & Cài Đặt" : "Trỏ Miền Có Sẵn"} | Tốc độ: Song song tối đa ${concurrency} cùng lúc)`, "step");

  let completedCount = 0;
  let successCount = 0;
  let failCount = 0;

  // Render initial running state
  if (progressBar) progressBar.style.width = `0%`;
  if (progressPercent) progressPercent.textContent = `0%`;
  if (progressLabel) progressLabel.textContent = `Đang khởi chạy song song ${Math.min(concurrency, selectedList.length)} tên miền...`;

  let currentIndex = 0;

  async function worker() {
    while (currentIndex < selectedList.length) {
      if (isBatchStopped) {
        break;
      }

      const itemIdx = currentIndex++;
      const item = selectedList[itemIdx];
      if (!item || !item.domain) continue;

      const domain = item.domain.trim().toLowerCase();
      const link = item.link || "https://";
      const tele = item.tele || "";
      const templateId = item.templateId || "gg88_lp_5uae";

      item.status = "running";
      item.statusText = isBuy ? "Đang mua Spaceship..." : "Đang cài đặt DNS...";
      renderBatchTable();

      addLog(`👉 [${itemIdx + 1}/${selectedList.length}] Bắt đầu: ${domain} ➔ ${link} (${templateId})`, "step");

      try {
        let res;
        let resData = {};
        if (templateId === "302_DIRECT") {
          item.statusText = "Cài Page Rule 302...";
          renderBatchTable();
          res = await fetch("/api/deploy-302", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              domain,
              link,
              isBuy,
              spaceshipBuyConfirmed: item.spaceshipBuyConfirmed || false,
              quotedTotalUsd: item.quotedTotalUsd,
            }),
          });
        } else {
          item.statusText = isBuy ? "Mua & Cài Landing Page..." : "Cài Landing Page...";
          renderBatchTable();
          res = await fetch("/api/deploy-lp", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              domain,
              link,
              tele,
              templateId,
              isBuy,
              spaceshipBuyConfirmed: item.spaceshipBuyConfirmed || false,
              quotedTotalUsd: item.quotedTotalUsd,
            }),
          });
        }
        resData = await res.json().catch(() => ({}));

        if (res.status === 202 || resData.queued || resData.success) {
          item.status = resData.queued || res.status === 202 ? "processing" : "success";
          item.statusText = resData.queued || res.status === 202 ? "Đang xử lý ngầm..." : "Thành công!";
          if (item.status === "success") successCount++;
          monitoredDomainsFor200.add(domain.toLowerCase());
          addLog(
            `⏳ [${domain}] ${resData.queued || res.status === 202 ? "ĐÃ NHẬN — xử lý ngầm" : "CÀI ĐẶT THÀNH CÔNG"} — tab Tiến trình`,
            "success"
          );
        } else if ([502, 503, 504, 524].includes(res.status)) {
          item.status = "processing";
          item.statusText = "Timeout — xem Tiến trình";
          monitoredDomainsFor200.add(domain.toLowerCase());
          addLog(`⏳ [${domain}] Gateway timeout — kiểm tra tab Tiến trình`, "warning");
        } else {
          item.status = "error";
          item.statusText = "Lỗi";
          item.error = resData.error || `HTTP ${res.status}`;
          failCount++;
          addLog(`❌ [${domain}] THẤT BẠI: ${item.error}`, "error");
        }
      } catch (err) {
        item.status = "processing";
        item.statusText = "Lỗi kết nối — xem Tiến trình";
        item.error = err.message;
        addLog(`⏳ [${domain}] Lỗi kết nối — job có thể vẫn chạy: ${err.message}`, "warning");
      }

      completedCount++;
      const percent = Math.round((completedCount / selectedList.length) * 100);
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (progressPercent) progressPercent.textContent = `${percent}%`;
      if (progressLabel) {
        progressLabel.textContent = `Đang chạy song song: ${completedCount}/${selectedList.length} hoàn tất (${successCount} thành công, ${failCount} lỗi)...`;
      }
      renderBatchTable();
    }
  }

  const workerCount = Math.min(concurrency, selectedList.length);
  const workerPromises = [];
  for (let w = 0; w < workerCount; w++) {
    workerPromises.push(worker());
  }

  await Promise.all(workerPromises);

  if (isBatchStopped) {
    addLog("⏹️ TIẾN TRÌNH ĐÃ ĐƯỢC NGƯỜI DÙNG DỪNG LẠI.", "error");
  }

  if (progressBar) progressBar.style.width = "100%";
  if (progressPercent) progressPercent.textContent = "100%";
  if (progressLabel) {
    progressLabel.textContent = `Hoàn tất: ${successCount} thành công, ${failCount} thất bại / Tổng ${completedCount} miền.`;
  }

  const btnRetry = document.getElementById("btnRetryBatchErrors");
  if (btnStart) btnStart.style.display = "inline-block";
  if (btnStop) btnStop.style.display = "none";
  if (btnRetry) {
    btnRetry.style.display = failCount > 0 ? "inline-block" : "none";
  }
  isBatchRunning = false;

  addLog(`🏁 HOÀN TẤT TIẾN TRÌNH! Thành công: ${successCount} | Thất bại: ${failCount}`, successCount > 0 ? "success" : "error");

  fetchDomains();
  fetchHistory();
  showToast(`🎉 Chạy hàng loạt hoàn tất! ${successCount} thành công, ${failCount} lỗi.`, "success");
}

function retryFailedBatchItems() {
  let hasFailed = false;
  batchItems.forEach((item) => {
    if (item.status === "error") {
      item.selected = true;
      item.status = "ready";
      item.statusText = "Sẵn sàng";
      item.error = null;
      hasFailed = true;
    } else {
      item.selected = false;
    }
  });

  if (!hasFailed) {
    showToast("ℹ️ Không có tên miền nào bị lỗi để thử lại!");
    return;
  }

  const btnRetry = document.getElementById("btnRetryBatchErrors");
  if (btnRetry) btnRetry.style.display = "none";

  renderBatchTable();
  startBatchExecution();
}

function retrySingleBatchRow(index) {
  if (isBatchRunning) {
    showToast("⚠️ Tiến trình đang chạy, vui lòng đợi hoàn tất hoặc bấm Dừng!");
    return;
  }

  batchItems.forEach((item, idx) => {
    if (idx === index) {
      item.selected = true;
      item.status = "ready";
      item.statusText = "Sẵn sàng";
      item.error = null;
    } else {
      item.selected = false;
    }
  });

  renderBatchTable();
  startBatchExecution();
}

// ── 9. HISTORY MANAGEMENT & LIVE 200 VERIFIER (TAB 6) ──────────────────────
function historyPageFingerprint(list, page, total, q) {
  const ids = (list || [])
    .map((h) => `${h.id}|${h.status}|${h.liveStatus || ""}|${h.progress || ""}|${h.updatedAt || h.timestamp || ""}`)
    .join(";");
  return `${page}|${total}|${q || ""}|${ids}`;
}

async function fetchHistory(page = historyPage, opts = {}) {
  const silent = !!opts.silent;
  historyPage = Math.max(1, page);
  const seq = ++historyFetchSeq;

  if (!silent && allHistory.length === 0) {
    if (historyLoading) historyLoading.style.display = "flex";
    if (historyTable) historyTable.style.display = "none";
    if (historyEmpty) historyEmpty.style.display = "none";
  }

  try {
    const q = encodeURIComponent(currentHistorySearch || "");
    const res = await fetch(`/api/history?page=${historyPage}&limit=${historyLimit}&q=${q}`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (seq !== historyFetchSeq) return; // bỏ response cũ nếu đã đổi trang/search

    if (data.success && Array.isArray(data.history)) {
      allHistory = data.history;
      historyTotal = data.total ?? allHistory.length;
      historyTotalPages = data.totalPages ?? 1;
      updateHistoryStats(data.stats);

      const fp = historyPageFingerprint(allHistory, historyPage, historyTotal, currentHistorySearch);
      if (fp !== historyRenderFingerprint) {
        historyRenderFingerprint = fp;
        renderHistoryTable();
        renderPaginationBar(document.getElementById("historyPagination"), {
          page: historyPage,
          totalPages: historyTotalPages,
          total: historyTotal,
          limit: historyLimit,
          onPage: (p) => fetchHistory(p),
          label: "giao dịch",
        });
      } else if (!silent) {
        // vẫn hiện bảng nếu lần đầu silent=false mà fingerprint trùng
        if (historyEmpty && allHistory.length === 0) historyEmpty.style.display = "flex";
        if (historyTable && allHistory.length > 0) historyTable.style.display = "table";
      }

      if (!silent) checkAndTrigger200Popups(allHistory);
    }
  } catch (err) {
    console.error("Lỗi fetch history:", err);
  } finally {
    if (!silent && historyLoading) historyLoading.style.display = "none";
  }
}

async function fetchHistorySilent() {
  try {
    const res = await fetch("/api/history/watch", { headers: authHeaders() });
    const data = await res.json();
    if (data.success && Array.isArray(data.history)) {
      checkAndTrigger200Popups(data.history);
    }
    const histTabActive = document
      .querySelector('.nav-tab[data-tab="tab-history"]')
      ?.classList.contains("active");
    // Tab lịch sử đang mở: refresh trang hiện tại im lặng — không flash loading
    if (histTabActive) {
      await fetchHistory(historyPage, { silent: true });
    }
  } catch {}
}

function startHistoryPolling() {
  if (historyPollingInterval) clearInterval(historyPollingInterval);
  // 5s đủ cho popup 200; tránh giật UI mỗi 2.5s
  historyPollingInterval = setInterval(() => {
    fetchHistorySilent();
  }, 5000);
}

function checkAndTrigger200Popups(historyList) {
  if (!Array.isArray(historyList)) return;

  for (const h of historyList) {
    if (!h.domain) continue;
    const domLower = h.domain.toLowerCase();

    const createdAt = h.timestamp ? new Date(h.timestamp).getTime() : 0;
    const ageMinutes = (Date.now() - createdAt) / 60000;

    // 1. Popup khi 200 OK
    if (h.liveStatus === "200_OK" && !notified200Domains.has(domLower)) {
      const isRecent = ageMinutes < 15;
      const isMonitored = monitoredDomainsFor200.has(domLower);

      if (isMonitored || isRecent) {
        monitoredDomainsFor200.delete(domLower);
        showDomainReady200Modal(h);
        break;
      }
    }

    // 2. Cảnh báo 15p — chỉ auto với miền đang theo dõi trong phiên
    if (error15mAutoPopupDone || activeErrorAlertDomain) continue;

    const isMonitoredOverdue =
      monitoredDomainsFor200.has(domLower) &&
      ageMinutes >= 15 &&
      h.liveStatus !== "200_OK" &&
      h.status !== "failed";

    if (isMonitoredOverdue && !dismissedError15mDomains.has(domLower)) {
      showDomainErrorAlertModal(h, { auto: true });
      monitoredDomainsFor200.delete(domLower);
      break;
    }
  }
}

function updateHistoryStats(statsFromApi) {
  const completed = statsFromApi || {
    total: allHistory.filter((h) => h.status !== "in_progress" && h.status !== "pending").length,
    live: allHistory.filter((h) => h.liveStatus === "200_OK").length,
    buy: allHistory.filter((h) => h.actionType && h.actionType.startsWith("BUY")).length,
    lp: allHistory.filter((h) => h.actionType && (h.actionType.includes("LP") || h.actionType.includes("TPL"))).length,
  };
  const total = completed.total ?? 0;
  const liveCount = completed.live ?? 0;
  const buyCount = completed.buy ?? 0;
  const lpCount = completed.lp ?? 0;

  if (badgeHistoryCount) badgeHistoryCount.textContent = total;
  if (statTotalHistory) statTotalHistory.textContent = total;
  if (statLiveHistory) statLiveHistory.textContent = liveCount;
  if (statBuyHistory) statBuyHistory.textContent = buyCount;
  if (statLpHistory) statLpHistory.textContent = lpCount;
}

function formatHistoryDate(isoString) {
  if (!isoString) return "N/A";
  try {
    const d = new Date(isoString);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    const secs = String(d.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
  } catch {
    return isoString;
  }
}

function formatHistoryActor(h) {
  const name = h.username || h.fullName || "";
  const id = h.userId || "";
  if (name && id) {
    return `<div style="display:flex;flex-direction:column;gap:2px;line-height:1.25;">
      <span style="font-weight:700;color:#fff;font-size:12px;">${name}</span>
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);" title="User ID">${id}</span>
    </div>`;
  }
  if (name) return `<span style="font-weight:600;color:#fff;font-size:12px;">${name}</span>`;
  if (id) return `<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${id}</span>`;
  return `<span style="color:var(--text-dim);font-size:11px;">Hệ thống</span>`;
}

function renderHistoryTable() {
  if (!historyTableBody) return;

  const filtered = allHistory;
  const rowOffset = (historyPage - 1) * historyLimit;

  if (filtered.length === 0) {
    if (historyTable) historyTable.style.display = "none";
    if (historyEmpty) historyEmpty.style.display = "flex";
    return;
  }

  if (historyEmpty) historyEmpty.style.display = "none";
  if (historyTable) historyTable.style.display = "table";

  historyTableBody.innerHTML = filtered
    .map((h, index) => {
      let actionBadgeColor = "var(--primary)";
      if (h.status === "failed") actionBadgeColor = "var(--accent-rose)";
      else if (h.actionType === "BUY_LP" || h.actionType === "BUY_302") actionBadgeColor = "var(--accent-emerald)";
      else if (h.actionType === "SWITCH_TPL") actionBadgeColor = "var(--accent-purple)";
      else if (h.actionType === "SET_LINK") actionBadgeColor = "var(--accent-cyan)";

      const formattedDate = formatHistoryDate(h.timestamp);
      const shortUrl = h.link || "N/A";
      const prevLinkHtml = h.previousLink
        ? `<div style="font-size:10px;color:var(--text-dim);margin-top:3px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Link cũ: ${h.previousLink}">← ${h.previousLink}</div>`
        : "";
      const histIdHtml = h.id
        ? `<div style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono);margin-top:2px;" title="History ID">${h.id}</div>`
        : "";

      // Cột Live Status & Screenshot Preview
      const createdAt = h.timestamp ? new Date(h.timestamp).getTime() : Date.now();
      const ageMinutes = Math.round(((Date.now() - createdAt) / 60000) * 10) / 10;

      let liveSectionHtml = "";
      if (h.status === "in_progress" || h.status === "pending") {
        const step = h.progress || h.details?.step || "Đang chạy trên server...";
        liveSectionHtml = `
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="spinner" style="width: 13px; height: 13px; border-width: 2px; border-top-color: #fbbf24;"></span>
              <span style="color: #fbbf24; font-weight: 800; font-size: 12px;">Đang Xử Lý</span>
            </div>
            <span style="font-size: 11px; color: #fde68a; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${String(step).replace(/"/g, "&quot;")}">
              ${step}
            </span>
          </div>
        `;
      } else if (h.status === "failed") {
        liveSectionHtml = `
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-size: 13px;">🔴</span>
              <span style="color: var(--accent-rose); font-weight: 700; font-size: 12px;">Thất Bại</span>
              <button class="btn btn-primary btn-sm" style="padding: 2px 8px; font-size: 10px; font-weight: 700; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-color: #f59e0b;" onclick="retryFailedDeploy('${h.taskId || h.id}')" title="Nạp Spaceship (nếu hết tiền) rồi thử lại">
                🔄 Thử Lại
              </button>
            </div>
            <span style="font-size: 11px; color: var(--accent-rose); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${String(h.error || "").replace(/"/g, "&quot;")}">
              ${h.error || "Lỗi cấu hình"}
            </span>
          </div>
        `;
      } else if (h.liveStatus === "200_OK") {
        liveSectionHtml = `
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 13px;">🟢</span>
              <span style="color: var(--accent-emerald); font-weight: 700; font-size: 12px;">Thành Công (200 OK)</span>
            </div>
            <span style="font-size: 10px; color: var(--text-dim); font-family: var(--font-mono);">
              ${h.verifiedAt ? "Xác minh: " + formatHistoryDate(h.verifiedAt) : "Đã kích hoạt & sẵn sàng"}
            </span>
          </div>
        `;
      } else if (h.liveStatus === "ERROR_15M_ALERT" || ageMinutes >= 15) {
        // Quá 15 phút chưa 200 OK -> Hiện cảnh báo liên hệ admin @frezeit
        const escapedErr = (h.lastCheckError || "Quá 15 phút chưa phản hồi HTTP 200").replace(/'/g, "\\'");
        liveSectionHtml = `
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 13px;">⚠️</span>
              <span style="color: var(--accent-rose); font-size: 11px; font-weight: 700;">Chưa 200 OK (>15p)</span>
              <button class="btn btn-secondary btn-sm" style="padding: 1px 6px; font-size: 10px; border-color: rgba(244, 63, 94, 0.5); color: var(--accent-rose);" onclick="openErrorAlertModalForDomain('${h.domain}', '${h.link || ''}', '${escapedErr}')" title="Xem chi tiết cảnh báo">
                Chi tiết
              </button>
            </div>
            <span style="font-size: 10px; color: #fda4af; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Vui lòng truy cập tên miền để kiểm tra, nếu phát hiện lỗi vui lòng liên hệ admin @frezeit">
              Truy cập kiểm tra / Liên hệ @frezeit
            </span>
          </div>
        `;
      } else {
        // Đã xong job nhưng chờ HTTP 200 — hiện lỗi thật nếu có (403/1014/522...)
        const errRaw = String(h.lastCheckError || "").trim();
        const isBanned1014 = /1014|cross-user|banned/i.test(errRaw) || /HTTP 403/i.test(errRaw);
        const errLabel = isBanned1014
          ? "Lỗi Cloudflare 1014 (CNAME/Pages lệch)"
          : errRaw
          ? errRaw
          : `Đang cấp SSL/DNS (chờ tối đa ${Math.max(1, Math.round(15 - ageMinutes))}p)`;
        liveSectionHtml = `
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="spinner" style="width: 13px; height: 13px; border-width: 2px; border-top-color: ${isBanned1014 ? "var(--accent-rose)" : "var(--accent-cyan)"};"></span>
              <span style="color: ${isBanned1014 ? "var(--accent-rose)" : "var(--accent-cyan)"}; font-size: 11px; font-weight: 700;">${isBanned1014 ? "Chưa Live (1014)" : "Đang Xử Lý..."}</span>
              <button class="btn btn-secondary btn-sm" style="padding: 1px 6px; font-size: 10px; border-color: rgba(6, 182, 212, 0.4);" onclick="verifyDomainNow('${h.id}', '${h.domain}')" title="Kiểm tra trạng thái ngay">
                🔄 Check
              </button>
            </div>
            <span style="font-size: 10px; color: ${isBanned1014 ? "#fda4af" : "var(--text-dim)"}; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${String(errLabel).replace(/"/g, "&quot;")}">
              ${errLabel}
            </span>
          </div>
        `;
      }

      const hasLogs = Array.isArray(h.repairLogs) && h.repairLogs.length > 0;
      const rowBusy = h.status === "in_progress" || h.status === "pending";

      return `
        <tr style="${rowBusy ? "background: rgba(245, 158, 11, 0.08);" : ""}">
          <td style="color: var(--text-dim); font-family: var(--font-mono);">${rowOffset + index + 1}</td>
          <td style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); white-space: nowrap;">
            ${formattedDate}
            ${histIdHtml}
          </td>
          <td>${formatHistoryActor(h)}</td>
          <td>
            <a href="https://${h.domain}" target="_blank" rel="noopener noreferrer" class="dom-name-link" style="font-weight: 600;">
              ${h.domain}
            </a>
          </td>
          <td>
            <span class="dom-repo-tag" style="background: rgba(99, 102, 241, 0.15); border-color: ${actionBadgeColor}; color: #fff;">
              ${h.actionLabel || h.actionType}
            </span>
          </td>
          <td>
            <span style="font-size: 13px; font-weight: 500;">${h.templateName || "Trỏ 302"}</span>
            ${h.previousTemplateName ? `<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">← ${h.previousTemplateName}</div>` : ""}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="dom-target-url" title="${shortUrl}">${shortUrl}</span>
              ${h.link && h.link !== "N/A" ? `<button class="btn-copy" onclick="copyText('${h.link}')" title="Sao chép link">📋</button>` : ""}
            </div>
            ${prevLinkHtml}
            ${h.tele ? `<div style="font-size:10px;color:var(--accent-cyan);margin-top:2px;">Tele: ${h.tele}</div>` : ""}
          </td>
          <td>
            ${liveSectionHtml}
          </td>
          <td>
            <div class="action-btn-group" style="justify-content: flex-end; gap: 6px;">
              ${hasLogs ? `
                <button class="btn btn-sm btn-secondary" onclick="openRepairLogsModal('${h.domain}')" title="Xem chi tiết các bước Watchdog đã tự sửa">
                  📜 Nhật Ký
                </button>
              ` : ""}
              <button class="btn btn-sm btn-secondary" onclick="autoRepairDomainNow('${h.id || h.domain}', '${h.domain}', true)" title="Ép chạy lại toàn bộ quy trình từ đầu đến đích ngay lập tức" style="border-color: rgba(244,63,94,0.4); color: var(--accent-rose);">
                🔥 Tái Sinh
              </button>
              <button class="btn btn-sm btn-secondary" onclick="quickInspectFromHistory('${h.domain}')" title="Kiểm tra chi tiết">
                🔍 Tra Cứu
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

let currentRepairDomain = null;

function openRepairLogsModal(domain) {
  const item = allHistory.find((h) => h.domain === domain);
  currentRepairDomain = domain;

  const titleEl = document.getElementById("repairLogsDomainTitle");
  const subEl = document.getElementById("repairLogsSubtitle");
  const contentEl = document.getElementById("repairLogsContent");
  const forceBtn = document.getElementById("btnTriggerForceRebuildFromModal");

  if (titleEl) titleEl.textContent = `Nhật Ký Tự Động Cứu Hộ: ${domain}`;
  if (subEl) subEl.textContent = `Lần can thiệp gần nhất: ${item?.lastRepairedAt ? formatHistoryDate(item.lastRepairedAt) : "Tự động Watchdog"}`;

  if (contentEl) {
    if (item && Array.isArray(item.repairLogs) && item.repairLogs.length > 0) {
      contentEl.innerHTML = item.repairLogs
        .map((log) => {
          let color = "#fff";
          if (log.includes("✅")) color = "var(--accent-emerald)";
          else if (log.includes("❌")) color = "var(--accent-rose)";
          else if (log.includes("🔧") || log.includes("🚨")) color = "var(--accent-amber)";
          return `<div style="color: ${color}; margin-bottom: 6px;">${log}</div>`;
        })
        .join("");
    } else {
      contentEl.innerHTML = `<div style="color: var(--text-dim); text-align: center; padding: 20px;">Chưa có nhật ký sửa lỗi nào được ghi nhận.</div>`;
    }
  }

  if (forceBtn) {
    forceBtn.onclick = () => {
      closeModal("repairLogsModal");
      autoRepairDomainNow(item?.id || domain, domain, true);
    };
  }

  openModal("repairLogsModal");
}

async function autoRepairDomainNow(id, domain, isFullRebuild = false) {
  showProcessingToast(domain);
  try {
    const res = await fetch("/api/auto-repair", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ id, domain, isFullRebuild }),
    });
    const data = await res.json();
    if (data.success && data.repaired) {
      showToast(`🎉 [${domain}] ĐÃ TỰ ĐỘNG LÀM XONG! Đang kiểm tra trạng thái 200 OK...`, "success");
      fetchHistory();
      // Kích hoạt kiểm tra trạng thái ngay sau khi sửa
      setTimeout(() => verifyDomainNow(id, domain), 3000);
    } else {
      showToast(`⚠️ Sửa lỗi: ${data.error || "Không thể tự động sửa lỗi"}`, "error");
      fetchHistory();
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối: " + err.message);
  }
}



async function verifyDomainNow(id, domain) {
  showToast(`🔍 Đang kiểm tra trạng thái 200 OK cho [${domain}]...`);
  try {
    const res = await fetch("/api/history/verify", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ id, domain, force: true }),
    });
    const data = await res.json();
    if (data.success && data.data?.verified) {
      showToast(`🎉 [${domain}] Đã phản hồi 200 OK thành công!`);
      fetchHistory();
    } else {
      showToast(`⏳ [${domain}] Chưa đạt 200 OK (${data.data?.error || "Đang chờ DNS/SSL"}).`);
      fetchHistory();
    }
  } catch (err) {
    showToast("❌ Lỗi kiểm tra: " + err.message);
  }
}

async function verifyAllPendingDomains() {
  showToast("⚡ Đang quét kiểm tra toàn bộ các tên miền đang chờ 200 OK...");
  try {
    const res = await fetch("/api/history/verify-all", {
      method: "POST",
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✨ Đã quét ${data.checked} miền, xác thực ${data.verified} miền 200 OK thành công!`);
      fetchHistory();
    }
  } catch (err) {
    showToast("❌ Lỗi kết nối: " + err.message);
  }
}

function quickInspectFromHistory(domain) {
  document.querySelector('.nav-tab[data-tab="tab-check"]').click();
  if (inspectorDomainInput) {
    inspectorDomainInput.value = domain;
    inspectDomain();
  }
}

// Event Listeners cho History Tab
if (historySearchInput && !historySearchInput.dataset.paginationBound) {
  historySearchInput.dataset.paginationBound = "1";
}

if (refreshHistoryBtn && !refreshHistoryBtn.dataset.paginationBound) {
  refreshHistoryBtn.dataset.paginationBound = "1";
  refreshHistoryBtn.addEventListener("click", () => {
    fetchHistory(historyPage);
    showToast("🔄 Đã cập nhật lại lịch sử!");
  });
}

if (verifyAllHistoryBtn) {
  verifyAllHistoryBtn.addEventListener("click", verifyAllPendingDomains);
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", async () => {
    if (!confirm("❓ Bạn có chắc chắn muốn xoá toàn bộ lịch sử không?")) return;
    try {
      const res = await fetch("/api/history/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        allHistory = [];
        updateHistoryStats();
        renderHistoryTable();
        showToast("🗑️ Đã xoá toàn bộ lịch sử thành công!");
      }
    } catch (err) {
      showToast("❌ Không thể xoá lịch sử: " + err.message);
    }
  });
}

// Copy text utility
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`📋 Đã sao chép: ${text}`);
  });
}

// Toast helper — type: processing | success | error | info | auto
let toastTimeout = null;

function inferToastType(msg) {
  const s = String(msg || "");
  if (/^(❌|⚠️\s*Lỗi|⚠️\s*CẢNH|⚠️\s*Token không)/.test(s) || s.includes("thất bại") || s.includes("Thất bại") || s.includes("Lỗi kết nối") || s.includes("Lỗi:")) {
    if (s.startsWith("⚠️ Vui lòng") || s.startsWith("⚠️ Không") || s.startsWith("⚠️ Tiến trình") || s.startsWith("ℹ️")) return "info";
    if (s.startsWith("❌") || s.includes("Lỗi") || s.includes("thất bại") || s.includes("Thất bại")) return "error";
  }
  if (/^(✅|🎉|✨|🗑️)/.test(s) || s.includes("thành công") || s.includes("Thành công") || s.includes("hoàn tất") || s.includes("Hoàn tất")) {
    return "success";
  }
  if (/^(🚀|⏳|🔄|⚡ Đang|🩺 Đang|🔧 Đang|📥 Đang)/.test(s) || s.includes("Đang xử lý") || s.includes("đang được xử lý") || s.includes("tiếp nhận")) {
    return "processing";
  }
  return "info";
}

function showToast(msg, type = "auto") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  const toastIcon = document.getElementById("toastIcon");
  if (!toast || !toastMessage) return;

  const resolved = type === "auto" ? inferToastType(msg) : type;
  toast.classList.remove("toast-processing", "toast-success", "toast-error", "toast-info");
  toast.classList.add(`toast-${resolved}`);

  const icons = {
    processing: "⏳",
    success: "✅",
    error: "❌",
    info: "✨",
  };
  if (toastIcon) toastIcon.textContent = icons[resolved] || "✨";

  toastMessage.textContent = msg;
  toast.classList.add("show");

  if (toastTimeout) clearTimeout(toastTimeout);
  const holdMs = resolved === "processing" ? 5500 : resolved === "error" ? 5000 : 4000;
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, holdMs);
}

/** Toast vàng chuẩn khi bấm nút chạy tác vụ nền */
function showProcessingToast(detail) {
  const extra = detail ? ` (${detail})` : "";
  showToast(
    `⏳ Đang xử lý${extra} — chưa xong. Xem kết quả ở Tiến trình / Lịch sử (thành công hoặc thất bại).`,
    "processing"
  );
}

window.showProcessingToast = showProcessingToast;

// ── 8. USER AUTHENTICATION & WALLET CONTROLLER ─────────────────────────────
let authToken = localStorage.getItem("freze_auth_token") || "";
let isAuthRegisterMode = false;

async function checkAuth() {
  authToken = localStorage.getItem("freze_auth_token") || "";
  authReady = false;
  currentUser = null;
  document.body.classList.remove("auth-ready", "user-is-admin", "user-is-member");

  if (!authToken) {
    window.location.href = "/login";
    return false;
  }

  try {
    const res = await fetch("/api/auth/me", { headers: authHeaders() });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = { ...data.user, balance: data.balance || 0 };
      authReady = true;
      document.body.classList.remove("auth-pending");
      document.body.classList.add("auth-ready");
      document.body.classList.add(currentUser.role === "admin" ? "user-is-admin" : "user-is-member");
      updateUserUI();
      return true;
    }
    localStorage.removeItem("freze_auth_token");
    window.location.href = "/login";
    return false;
  } catch {
    localStorage.removeItem("freze_auth_token");
    window.location.href = "/login";
    return false;
  }
}

function handleLogout() {
  if (confirm("❓ Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?")) {
    localStorage.removeItem("freze_auth_token");
    window.location.href = "/login";
  }
}

function switchToTab(tabId) {
  const tabBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (tabBtn) tabBtn.click();
}

function updateUserUI() {
  if (!authReady || !currentUser) return;

  const userNameText = document.getElementById("userNameText");
  const userRoleTag = document.getElementById("userRoleTag");
  const userBalanceText = document.getElementById("userBalanceText");
  const walletCardBalance = document.getElementById("walletCardBalance");
  const walletCardVnd = document.getElementById("walletCardVnd");
  const walletCardRole = document.getElementById("walletCardRole");
  const adminSection = document.getElementById("adminUserManagementSection");
  const clonerCurrentBalanceText = document.getElementById("clonerCurrentBalanceText");

  const isAdmin = currentUser.role === "admin";

  if (userNameText) userNameText.textContent = currentUser.username || "—";
  if (userRoleTag) {
    userRoleTag.textContent = (currentUser.role || "user").toUpperCase();
    userRoleTag.className = `user-role-tag ${currentUser.role === "admin" ? "admin" : "user"}`;
  }
  const balNum = typeof currentUser.balance === "number" ? currentUser.balance : 0;
  const balFormatted = balNum.toLocaleString("vi-VN");
  const balVnd = (balNum * 1000).toLocaleString("vi-VN");

  if (userBalanceText) userBalanceText.textContent = `${balFormatted} Xu`;
  if (walletCardBalance) walletCardBalance.textContent = `${balFormatted} Xu`;
  if (walletCardVnd) walletCardVnd.textContent = `≈ ${balVnd} VNĐ (1 Xu = 1.000 đ)`;
  if (walletCardRole) walletCardRole.textContent = (currentUser.role || "user").toUpperCase();
  if (clonerCurrentBalanceText) clonerCurrentBalanceText.textContent = `${balFormatted} Xu`;

  if (adminSection) {
    adminSection.style.display = isAdmin ? "block" : "none";
  }

  // Strict RBAC: Update labels & hide admin-only tabs for regular users
  const navTabBuyLabel = document.getElementById("navTabBuyLabel");
  const navTabDomainsLabel = document.getElementById("navTabDomainsLabel");
  const navTabTasksLabel = document.getElementById("navTabTasksLabel");
  const navTabWalletLabel = document.getElementById("navTabWalletLabel");

  if (navTabBuyLabel) navTabBuyLabel.textContent = isAdmin ? "Mua Tên Miền" : "Tra Cứu & Mua Miền";
  if (navTabDomainsLabel) navTabDomainsLabel.textContent = isAdmin ? "Quản Lý Domain" : "Tên Miền Của Tôi";
  if (navTabTasksLabel) navTabTasksLabel.textContent = isAdmin ? "Tiến Trình" : "Tiến Trình";
  if (navTabWalletLabel) navTabWalletLabel.textContent = isAdmin ? "Ví & Thành Viên" : "Ví & Nạp VietQR";

  // Hide or Show admin tabs
  document.querySelectorAll('.nav-tab[data-role="admin"]').forEach((tab) => {
    tab.style.display = isAdmin ? "inline-flex" : "none";
  });

  // If user is currently on an admin-only tab, automatically switch to tab-buy
  const activeTab = document.querySelector('.nav-tab.active');
  if (!isAdmin && activeTab && activeTab.dataset.role === "admin") {
    switchToTab("tab-buy");
  }

  // Re-render templates gallery to reflect permissions (Admin vs User)
  if (allTemplates && allTemplates.length > 0) {
    renderTemplates();
  }

  const userOrderHint = document.getElementById("userOrderFlowHint");
  if (userOrderHint) userOrderHint.style.display = "none";

  const buySectionDesc = document.getElementById("tabBuySectionDesc");
  if (buySectionDesc) {
    buySectionDesc.textContent = isAdmin
      ? "Mua tên miền và tự động kết nối Cloudflare DNS, SSL, Landing Page hoặc 302."
      : "Chọn gắn Landing Page hoặc trỏ 302, điền link/mẫu rồi gửi đơn — Admin duyệt mới trừ Xu & kích hoạt.";
  }

  const buyTab = document.getElementById("tab-buy");
  if (buyTab) {
    // User cũng được chọn LP / 302 khi mua (vẫn gửi đơn chờ Admin duyệt)
    buyTab.querySelectorAll('.sub-pill[data-sub="buy-lp"], .sub-pill[data-sub="buy-302"], .sub-pill[data-sub="check-batch"]').forEach((el) => {
      el.style.display = "inline-flex";
    });
    document.querySelectorAll(".admin-buy-target-group").forEach((g) => {
      g.style.display = isAdmin ? "block" : "none";
    });

    const lpLabel = document.getElementById("btnSubmitBuyLpLabel");
    const o302Label = document.getElementById("btnSubmitBuy302Label");
    if (lpLabel) {
      lpLabel.textContent = isAdmin
        ? "Mua & Kích Hoạt Landing Page Ngay"
        : "Gửi Yêu Cầu Mua & Gắn Landing Page";
    }
    if (o302Label) {
      o302Label.textContent = isAdmin
        ? "Mua & Trỏ 302 Ngay"
        : "Gửi Yêu Cầu Mua & Trỏ 302";
    }

    if (isAdmin) {
      loadAdminTargetUserOptions();
    } else {
      // Mặc định mở form Mua & Gắn LP (không ép chỉ tra cứu)
      const lpPill = buyTab.querySelector('.sub-pill[data-sub="buy-lp"]');
      if (lpPill && !lpPill.classList.contains("active")) {
        const activeSub = buyTab.querySelector(".sub-pill.active");
        if (!activeSub || activeSub.dataset.sub === "check-batch") lpPill.click();
      }
    }
  }

  const userOrdersPanel = document.getElementById("userDomainOrdersPanel");
  if (userOrdersPanel) userOrdersPanel.style.display = isAdmin ? "none" : "block";

  loadDomainOrdersList();

  // Load wallet & transactions
  loadWalletData();
}

async function loadAdminTargetUserOptions() {
  if (!currentUser || currentUser.role !== "admin") return;
  try {
    const res = await fetch("/api/admin/users", { headers: authHeaders() });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.users)) return;
    const opts = ['<option value="">— Gán cho chính Admin —</option>'].concat(
      data.users
        .filter((u) => u.role !== "admin" && u.id !== "u_admin")
        .map((u) => `<option value="${u.id}">${u.username}${u.fullName ? ` (${u.fullName})` : ""}</option>`)
    );
    ["buyLpTargetUser", "buy302TargetUser"].forEach((id) => {
      const sel = document.getElementById(id);
      if (sel) sel.innerHTML = opts.join("");
    });
  } catch {}
}

// ── 4B. BATCH DOMAIN AVAILABILITY & PRICING CHECKER ─────────────────────────
let batchCheckResults = [];

async function runBatchDomainCheck() {
  const input = document.getElementById("batchCheckDomainInput");
  const text = input ? input.value.trim() : "";
  if (!text) {
    showToast("⚠️ Vui lòng dán hoặc nhập ít nhất 1 tên miền để kiểm tra!");
    return;
  }

  const btn = document.getElementById("btnRunBatchCheckDomains");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳ Đang kiểm tra giá & tình trạng...</span>`;
  }

  try {
    const res = await fetch("/api/check-domains-batch", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.results)) {
      batchCheckResults = data.results;
      renderBatchCheckResultsTable(data);
      showToast(`✨ Đã kiểm tra xong ${data.count} tên miền (${data.availableCount} tên miền còn trống)!`);
    } else {
      showToast(`❌ Lỗi: ${data.error || "Không thể kiểm tra"}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🔍 Kiểm Tra Tất Cả Tên Miền</span>`;
    }
  }
}

function renderBatchCheckResultsTable(data) {
  const wrapper = document.getElementById("batchCheckResultsWrapper");
  const tbody = document.getElementById("batchCheckResultsTbody");
  const totalCount = document.getElementById("batchCheckTotalCount");
  const availableCount = document.getElementById("batchCheckAvailableCount");

  if (!wrapper || !tbody) return;
  wrapper.style.display = "block";

  if (totalCount) totalCount.textContent = data.count || batchCheckResults.length;
  if (availableCount) availableCount.textContent = data.availableCount || 0;

  tbody.innerHTML = batchCheckResults.map((r, index) => {
    const isAvail = r.isAvailable;
    const isPrem = r.isPremium;
    const reqAppr = r.requiresApproval || (r.priceUsd > 12);
    let statusBadge = `<span class="badge-status badge-danger" style="font-weight: 700;">🔴 ĐÃ CÓ CHỦ</span>`;
    if (isAvail) {
      if (isPrem) {
        statusBadge = `<span class="badge-status" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; font-weight: 800; text-shadow: 0 0 8px rgba(245,158,11,0.5);">💎 CÒN TRỐNG (PREMIUM)</span>`;
      } else if (reqAppr) {
        statusBadge = `<span class="badge-status" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-weight: 700;">🟢 CÒN TRỐNG ⚠️ (Cần Admin Duyệt)</span>`;
      } else {
        statusBadge = `<span class="badge-status badge-success" style="font-weight: 700;">🟢 CÒN TRỐNG</span>`;
      }
    }

    const isAdmin = isAdminUser();
    const actionButtons = isAvail
      ? `
        <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
          <button class="btn btn-primary btn-sm" onclick="quickSelectBuyFromBatch('${r.domain}', 'lp')" title="${isAdmin ? "Mua và gán Landing Page" : "Điền form LP rồi gửi đơn chờ duyệt"}">
            🎨 ${isAdmin ? "Mua & Gán LP" : "Chọn LP"}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="quickSelectBuyFromBatch('${r.domain}', '302')" title="${isAdmin ? "Mua và trỏ 302" : "Điền form 302 rồi gửi đơn chờ duyệt"}">
            ⚡ ${isAdmin ? "Mua 302" : "Chọn 302"}
          </button>
        </div>
      `
      : `<span style="color: var(--text-dim); font-size: 12px;">🔒 Không thể mua</span>`;

    const priceColor = isPrem ? "#fbbf24" : "var(--accent-emerald)";
    return `
      <tr style="${isPrem ? 'background: rgba(245, 158, 11, 0.05);' : ''}">
        <td style="color: var(--text-dim); font-family: var(--font-mono);">${index + 1}</td>
        <td>
          <strong style="font-size: 14px; color: ${isPrem ? '#fbbf24' : '#fff'}; font-family: var(--font-mono);">${r.domain}</strong>
          ${isPrem ? '<div style="font-size: 11px; color: #f59e0b; margin-top: 2px;">⚠️ Tên miền giá cao đặc biệt của Registry</div>' : ''}
        </td>
        <td>${statusBadge}</td>
        <td>
          <span style="font-weight: 800; color: ${priceColor}; font-family: var(--font-mono); font-size: 13px;">
            ${r.priceFormatted}
          </span>
        </td>
        <td style="text-align: right;">${actionButtons}</td>
      </tr>
    `;
  }).join("");
}

function loadSampleBatchCheckDomains() {
  const input = document.getElementById("batchCheckDomainInput");
  if (input) {
    input.value = `gg88vip-${Date.now().toString().slice(-3)}.top\nbetgame88.xyz\nsieucap88.live\nnhacaiquocte.com\nllwinpro.vip`;
    runBatchDomainCheck();
  }
}

function clearBatchDomainCheck() {
  const input = document.getElementById("batchCheckDomainInput");
  const wrapper = document.getElementById("batchCheckResultsWrapper");
  if (input) input.value = "";
  if (wrapper) wrapper.style.display = "none";
}

function quickSelectBuyFromBatch(domain, mode = "lp") {
  // Cả admin & user: điền sẵn form LP/302 để chọn mẫu/link rồi mua (user → đơn chờ duyệt)
  if (mode === "302") {
    document.querySelector('.sub-pill[data-sub="buy-302"]')?.click();
    const domInput = document.getElementById("buy302Domain");
    if (domInput) {
      domInput.value = domain;
      domInput.focus();
    }
    const statusEl = document.getElementById("buy302DomainStatus");
    checkDomainAvailabilityLive(domain, statusEl);
  } else {
    document.querySelector('.sub-pill[data-sub="buy-lp"]')?.click();
    const domInput = document.getElementById("buyLpDomain");
    if (domInput) {
      domInput.value = domain;
      domInput.focus();
    }
    const statusEl = document.getElementById("buyLpDomainStatus");
    checkDomainAvailabilityLive(domain, statusEl);
  }
}

function collectBuyFormExtraFromUi() {
  const form302 = document.getElementById("form-buy-302");
  const on302 = form302 && form302.style.display !== "none";
  if (on302) {
    return {
      link: document.getElementById("buy302Link")?.value?.trim() || "",
      deployMode: "302",
    };
  }
  return {
    link: document.getElementById("buyLpLink")?.value?.trim() || "",
    tele: document.getElementById("buyLpTele")?.value?.trim() || "",
    templateId: document.getElementById("buyLpTemplate")?.value || "",
    deployMode: "LP",
  };
}

function openLoginModal() {
  isAuthRegisterMode = false;
  const title = document.getElementById("authModalTitle");
  const btnSubmit = document.getElementById("btnAuthSubmit");
  const btnToggle = document.getElementById("btnToggleAuthMode");
  if (title) title.textContent = "Tài Khoản & Đăng Nhập";
  if (btnSubmit) btnSubmit.textContent = "Đăng Nhập";
  if (btnToggle) btnToggle.textContent = "Chưa có tài khoản? Đăng ký";
  openModal("loginModal");
}

function toggleAuthMode() {
  isAuthRegisterMode = !isAuthRegisterMode;
  const title = document.getElementById("authModalTitle");
  const btnSubmit = document.getElementById("btnAuthSubmit");
  const btnToggle = document.getElementById("btnToggleAuthMode");
  if (isAuthRegisterMode) {
    if (title) title.textContent = "Đăng Ký Tài Khoản Thành Viên";
    if (btnSubmit) btnSubmit.textContent = "Tạo Tài Khoản";
    if (btnToggle) btnToggle.textContent = "Đã có tài khoản? Đăng nhập";
  } else {
    if (title) title.textContent = "Tài Khoản & Đăng Nhập";
    if (btnSubmit) btnSubmit.textContent = "Đăng Nhập";
    if (btnToggle) btnToggle.textContent = "Chưa có tài khoản? Đăng ký";
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById("authUsername")?.value.trim();
  const password = document.getElementById("authPassword")?.value.trim();
  if (!username || !password) return;

  const endpoint = isAuthRegisterMode ? "/api/auth/register" : "/api/auth/login";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ username, password, fullName: username }),
    });
    const data = await res.json();
    if (data.success) {
      authToken = data.token;
      localStorage.setItem("freze_auth_token", authToken);
      currentUser = { ...data.user, balance: data.balance || 0 };
      updateUserUI();
      closeModal("loginModal");
      showToast(`🎉 Đăng nhập thành công: ${currentUser.fullName || currentUser.username}`);
      loadDomains();
      loadTasksList();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  }
}

async function loadWalletData() {
  loadTransactions();
  if (currentUser.role === "admin") {
    loadUsersList();
  }
}

async function loadTransactions() {
  try {
    const res = await fetch("/api/wallet/transactions", { headers: authHeaders() });
    const data = await res.json();
    const tbody = document.getElementById("transactionsTableBody");
    if (!tbody) return;

    if (!data.success || !data.transactions || data.transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 20px;">Chưa có giao dịch nào phát sinh.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.transactions.map((t) => {
      const isPositive = t.amount > 0;
      const color = isPositive ? "var(--accent-emerald)" : "var(--accent-rose)";
      const sign = isPositive ? "+" : "";
      return `
        <tr>
          <td><span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">${new Date(t.timestamp).toLocaleString("vi-VN")}</span></td>
          <td><span class="user-role-tag ${t.type === "TOPUP" ? "admin" : "user"}">${t.type}</span></td>
          <td style="font-weight: 700; color: ${color};">${sign}${Number(t.amount).toLocaleString("vi-VN")} Xu</td>
          <td style="font-weight: 600; color: #fff;">${Number(t.newBalance).toLocaleString("vi-VN")} Xu</td>
          <td style="color: var(--text-muted);">${t.note || "-"}</td>
        </tr>
      `;
    }).join("");
  } catch {}
}

// ── 8A. USER CRUD & ADMIN MANAGEMENT ─────────────────────────────────────
let allUsersCache = [];

async function loadUsersList() {
  try {
    const res = await fetch("/api/admin/users", { headers: authHeaders() });
    const data = await res.json();
    const tbody = document.getElementById("usersTableBody");
    const topupUserSelect = document.getElementById("topupUserSelect");
    const assignUserSelect = document.getElementById("assignUserSelect");
    if (!tbody || !data.success) return;

    allUsersCache = data.users || [];

    if (topupUserSelect) {
      topupUserSelect.innerHTML = allUsersCache.map((u) => `
        <option value="${u.id}">${u.username} (${u.fullName}) - Số dư: ${(u.balance || 0).toLocaleString("vi-VN")} Xu</option>
      `).join("");
    }

    if (assignUserSelect) {
      assignUserSelect.innerHTML = allUsersCache.map((u) => `
        <option value="${u.id}">${u.username} (${u.fullName})</option>
      `).join("");
    }

    tbody.innerHTML = allUsersCache.map((u) => `
      <tr>
        <td style="font-weight: 700; color: #fff;">👤 ${u.username}</td>
        <td>${u.fullName || "-"}</td>
        <td><span class="user-role-tag ${u.role}">${u.role.toUpperCase()}</span></td>
        <td><span class="badge-status ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${u.status === 'active' ? '🟢 Hoạt Động' : '🔴 Tạm Khóa'}</span></td>
        <td style="font-weight: 700; color: var(--accent-emerald);">${(u.balance || 0).toLocaleString("vi-VN")} Xu</td>
        <td style="font-weight: 600; color: var(--accent-cyan);">${u.domainCount || 0} tên miền</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="openEditUserModal('${u.id}')" title="Sửa thông tin hoặc đổi mật khẩu">
              ✏️ Sửa
            </button>
            <button class="btn btn-secondary btn-sm" onclick="quickTopupForUser('${u.id}', '${u.username}')" title="Admin cộng Xu trực tiếp cho user này">
              💵 Cộng Xu
            </button>
            ${u.username !== "admin" ? `
            <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}', '${u.username}')" title="Xóa tài khoản">
              🗑️
            </button>` : ""}
          </div>
        </td>
      </tr>
    `).join("");
  } catch {}
}

function openCreateUserModal() {
  const form = document.getElementById("userCrudForm");
  if (form) form.reset();
  document.getElementById("userCrudTitle").textContent = "Thêm Thành Viên Mới";
  document.getElementById("crudUserId").value = "";
  document.getElementById("crudUsername").disabled = false;
  document.getElementById("crudPassword").required = true;
  document.getElementById("crudPasswordReq").style.display = "inline";
  document.getElementById("crudInitialBalanceGroup").style.display = "block";
  openModal("userCrudModal");
}

function openEditUserModal(userId) {
  const user = allUsersCache.find((u) => u.id === userId);
  if (!user) return;

  document.getElementById("userCrudTitle").textContent = `Sửa Thông Tin: ${user.username}`;
  document.getElementById("crudUserId").value = user.id;
  const usernameInput = document.getElementById("crudUsername");
  usernameInput.value = user.username;
  usernameInput.disabled = true; // Không cho đổi username
  document.getElementById("crudFullName").value = user.fullName || "";
  document.getElementById("crudRole").value = user.role || "user";
  document.getElementById("crudStatus").value = user.status || "active";
  document.getElementById("crudPassword").value = "";
  document.getElementById("crudPassword").required = false;
  document.getElementById("crudPasswordReq").style.display = "none";
  document.getElementById("crudInitialBalanceGroup").style.display = "none"; // Ẩn cấp vốn khi sửa

  openModal("userCrudModal");
}

async function handleUserCrudSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById("crudUserId").value;
  const username = document.getElementById("crudUsername").value.trim();
  const password = document.getElementById("crudPassword").value.trim();
  const fullName = document.getElementById("crudFullName").value.trim();
  const role = document.getElementById("crudRole").value;
  const status = document.getElementById("crudStatus").value;
  const initialBalance = parseFloat(document.getElementById("crudInitialBalance")?.value || "0");

  const isEdit = Boolean(userId);
  const endpoint = isEdit ? "/api/admin/users/update" : "/api/admin/users/create";
  const payload = isEdit
    ? { userId, fullName, role, status, ...(password ? { password } : {}) }
    : { username, password, fullName, role, initialBalance };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🎉 ${isEdit ? "Đã cập nhật thông tin thành viên!" : "Đã tạo thành viên mới thành công!"}`);
      closeModal("userCrudModal");
      loadUsersList();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  }
}

async function deleteUser(userId, username) {
  if (!confirm(`❓ Bạn có chắc chắn muốn xóa tài khoản [${username}] không? Mọi quyền quản lý domain sẽ bị thu hồi.`)) {
    return;
  }

  try {
    const res = await fetch("/api/admin/users/delete", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🗑️ Đã xóa thành công tài khoản [${username}]!`);
      loadUsersList();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  }
}

// ── 8B. DOMAIN OWNERSHIP ASSIGNMENT ────────────────────────────────────────
function parseAssignDomainList(raw) {
  const text = String(raw || "");
  const parts = text
    .split(/[\n\r,;\t]+/)
    .map((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .replace(/^www\./, "")
        .replace(/^\d+[\.\):\-\s]+/, "")
        .trim()
    )
    .filter((s) => s && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(s));
  return [...new Set(parts)];
}

function refreshAssignDomainParsedCount() {
  const ta = document.getElementById("assignDomainList");
  const countEl = document.getElementById("assignDomainParsedCount");
  if (!countEl) return;
  const n = parseAssignDomainList(ta?.value || "").length;
  countEl.textContent = String(n);
}

function addSelectedDomainToAssignList() {
  const sel = document.getElementById("assignDomainSelect");
  const ta = document.getElementById("assignDomainList");
  const dom = (sel?.value || "").trim().toLowerCase();
  if (!dom || !ta) return;
  const existing = parseAssignDomainList(ta.value);
  if (existing.includes(dom)) {
    showToast(`ℹ️ [${dom}] đã có trong list`);
    return;
  }
  ta.value = existing.length ? `${existing.join("\n")}\n${dom}` : dom;
  refreshAssignDomainParsedCount();
  showToast(`➕ Đã thêm [${dom}] vào list`);
}

async function openDomainAssignModal(domainToPreselect = "") {
  const domainSelect = document.getElementById("assignDomainSelect");
  const ta = document.getElementById("assignDomainList");
  if (ta) {
    ta.value = domainToPreselect ? String(domainToPreselect).trim().toLowerCase().replace(/^www\./, "") : "";
    ta.oninput = refreshAssignDomainParsedCount;
    refreshAssignDomainParsedCount();
  }
  if (domainSelect) {
    domainSelect.innerHTML = `<option value="">Đang tải danh sách...</option>`;
    try {
      const res = await fetch("/api/domains-list?all=1&fields=names", { headers: authHeaders() });
      const data = await res.json();
      const names = Array.isArray(data.domains) ? data.domains : [];
      domainSelect.innerHTML =
        `<option value="">-- Chọn để thêm vào list --</option>` +
        names.map((dom) => `<option value="${dom}">${dom}</option>`).join("");
    } catch {
      domainSelect.innerHTML = `<option value="">Không tải được danh sách</option>`;
    }
  }
  loadUsersList();
  openModal("domainAssignModal");
}

async function handleDomainAssignSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById("assignUserSelect")?.value;
  const domains = parseAssignDomainList(document.getElementById("assignDomainList")?.value || "");
  const btn = document.getElementById("btnConfirmAssignDomains");

  if (!domains.length || !userId) {
    showToast("❌ Dán ít nhất 1 tên miền hợp lệ và chọn thành viên");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = `Đang gán ${domains.length} miền...`;
  }

  try {
    const res = await fetch("/api/admin/assign-domain", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domains, userId }),
    });
    const data = await res.json();
    if (data.success) {
      const ok = data.assignedCount ?? domains.length;
      const fail = Array.isArray(data.failed) ? data.failed.length : 0;
      showToast(
        fail
          ? `✅ Đã gán ${ok} miền, ${fail} lỗi`
          : `✅ Đã gán ${ok} tên miền cho thành viên!`
      );
      closeModal("domainAssignModal");
      fetchDomains();
      loadUsersList();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Xác Nhận Gán Domain";
    }
  }
}

// ── 8C. VIETQR DYNAMIC GENERATION & AUTO WEBHOOK TOPUP ─────────────────────
let topupBalancePollTimer = null;
let topupBalanceBaseline = null;

function openTopupModal() {
  const simBtn = document.getElementById("btnSimulatePay");
  if (simBtn) {
    // Chỉ hiện nút test cho Admin (backend vẫn cần ALLOW_SIMULATE_PAY=true)
    simBtn.style.display = currentUser?.role === "admin" ? "inline-flex" : "none";
  }
  refreshVietQr();
  startTopupBalancePoll();
  openModal("topupModal");
}

function startTopupBalancePoll() {
  stopTopupBalancePoll();
  topupBalanceBaseline = typeof currentUser?.balance === "number" ? currentUser.balance : null;
  const hint = document.getElementById("topupPollHint");
  if (hint) hint.textContent = "Đang chờ webhook ngân hàng… số dư sẽ cập nhật tự động khi nhận được giao dịch.";

  topupBalancePollTimer = setInterval(async () => {
    try {
      const res = await fetch("/api/wallet/balance", { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) return;
      const bal = data.balance;
      if (topupBalanceBaseline === null) {
        topupBalanceBaseline = bal;
        return;
      }
      if (typeof bal === "number" && bal > topupBalanceBaseline) {
        const gained = bal - topupBalanceBaseline;
        showToast(`🎉 Đã cộng tự động +${gained.toLocaleString("vi-VN")} Xu! Số dư: ${bal.toLocaleString("vi-VN")} Xu`);
        topupBalanceBaseline = bal;
        if (typeof checkAuth === "function") checkAuth();
        stopTopupBalancePoll();
        closeModal("topupModal");
      }
    } catch {}
  }, 2000);
}

function stopTopupBalancePoll() {
  if (topupBalancePollTimer) {
    clearInterval(topupBalancePollTimer);
    topupBalancePollTimer = null;
  }
}

async function quickTopupForUser(userId, username) {
  if (!userId) {
    showToast("❌ Thiếu userId", "error");
    return;
  }
  if (currentUser?.role !== "admin") {
    showToast("❌ Chỉ Admin được cộng Xu cho thành viên", "error");
    return;
  }

  const raw = prompt(
    `Cộng Xu trực tiếp cho @${username}\n(Không mở QR admin — ghi đúng ví user này)\n\nNhập số Xu (> 0):`,
    "300"
  );
  if (raw === null) return;
  const amount = parseFloat(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("❌ Số Xu không hợp lệ", "error");
    return;
  }

  try {
    const res = await fetch("/api/admin/wallet/topup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        userId,
        amount,
        note: `Admin cộng ${amount} Xu cho @${username}`,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      showToast(`❌ Cộng Xu thất bại: ${data.error || "Lỗi"}`, "error");
      return;
    }
    showToast(
      `✅ Đã cộng +${amount.toLocaleString("vi-VN")} Xu cho @${username}. Số dư user: ${Number(data.balance).toLocaleString("vi-VN")} Xu`,
      "success"
    );
    await loadUsersList();
    await loadTransactions();
    if (typeof checkAuth === "function") checkAuth();
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`, "error");
  }
}

function setTopupAmount(amt) {
  const input = document.getElementById("topupAmountInput");
  if (input) {
    input.value = amt;
    refreshVietQr();
  }
}

async function refreshVietQr() {
  const amountXu = parseFloat(document.getElementById("topupAmountInput")?.value || "100");
  const username = currentUser.username || "admin";

  try {
    const res = await fetch(`/api/wallet/qr-code?amount=${amountXu}&username=${encodeURIComponent(username)}`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      const qrImg = document.getElementById("vietQrImage");
      const bankName = document.getElementById("qrBankName");
      const accNumber = document.getElementById("qrAccNumber");
      const accName = document.getElementById("qrAccName");
      const memo = document.getElementById("qrTransferMemo");
      const vnd = document.getElementById("qrAmountVnd");

      if (qrImg) qrImg.src = data.qrUrl;
      if (bankName) bankName.textContent = data.bankName || "MBBank";
      if (accNumber) accNumber.textContent = data.accountNumber;
      if (accName) accName.textContent = data.accountName;
      if (memo) memo.textContent = data.transferContent;
      if (vnd) vnd.textContent = `${data.amountVnd.toLocaleString("vi-VN")} VNĐ (${amountXu} Xu)`;
    }
  } catch {}
}

async function simulatePaymentWebhook() {
  const amountXu = parseFloat(document.getElementById("topupAmountInput")?.value || "100");
  const username = currentUser.username || "admin";

  if (!confirm(`⚠️ SIMULATE sẽ cộng Xu vào ví @${username} (user đang đăng nhập), KHÔNG phải thành viên khác.\n\nChỉ dùng để test webhook. Tiếp tục nạp ${amountXu} Xu?`)) {
    return;
  }

  showToast(`⚡ Đang gửi tín hiệu Webhook giả lập nạp ${amountXu} Xu...`, "processing");
  try {
    const res = await fetch("/api/wallet/simulate-pay", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ username, amount: amountXu }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(
        `✅ Simulate OK cho @${username}: +${amountXu.toLocaleString("vi-VN")} Xu → số dư ${Number(data.result.newBalance).toLocaleString("vi-VN")} Xu`,
        "success"
      );
      await checkAuth();
      await loadTransactions();
      stopTopupBalancePoll();
      closeModal("topupModal");
    } else {
      showToast(`❌ Lỗi webhook: ${data.error}`, "error");
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`, "error");
  }
}

// ── 9. TASK QUEUE CONTROLLER & REAL-TIME POLLING ───────────────────────────
let allTasks = [];
let hubOrdersCache = [];
let hubOptimisticTasks = new Map();
let taskPollingInterval = null;
const TASK_POLL_FAST_MS = 1200;
const TASK_POLL_SLOW_MS = 4000;
let tasksQueuePage = 1;
const TASKS_PAGE_SIZE = 8;
let tasksQueueFilter = "active"; // active | done | all

function isTaskRunningStatus(s) {
  return s === "RUNNING" || s === "PENDING";
}
function isTaskTerminalStatus(s) {
  return s === "SUCCESS" || s === "FAILED" || s === "CANCELLED";
}
function domainKeyOf(t) {
  return String(t?.domain || t?.id || "")
    .toLowerCase()
    .replace(/^www\./, "");
}

function pushOptimisticHubTask({ domain, title, label }) {
  const key = String(domain || "").toLowerCase();
  if (!key) return;
  hubOptimisticTasks.set(key, {
    id: `opt_${Date.now()}`,
    title: title || label || `Đang xử lý — ${domain}`,
    domain,
    status: "RUNNING",
    progress: 5,
    currentStep: label || "Đang gửi yêu cầu lên server...",
    steps: [{ time: new Date().toISOString(), message: label || "Đang gửi yêu cầu lên server...", status: "info" }],
    createdAt: new Date().toISOString(),
    _optimistic: true,
  });
  tasksQueuePage = 1;
  tasksQueueFilter = "active";
  renderTasks();
  updateTaskBadge();
}

function mergeHubTaskFromApi(task) {
  if (!task?.id) return;
  const key = String(task.domain || "").toLowerCase();
  if (key) hubOptimisticTasks.delete(key);
  const idx = allTasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) allTasks[idx] = task;
  else allTasks.unshift(task);
  renderTasks();
  updateTaskBadge();
}

function syncOptimisticTasksFromServer(tasks) {
  const serverDomains = new Set((tasks || []).map((t) => String(t.domain || "").toLowerCase()).filter(Boolean));
  for (const key of hubOptimisticTasks.keys()) {
    if (serverDomains.has(key)) hubOptimisticTasks.delete(key);
  }
  const now = Date.now();
  for (const [key, t] of hubOptimisticTasks.entries()) {
    const age = now - new Date(t.createdAt || 0).getTime();
    if (age > 3 * 60 * 1000) hubOptimisticTasks.delete(key);
  }
}

function rescheduleTaskPolling() {
  const running = getDisplayTasks().filter((t) => isTaskRunningStatus(t.status)).length;
  const ms = running > 0 ? TASK_POLL_FAST_MS : TASK_POLL_SLOW_MS;
  if (taskPollingInterval) clearInterval(taskPollingInterval);
  taskPollingInterval = setInterval(() => {
    loadTasksList();
  }, ms);
}

async function loadTasksList() {
  try {
    await fetchHistorySilent().catch(() => {});
    const [tasksRes, ordersRes] = await Promise.all([
      fetch("/api/tasks", { headers: authHeaders() }),
      fetch("/api/domain-orders", { headers: authHeaders() }).catch(() => null),
    ]);
    const data = await tasksRes.json();
    if (data.success) {
      allTasks = data.tasks || [];
      syncOptimisticTasksFromServer(allTasks);
    }
    if (ordersRes?.ok) {
      const ordersData = await ordersRes.json();
      hubOrdersCache = ordersData.success && Array.isArray(ordersData.orders) ? ordersData.orders : [];
    }
    renderTasks();
    updateTaskBadge();
    rescheduleTaskPolling();
  } catch {}
}

function getPendingOrdersAsTasks() {
  return (hubOrdersCache || [])
    .filter((o) => o.status === "pending" || (o.status === "approved" && !o.fulfilledAt))
    .map((o) => ({
      id: o.id,
      title:
        o.status === "pending"
          ? `🛒 Đặt mua — ${o.domain}`
          : `⚙️ Admin đang cài — ${o.domain}`,
      domain: o.domain,
      status: o.status === "pending" ? "PENDING" : "RUNNING",
      progress: o.status === "pending" ? 20 : 60,
      currentStep:
        o.status === "pending"
          ? `Chờ duyệt • ${(o.priceXu || 0).toLocaleString("vi-VN")} Xu`
          : "Admin đã duyệt — đang mua & cài đặt",
      steps: [
        {
          time: o.createdAt || new Date().toISOString(),
          message:
            o.status === "pending"
              ? `Chờ duyệt • ${(o.priceXu || 0).toLocaleString("vi-VN")} Xu`
              : "Admin đã duyệt — đang mua & cài đặt",
          status: "info",
        },
      ],
      createdAt: o.createdAt || new Date().toISOString(),
      userId: o.userId,
      username: o.username,
      _fromOrder: true,
    }));
}

function getHistoryProgressAsTasks() {
  const tasksById = new Map(allTasks.map((t) => [t.id, t]));
  const terminalDomains = new Set(
    allTasks
      .filter((t) => isTaskTerminalStatus(t.status))
      .map((t) => domainKeyOf(t))
      .filter(Boolean)
  );
  const now = Date.now();
  return (allHistory || [])
    .filter((h) => {
      if (h.status !== "in_progress" && h.status !== "pending") return false;
      if (h.taskId && tasksById.has(h.taskId)) {
        const t = tasksById.get(h.taskId);
        if (isTaskTerminalStatus(t.status) || isTaskRunningStatus(t.status)) return false;
      }
      const key = String(h.domain || "")
        .toLowerCase()
        .replace(/^www\./, "");
      if (key && terminalDomains.has(key)) {
        const term = allTasks.find((t) => domainKeyOf(t) === key && isTaskTerminalStatus(t.status));
        const termTs = term?.finishedAt ? new Date(term.finishedAt).getTime() : 0;
        const histTs = new Date(h.updatedAt || h.timestamp || 0).getTime();
        if (termTs && termTs >= histTs) return false;
      }
      const age = now - new Date(h.updatedAt || h.timestamp || 0).getTime();
      if (age > 2 * 60 * 60 * 1000) return false;
      return true;
    })
    .map((h) => ({
      id: h.taskId || h.id,
      title: `${h.actionLabel || "Đang xử lý"} — ${h.domain}`,
      domain: h.domain,
      status: "RUNNING",
      progress: typeof h.progressPct === "number" ? h.progressPct : 45,
      currentStep: h.progress || h.details?.step || "Đang xử lý trên server...",
      steps: [
        {
          time: h.timestamp || new Date().toISOString(),
          message: h.progress || h.details?.step || "Đang xử lý trên server...",
          status: "info",
        },
      ],
      createdAt: h.timestamp || new Date().toISOString(),
      userId: h.userId,
      username: h.username || h.fullName,
      _fromHistory: true,
    }));
}

function getDisplayTasks() {
  const merged = new Map();

  const beats = (next, prev) => {
    if (!prev) return true;
    if (next._fromHistory && !prev._fromHistory && isTaskTerminalStatus(prev.status)) return false;
    if (!next._fromHistory && prev._fromHistory && isTaskTerminalStatus(next.status)) return true;
    if (!next._fromHistory && prev._fromHistory && isTaskRunningStatus(next.status)) return true;
    if (next._fromHistory && !prev._fromHistory && isTaskRunningStatus(prev.status)) return false;
    if (isTaskTerminalStatus(next.status) && isTaskRunningStatus(prev.status) && prev._fromHistory) return true;
    if (isTaskRunningStatus(next.status) && next._fromHistory && isTaskTerminalStatus(prev.status)) return false;
    return (next._pri || 0) > (prev._pri || 0);
  };

  const add = (t, pri) => {
    const key = domainKeyOf(t);
    if (!key) return;
    const row = { ...t, _pri: pri };
    const prev = merged.get(key);
    if (beats(row, prev)) merged.set(key, row);
  };

  for (const t of hubOptimisticTasks.values()) add(t, 60);
  allTasks.filter((t) => isTaskRunningStatus(t.status)).forEach((t) => add(t, 50));
  getHistoryProgressAsTasks().forEach((t) => add(t, 35));
  getPendingOrdersAsTasks().forEach((t) => add(t, 30));

  allTasks
    .filter((t) => isTaskTerminalStatus(t.status))
    .forEach((t) => {
      const fin = t.finishedAt ? new Date(t.finishedAt).getTime() : 0;
      const keepMs = t.status === "FAILED" ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000;
      if (fin && Date.now() - fin < keepMs) add(t, 25);
    });

  const trackedDomains = new Set([...merged.keys()]);
  for (const h of allHistory || []) {
    if (h.status !== "failed" || !h.domain) continue;
    const key = String(h.domain).toLowerCase().replace(/^www\./, "");
    if (trackedDomains.has(key)) continue;
    const ts = h.updatedAt || h.timestamp;
    const age = ts ? Date.now() - new Date(ts).getTime() : Infinity;
    if (age > 6 * 60 * 60 * 1000) continue;
    add(
      {
        id: h.taskId || h.id,
        title: `${h.actionLabel || "Thất bại"} — ${h.domain}`,
        domain: h.domain,
        status: "FAILED",
        progress: 100,
        currentStep: h.error || "Cài đặt thất bại",
        steps: [
          {
            time: ts || new Date().toISOString(),
            message: h.error || "Cài đặt thất bại",
            status: "error",
          },
        ],
        createdAt: h.timestamp || new Date().toISOString(),
        finishedAt: ts || new Date().toISOString(),
        error: h.error,
        _fromHistory: true,
      },
      20
    );
  }

  return Array.from(merged.values())
    .sort((a, b) => {
      const ar = isTaskRunningStatus(a.status) ? 1 : 0;
      const br = isTaskRunningStatus(b.status) ? 1 : 0;
      if (br !== ar) return br - ar;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .map(({ _pri, ...t }) => t);
}

function getFilteredDisplayTasks() {
  const all = getDisplayTasks();
  if (tasksQueueFilter === "active") return all.filter((t) => isTaskRunningStatus(t.status));
  if (tasksQueueFilter === "done") return all.filter((t) => isTaskTerminalStatus(t.status));
  return all;
}

function setTasksQueueFilter(filter) {
  tasksQueueFilter = filter === "done" || filter === "all" ? filter : "active";
  tasksQueuePage = 1;
  renderTasks();
  updateTaskBadge();
}

function updateTaskBadge() {
  const badge = document.getElementById("badgeTasksCount");
  const headerCount = document.getElementById("headerTaskCount");
  const running = getDisplayTasks().filter((t) => isTaskRunningStatus(t.status)).length;

  if (badge) {
    badge.textContent = running;
    badge.style.display = running > 0 ? "inline-block" : "none";
  }

  if (headerCount) {
    headerCount.textContent = running > 0 ? `${running} đang chạy` : "0 đang chạy";
    headerCount.style.color = running > 0 ? "var(--accent-amber)" : "var(--text-muted)";
  }

  const mark = (id, on) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.outline = on ? "2px solid var(--accent-cyan)" : "";
    el.style.opacity = on ? "1" : "0.75";
  };
  mark("tasksFilterActive", tasksQueueFilter === "active");
  mark("tasksFilterDone", tasksQueueFilter === "done");
  mark("tasksFilterAll", tasksQueueFilter === "all");
}

function renderTasks() {
  const container = document.getElementById("tasksListContainer");
  if (!container) return;

  const filtered = getFilteredDisplayTasks();
  const totalPages = Math.max(1, Math.ceil(filtered.length / TASKS_PAGE_SIZE));
  if (tasksQueuePage > totalPages) tasksQueuePage = totalPages;
  const start = (tasksQueuePage - 1) * TASKS_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + TASKS_PAGE_SIZE);

  if (typeof renderPaginationBar === "function") {
    renderPaginationBar(document.getElementById("tasksPagination"), {
      page: tasksQueuePage,
      totalPages,
      total: filtered.length,
      limit: TASKS_PAGE_SIZE,
      onPage: (p) => {
        tasksQueuePage = p;
        renderTasks();
      },
      label: "tiến trình",
    });
  }

  if (filtered.length === 0) {
    const emptyMsg =
      tasksQueueFilter === "done"
        ? "Chưa có tiến trình vừa hoàn tất trong cửa sổ gần đây."
        : tasksQueueFilter === "all"
          ? "Hàng đợi trống."
          : "Không có tiến trình đang chạy.";
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center;">
        <span style="font-size: 40px;">☕</span>
        <p style="margin-top: 10px; color: var(--text-muted);">${emptyMsg}</p>
        <p style="font-size: 12px; color: var(--text-dim); margin-top: 6px;">Mua / đổi link / đổi LP — xong chuyển sang Lịch sử.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = pageItems
    .map((t) => {
      const statusClass = String(t.status || "").toLowerCase();
      const statusLabel =
        t.status === "SUCCESS"
          ? "✅ HOÀN TẤT"
          : t.status === "FAILED"
            ? "❌ THẤT BẠI"
            : t.status === "RUNNING"
              ? "⏳ ĐANG XỬ LÝ"
              : "⏱️ CHỜ XỬ LÝ";

      const lastLog =
        t.currentStep ||
        (t.steps && t.steps.length > 0 ? t.steps[t.steps.length - 1].message : "") ||
        "…";
      const pct = Math.min(100, Math.max(0, Number(t.progress) || 0));
      const safeId = String(t.id || "").replace(/'/g, "\\'");

      return `
      <div class="task-item-card ${statusClass}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="user-role-tag ${t.status === "SUCCESS" ? "admin" : t.status === "FAILED" ? "user" : "admin"}">${statusLabel}</span>
              <strong style="font-size: 15px; color: #fff;">${t.title}</strong>
            </div>
            <span style="font-size: 12px; color: var(--text-dim); margin-top: 4px; display: inline-block;">
              ${t.domain ? `<span style="font-family: var(--font-mono); color: #fbbf24;">${t.domain}</span> • ` : ""}
              ${new Date(t.createdAt).toLocaleString("vi-VN")}
            </span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            ${
              t.status === "SUCCESS" && t.result?.template?.id
                ? `<button class="btn btn-primary btn-sm" onclick="downloadTemplateZip('${t.result.template.id}')" style="background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); border-color: #10b981; font-weight: 700;">📥 Tải ZIP</button>`
                : ""
            }
            ${
              t.status === "FAILED"
                ? `<button class="btn btn-primary btn-sm" onclick="retryFailedDeploy('${safeId}')" style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-color: #f59e0b; font-weight: 700;">🔄 Thử Lại</button>`
                : ""
            }
            <button class="btn btn-secondary btn-sm" onclick="openTaskDetail('${safeId}')" ${t._fromHistory || t._fromOrder || t._optimistic ? "disabled title='Xem tab Lịch sử nếu cần'" : ""}>📜 Nhật ký</button>
          </div>
        </div>
        <div class="task-progress-track">
          <div class="task-progress-bar ${statusClass}" style="width: ${pct}%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 6px; gap: 10px;">
          <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">👉 ${lastLog}</span>
          <span style="font-weight: 700; color: #fff; flex-shrink:0;">${pct}%</span>
        </div>
      </div>`;
    })
    .join("");
}

function openTaskDetail(taskId) {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;

  const title = document.getElementById("taskDetailTitle");
  const sub = document.getElementById("taskDetailSubtitle");
  const pBar = document.getElementById("taskDetailProgressBar");
  const logs = document.getElementById("taskDetailLogs");

  if (title) title.textContent = task.title;
  if (sub) sub.textContent = `Trạng thái: ${task.status} (${task.progress}%) • Bắt đầu: ${new Date(task.createdAt).toLocaleTimeString()}`;
  if (pBar) {
    pBar.style.width = `${task.progress || 0}%`;
    pBar.className = `task-progress-bar ${String(task.status || "").toLowerCase()}`;
  }
  if (logs) {
    logs.innerHTML = (task.steps || [])
      .map(
        (s) => `
      <div style="margin-bottom: 6px;">
        <span style="color: var(--text-dim);">[${new Date(s.time).toLocaleTimeString()}]</span>
        <span style="color: ${s.status === "success" ? "var(--accent-emerald)" : s.status === "error" ? "var(--accent-rose)" : "var(--text-main)"};">${s.message}</span>
      </div>`
      )
      .join("");
    if (task.status === "FAILED") {
      const safeId = String(task.id || "").replace(/'/g, "\\'");
      logs.innerHTML += `
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08);">
          <button class="btn btn-primary btn-sm" onclick="closeModal('taskDetailModal'); retryFailedDeploy('${safeId}')" style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-color: #f59e0b; font-weight: 700;">
            🔄 Thử Lại Mua / Cài
          </button>
        </div>`;
    }
  }

  openModal("taskDetailModal");
}

/** Ghép lại args deploy từ task FAILED hoặc lịch sử failed */
function buildRetryDeployArgs(refId) {
  const id = String(refId || "");
  const task = allTasks.find((t) => t.id === id);
  const hist =
    (allHistory || []).find((h) => h.id === id || h.taskId === id) ||
    (task?.domain
      ? (allHistory || []).find((h) => String(h.domain || "").toLowerCase() === String(task.domain).toLowerCase() && h.status === "failed")
      : null);

  if (task?.params?.domain || hist?.domain) {
    const p = task?.params || {};
    const mode = String(p.mode || p.type || task?.type || hist?.actionType || "").toUpperCase();
    const buy =
      p.isBuy === true ||
      hist?.isBuy === true ||
      mode.includes("BUY") ||
      /mua/i.test(String(task?.title || hist?.actionLabel || ""));
    return {
      domain: p.domain || hist.domain,
      link: p.link || hist?.link || "",
      tele: p.tele || hist?.tele || p.link || hist?.link || "",
      templateId: p.templateId || hist?.templateId || "",
      isBuy: buy,
      type: mode.includes("302") ? "302" : "lp",
      spaceshipBuyConfirmed: false,
      targetUserId: p.targetUserId || undefined,
      orderId: p.orderId || undefined,
    };
  }
  return null;
}

window.retryFailedDeploy = async function retryFailedDeploy(refId) {
  const args = buildRetryDeployArgs(refId);
  if (!args?.domain) {
    showToast("❌ Không tìm thấy thông tin để thử lại (task/lịch sử).", "error");
    return;
  }
  const ok = confirm(
    `Thử lại ${args.isBuy ? "MUA & CÀI" : "CÀI"} cho [${args.domain}]?\n\n` +
      `Nếu lỗi hết tiền Spaceship: nạp balance trước, rồi bấm OK để báo giá và mua lại.`
  );
  if (!ok) return;
  showToast(`🔄 Đang thử lại [${args.domain}]...`, "info");
  try {
    await executeDeployFlow(args);
  } catch (err) {
    showToast(`❌ Thử lại thất bại: ${err.message}`, "error");
  }
};

function startTaskPolling() {
  rescheduleTaskPolling();
}

// ── 10. VIP WEB CLONER CONTROLLER & ADVANCED CUSTOMIZATION ──────────────────
let uploadedClonerLogoBase64 = null;
let uploadedClonerFaviconBase64 = null;

function handleClonerLogoUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    uploadedClonerLogoBase64 = event.target.result;
    const previewContainer = document.getElementById("clonerLogoPreviewContainer");
    const previewImg = document.getElementById("clonerLogoPreviewImg");
    const filenameText = document.getElementById("clonerLogoFilenameText");
    const urlInput = document.getElementById("clonerLogoUrlInput");

    if (previewImg) previewImg.src = uploadedClonerLogoBase64;
    if (filenameText) filenameText.textContent = `📁 ${file.name} (${Math.round(file.size / 1024)} KB)`;
    if (previewContainer) previewContainer.style.display = "flex";
    if (urlInput) urlInput.value = "";
    showToast(`✅ Đã tải ảnh Logo: ${file.name}`);
  };
  reader.readAsDataURL(file);
}

function handleClonerLogoUrlInput(e) {
  const val = e.target.value.trim();
  uploadedClonerLogoBase64 = val || null;
  const previewContainer = document.getElementById("clonerLogoPreviewContainer");
  const previewImg = document.getElementById("clonerLogoPreviewImg");
  const filenameText = document.getElementById("clonerLogoFilenameText");

  if (val && (val.startsWith("http://") || val.startsWith("https://"))) {
    if (previewImg) previewImg.src = val;
    if (filenameText) filenameText.textContent = `🔗 Link ảnh trực tiếp`;
    if (previewContainer) previewContainer.style.display = "flex";
  } else if (!val) {
    if (previewContainer) previewContainer.style.display = "none";
  }
}

function clearClonerLogo() {
  uploadedClonerLogoBase64 = null;
  const fileInput = document.getElementById("clonerLogoFileInput");
  const urlInput = document.getElementById("clonerLogoUrlInput");
  const previewContainer = document.getElementById("clonerLogoPreviewContainer");

  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = "";
  if (previewContainer) previewContainer.style.display = "none";
}

function handleClonerFaviconUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    uploadedClonerFaviconBase64 = event.target.result;
    const previewContainer = document.getElementById("clonerFaviconPreviewContainer");
    const previewImg = document.getElementById("clonerFaviconPreviewImg");
    const filenameText = document.getElementById("clonerFaviconFilenameText");
    const urlInput = document.getElementById("clonerFaviconUrlInput");

    if (previewImg) previewImg.src = uploadedClonerFaviconBase64;
    if (filenameText) filenameText.textContent = `📁 ${file.name}`;
    if (previewContainer) previewContainer.style.display = "flex";
    if (urlInput) urlInput.value = "";
    showToast(`✅ Đã tải Favicon: ${file.name}`);
  };
  reader.readAsDataURL(file);
}

function handleClonerFaviconUrlInput(e) {
  const val = e.target.value.trim();
  uploadedClonerFaviconBase64 = val || null;
  const previewContainer = document.getElementById("clonerFaviconPreviewContainer");
  const previewImg = document.getElementById("clonerFaviconPreviewImg");
  const filenameText = document.getElementById("clonerFaviconFilenameText");

  if (val && (val.startsWith("http://") || val.startsWith("https://"))) {
    if (previewImg) previewImg.src = val;
    if (filenameText) filenameText.textContent = `🔗 Link icon trực tiếp`;
    if (previewContainer) previewContainer.style.display = "flex";
  } else if (!val) {
    if (previewContainer) previewContainer.style.display = "none";
  }
}

function clearClonerFavicon() {
  uploadedClonerFaviconBase64 = null;
  const fileInput = document.getElementById("clonerFaviconFileInput");
  const urlInput = document.getElementById("clonerFaviconUrlInput");
  const previewContainer = document.getElementById("clonerFaviconPreviewContainer");

  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = "";
  if (previewContainer) previewContainer.style.display = "none";
}

function addClonerTextReplacementRow() {
  const container = document.getElementById("clonerTextReplacementsContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "cloner-replace-row";
  row.style.cssText = "display: flex; align-items: center; gap: 10px;";
  row.innerHTML = `
    <input type="text" class="form-input cloner-find-text" placeholder="Từ khóa cũ (VD: MM88 hoặc số hotline)" style="flex: 1; font-size: 13px;">
    <span style="color: var(--accent-cyan); font-weight: 800; font-size: 15px;">➔</span>
    <input type="text" class="form-input cloner-replace-text" placeholder="Thay bằng (VD: GG88 hoặc số mới)" style="flex: 1; font-size: 13px;">
    <button type="button" class="btn btn-secondary btn-sm" onclick="removeClonerTextReplacementRow(this)" style="color: var(--accent-rose); border-color: rgba(244,63,94,0.3); padding: 6px 10px;" title="Xóa dòng này">
      🗑️
    </button>
  `;
  container.appendChild(row);
}

function removeClonerTextReplacementRow(btn) {
  const row = btn.closest(".cloner-replace-row");
  if (row) row.remove();
}

async function handleCloneWebsite(e) {
  e.preventDefault();
  const url = document.getElementById("clonerSourceUrl")?.value.trim();
  const templateName = document.getElementById("clonerTemplateName")?.value.trim();
  const domain = document.getElementById("clonerDomain")?.value.trim();
  const targetUrl = document.getElementById("clonerTargetUrl")?.value.trim();
  const pageTitle = document.getElementById("clonerPageTitleInput")?.value.trim();

  // Thu thập danh sách thay thế text
  const textReplacements = [];
  const rows = document.querySelectorAll(".cloner-replace-row");
  rows.forEach((r) => {
    const find = r.querySelector(".cloner-find-text")?.value.trim();
    const replace = r.querySelector(".cloner-replace-text")?.value.trim();
    if (find) {
      textReplacements.push({ find, replace: replace || "" });
    }
  });

  if (!url) {
    showToast("❌ Vui lòng nhập link website cần sao chép");
    return;
  }

  const btn = document.getElementById("btnSubmitClone");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳ Đang đưa vào hàng đợi...</span>`;
  }

  try {
    const res = await fetch("/api/tasks/clone-web", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        url,
        templateName,
        domain,
        targetUrl,
        isDeploy: Boolean(domain),
        logoData: uploadedClonerLogoBase64 || undefined,
        faviconData: uploadedClonerFaviconBase64 || undefined,
        pageTitle: pageTitle || undefined,
        textReplacements: textReplacements.length > 0 ? textReplacements : undefined,
      }),
    });
    const data = await res.json();
    if (data.success) {
      showProcessingToast("Clone VIP");
      startHubProgressWatch({
        domain: domain || templateName || url,
        label: "Đang clone & đóng gói",
        switchTab: true,
      });
    } else {
      showToast(`❌ Lỗi: ${data.error}`, "error");
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🚀 Bắt Đầu Sao Chép & Đóng Gói VIP</span>`;
    }
  }
}

function downloadTemplateZip(templateId) {
  if (!templateId) return;
  const token = authToken || localStorage.getItem("freze_auth_token") || "";
  const downloadUrl = `/api/templates/${templateId}/download?token=${encodeURIComponent(token)}`;
  window.open(downloadUrl, "_blank");
  showToast(`📥 Đang tải trọn bộ mã nguồn ZIP [${templateId}]...`);
}

// ── TEMPLATE LIVE CODE EDITOR & RE-DEPLOY ────────────────────────────────
let currentEditorTemplateId = null;
let currentEditorFile = null;
let currentEditorFilesList = [];
let isEditorFileModified = false;

async function openTemplateCodeEditor(templateId) {
  currentEditorTemplateId = templateId;
  const tpl = allTemplates.find((t) => t.id === templateId) || { name: templateId };

  const titleEl = document.getElementById("editorModalTitle");
  const subEl = document.getElementById("editorModalSubtitle");
  const btnZip = document.getElementById("btnEditorDownloadZip");
  const textarea = document.getElementById("templateCodeTextarea");
  const statusMsg = document.getElementById("editorStatusMessage");

  if (titleEl) titleEl.textContent = `💻 Mã Nguồn: ${tpl.name || templateId}`;
  if (subEl) subEl.textContent = `Thư mục VPS: /var/www/Landingpages/CLONED/${templateId}`;
  if (btnZip) btnZip.onclick = () => downloadTemplateZip(templateId);
  if (statusMsg) {
    statusMsg.textContent = "Sẵn sàng";
    statusMsg.style.color = "var(--accent-emerald)";
  }

  // Setup Tab key handler in textarea if not already set
  if (textarea && !textarea.dataset.hasTabHandler) {
    textarea.dataset.hasTabHandler = "true";
    textarea.addEventListener("keydown", function(e) {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + "  " + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
        markEditorModified();
      }
    });
    textarea.addEventListener("input", markEditorModified);
  }

  openModal("templateCodeEditorModal");
  await reloadTemplateFilesList();
}

function markEditorModified() {
  isEditorFileModified = true;
  const indicator = document.getElementById("editorModifiedIndicator");
  if (indicator) indicator.style.display = "inline";
}

function unmarkEditorModified() {
  isEditorFileModified = false;
  const indicator = document.getElementById("editorModifiedIndicator");
  if (indicator) indicator.style.display = "none";
}

async function reloadTemplateFilesList() {
  if (!currentEditorTemplateId) return;
  const fileListContainer = document.getElementById("editorFileList");
  if (fileListContainer) {
    fileListContainer.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 20px; font-size: 12px;"><div class="spinner" style="margin: 0 auto 8px auto; width: 20px; height: 20px;"></div>Đang tải file...</div>`;
  }

  try {
    const res = await apiFetch(`/api/templates/${encodeURIComponent(currentEditorTemplateId)}/files`);
    if (!res.ok) throw new Error(res.error || "Không lấy được danh sách file");

    currentEditorFilesList = res.files || [];
    renderEditorFileList();

    // Auto-open index.html or config.js or first file
    if (currentEditorFilesList.length > 0) {
      const preferred = currentEditorFilesList.find(f => f.name === "index.html") || 
                        currentEditorFilesList.find(f => f.name === "config.js") || 
                        currentEditorFilesList.find(f => f.name === "domains.json") || 
                        currentEditorFilesList[0];
      if (preferred) {
        await loadTemplateFileContent(preferred.name);
      }
    }
  } catch (err) {
    if (fileListContainer) {
      fileListContainer.innerHTML = `<div style="color: var(--accent-rose); padding: 12px; font-size: 12px;">❌ Lỗi: ${err.message}</div>`;
    }
  }
}

function renderEditorFileList() {
  const fileListContainer = document.getElementById("editorFileList");
  if (!fileListContainer) return;

  if (currentEditorFilesList.length === 0) {
    fileListContainer.innerHTML = `<div style="color: var(--text-dim); padding: 12px; font-size: 12px; text-align: center;">Chưa có file nào</div>`;
    return;
  }

  fileListContainer.innerHTML = currentEditorFilesList.map((f) => {
    const isActive = f.name === currentEditorFile;
    let icon = "📄";
    if (f.name.endsWith(".html")) icon = "🌐";
    else if (f.name.endsWith(".js")) icon = "⚡";
    else if (f.name.endsWith(".json")) icon = "⚙️";
    else if (f.name.endsWith(".css")) icon = "🎨";
    else if (f.name.endsWith(".png") || f.name.endsWith(".jpg") || f.name.endsWith(".webp") || f.name.endsWith(".svg")) icon = "🖼️";

    const activeBg = isActive ? "background: rgba(99,102,241,0.25); border: 1px solid rgba(99,102,241,0.5); color: #fff;" : "background: rgba(255,255,255,0.03); border: 1px solid transparent; color: var(--text-muted);";

    return `
      <div class="editor-file-item" onclick="loadTemplateFileContent('${f.name}')" style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; margin-bottom: 4px; border-radius: 6px; cursor: pointer; font-size: 12px; font-family: var(--font-mono); transition: all 0.2s; ${activeBg}">
        <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span>${icon}</span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.name}</span>
        </div>
        <span style="font-size: 10px; color: var(--text-dim); font-family: sans-serif;">${formatBytes(f.size)}</span>
      </div>
    `;
  }).join("");
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

async function loadTemplateFileContent(filename) {
  if (!currentEditorTemplateId || !filename) return;

  if (isEditorFileModified && currentEditorFile && currentEditorFile !== filename) {
    if (!confirm(`Bạn có thay đổi chưa lưu ở file "${currentEditorFile}". Bạn có muốn chuyển file và bỏ qua thay đổi không?`)) {
      return;
    }
  }

  currentEditorFile = filename;
  renderEditorFileList();

  const overlay = document.getElementById("editorLoadingOverlay");
  const loadingText = document.getElementById("editorLoadingText");
  const textarea = document.getElementById("templateCodeTextarea");
  const badgeEl = document.getElementById("editorActiveFileBadge");
  const pathEl = document.getElementById("editorActiveFilePath");

  if (badgeEl) badgeEl.textContent = filename;
  if (pathEl) pathEl.textContent = `/${filename}`;
  if (overlay) {
    overlay.style.display = "flex";
    if (loadingText) loadingText.textContent = `Đang tải nội dung ${filename}...`;
  }

  try {
    const res = await apiFetch(`/api/templates/${encodeURIComponent(currentEditorTemplateId)}/file?file=${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error(res.error || "Không thể đọc nội dung file");

    if (textarea) {
      textarea.value = res.content || "";
    }
    unmarkEditorModified();
  } catch (err) {
    showToast(`❌ Không đọc được file: ${err.message}`);
  } finally {
    if (overlay) overlay.style.display = "none";
  }
}

async function saveActiveTemplateFile(deployNow = false) {
  if (!currentEditorTemplateId || !currentEditorFile) {
    showToast("⚠️ Vui lòng chọn một file để lưu");
    return;
  }

  const textarea = document.getElementById("templateCodeTextarea");
  const statusMsg = document.getElementById("editorStatusMessage");
  const btnSaveOnly = document.getElementById("btnSaveTemplateFileOnly");
  const btnSaveDeploy = document.getElementById("btnSaveAndDeployTemplate");

  const content = textarea ? textarea.value : "";

  if (btnSaveOnly) btnSaveOnly.disabled = true;
  if (btnSaveDeploy) {
    btnSaveDeploy.disabled = true;
    btnSaveDeploy.innerHTML = `<span>⏳ Đang xử lý...</span>`;
  }

  if (statusMsg) {
    statusMsg.textContent = deployNow ? "🚀 Đang lưu và deploy lên Cloudflare Pages..." : "💾 Đang ghi file lên VPS...";
    statusMsg.style.color = "var(--accent-cyan)";
  }

  try {
    const res = await apiFetch(`/api/templates/${encodeURIComponent(currentEditorTemplateId)}/file`, {
      method: "POST",
      body: JSON.stringify({
        file: currentEditorFile,
        content: content,
        isDeploy: deployNow,
      }),
    });

    if (!res.ok) throw new Error(res.error || "Lỗi lưu file");

    unmarkEditorModified();
    if (statusMsg) {
      statusMsg.textContent = deployNow ? "✅ Đã lưu và deploy thành công!" : "✅ Đã lưu file thành công!";
      statusMsg.style.color = "var(--accent-emerald)";
    }
    showToast(deployNow ? `🎉 Đã lưu & Deploy thành công mẫu [${currentEditorTemplateId}]!` : `💾 Đã lưu file [${currentEditorFile}] thành công!`);
  } catch (err) {
    if (statusMsg) {
      statusMsg.textContent = `❌ Lỗi: ${err.message}`;
      statusMsg.style.color = "var(--accent-rose)";
    }
    showToast(`❌ Lỗi: ${err.message}`);
  } finally {
    if (btnSaveOnly) btnSaveOnly.disabled = false;
    if (btnSaveDeploy) {
      btnSaveDeploy.disabled = false;
      btnSaveDeploy.innerHTML = `🚀 Lưu & Re-Deploy Cloudflare`;
    }
  }
}

// ── 11. 1-CLICK 302 🔁 LANDING PAGE SWITCHER ──────────────────────────────
async function openSwitchModeModal(domain, currentMode, currentLink) {
  const domainInput = document.getElementById("switchModeDomain");
  const title = document.getElementById("switchModalDomainTitle");
  const modeSelect = document.getElementById("switchToMode");
  const targetUrlInput = document.getElementById("switchModeTargetUrl");
  const tplSelect = document.getElementById("switchModeTemplate");

  if (domainInput) domainInput.value = domain;
  if (title) title.textContent = `Tên miền: ${domain} (Hiện tại: ${currentMode || "Chưa rõ"})`;

  const resolved = await resolveUiCurrentLink(domain, currentLink);
  if (targetUrlInput) {
    targetUrlInput.value = resolved.link || "";
    targetUrlInput.required = false;
    targetUrlInput.placeholder = "Để trống = giữ link cũ (tự kế thừa)";
  }

  if (tplSelect && allTemplates.length > 0) {
    tplSelect.innerHTML = allTemplates.map((t) => `
      <option value="${t.id}">${t.name} (${t.brand})</option>
    `).join("");
  }

  if (modeSelect) {
    modeSelect.value = currentMode === "DIRECT_302" || currentMode === "302 Direct Redirect" || currentMode === "302" ? "LP" : "302";
  }

  toggleSwitchModeFields();
  openModal("switchModeModal");
}

function toggleSwitchModeFields() {
  const modeSelect = document.getElementById("switchToMode");
  const tplGroup = document.getElementById("switchModeTemplateGroup");
  if (modeSelect && tplGroup) {
    tplGroup.style.display = modeSelect.value === "LP" ? "block" : "none";
  }
}

async function handleSwitchModeSubmit(e) {
  e.preventDefault();
  const domain = document.getElementById("switchModeDomain")?.value;
  const toMode = document.getElementById("switchToMode")?.value;
  const templateId = document.getElementById("switchModeTemplate")?.value;
  const targetUrl = document.getElementById("switchModeTargetUrl")?.value.trim();

  if (!domain) {
    showToast("❌ Vui lòng nhập đầy đủ thông tin");
    return;
  }

  closeModal("switchModeModal");
  startHubProgressWatch({ domain, label: `Đang chuyển sang ${toMode === "LP" ? "LP" : "302"}` });

  try {
    const res = await fetch("/api/tasks/switch-mode", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain, toMode, templateId, targetUrl: targetUrl || "" }),
    });
    const data = await res.json();
    if (data.success) {
      if (data.task) mergeHubTaskFromApi(data.task);
      fetchDomains();
      await fetchHistorySilent();
      await loadTasksList();
    } else {
      showActionResultPopup({
        success: false,
        title: "Chuyển Đổi Chế Độ Thất Bại!",
        subtitle: "Gặp sự cố khi cấu hình lại DNS / Pages",
        error: data.error || "Không thể chuyển đổi chế độ",
        domain,
      });
    }
  } catch (err) {
    showActionResultPopup({
      success: false,
      title: "Lỗi Kết Nối Máy Chủ",
      error: err.message,
      domain,
    });
  }
}

// ── 12. POPUP KẾT QUẢ THAO TÁC CHI TIẾT & CHUYÊN NGHIỆP ──────────────────────────
let currentActionResultData = null;

function showActionResultPopup(options) {
  const {
    success = true,
    title = "",
    subtitle = "",
    message = "",
    domain = "",
    type = "",
    link = "",
    tele = "",
    cfAccount = "",
    repos = "",
    error = "",
  } = options;

  currentActionResultData = { domain, link, tele, ...options };

  const iconBox = document.getElementById("actionResultIconBox");
  const titleEl = document.getElementById("actionResultTitle");
  const subtitleEl = document.getElementById("actionResultSubtitle");
  const bannerEl = document.getElementById("actionResultBanner");
  const domainEl = document.getElementById("actionResultDomain");
  const typeBadge = document.getElementById("actionResultTypeBadge");
  const linkEl = document.getElementById("actionResultLink");
  const linkRow = document.getElementById("actionResultLinkRow");
  const teleEl = document.getElementById("actionResultTele");
  const teleRow = document.getElementById("actionResultTeleRow");
  const cfAccountEl = document.getElementById("actionResultCfAccount");
  const reposEl = document.getElementById("actionResultRepos");
  const reposRow = document.getElementById("actionResultReposRow");
  const visitBtn = document.getElementById("actionResultVisitBtn");

  if (success) {
    if (iconBox) {
      iconBox.innerHTML = "✅";
      iconBox.style.background = "rgba(16, 185, 129, 0.15)";
      iconBox.style.borderColor = "rgba(16, 185, 129, 0.35)";
    }
    if (titleEl) {
      titleEl.textContent = title || "Thao Tác Thành Công!";
      titleEl.style.color = "#10b981";
    }
    if (subtitleEl) subtitleEl.textContent = subtitle || "Cấu hình tên miền đã được kích hoạt trên hệ thống";
    if (bannerEl) {
      bannerEl.style.background = "rgba(16, 185, 129, 0.08)";
      bannerEl.style.borderColor = "rgba(16, 185, 129, 0.3)";
      bannerEl.style.color = "#d1fae5";
      bannerEl.innerHTML = `🎉 <b>Thành công:</b> ${message || "Đã áp dụng thay đổi thành công!"}`;
    }
  } else {
    if (iconBox) {
      iconBox.innerHTML = "❌";
      iconBox.style.background = "rgba(239, 68, 68, 0.15)";
      iconBox.style.borderColor = "rgba(239, 68, 68, 0.35)";
    }
    if (titleEl) {
      titleEl.textContent = title || "Thao Tác Thất Bại!";
      titleEl.style.color = "#ef4444";
    }
    if (subtitleEl) subtitleEl.textContent = subtitle || "Đã xảy ra lỗi trong quá trình xử lý";
    if (bannerEl) {
      bannerEl.style.background = "rgba(239, 68, 68, 0.08)";
      bannerEl.style.borderColor = "rgba(239, 68, 68, 0.3)";
      bannerEl.style.color = "#fee2e2";
      bannerEl.innerHTML = `⚠️ <b>Chi tiết lỗi:</b> ${error || message || "Không thể hoàn tất thao tác."}`;
    }
  }

  if (domainEl) domainEl.textContent = domain || "N/A";
  if (typeBadge) {
    typeBadge.textContent = type === "landing_page" ? "Landing Page (Pages)" : (type === "redirect_302" ? "302 Direct Redirect" : (type || "Cloudflare"));
    typeBadge.className = `dom-tag ${type === "landing_page" ? "lp" : "cf"}`;
  }

  if (link) {
    if (linkEl) linkEl.textContent = link;
    if (linkRow) linkRow.style.display = "flex";
  } else if (linkRow) {
    linkRow.style.display = "none";
  }

  if (teleEl && tele) {
    teleEl.textContent = tele;
    if (teleRow) teleRow.style.display = "flex";
  } else if (teleRow) {
    teleRow.style.display = "none";
  }

  if (cfAccountEl) cfAccountEl.textContent = cfAccount || "Tự động nhận diện";

  if (reposEl && repos) {
    reposEl.textContent = typeof repos === "string" ? repos : JSON.stringify(repos);
    if (reposRow) reposRow.style.display = "flex";
  } else if (reposRow) {
    reposRow.style.display = "none";
  }

  if (visitBtn) {
    const cleanDom = (domain || "").replace(/^https?:\/\//, "");
    if (cleanDom) {
      visitBtn.href = `https://${cleanDom}`;
      visitBtn.style.display = "inline-flex";
    } else {
      visitBtn.style.display = "none";
    }
  }

  openModal("actionResultModal");
}

function copyActionResultDomain() {
  if (currentActionResultData?.domain) {
    copyText(currentActionResultData.domain);
    showToast("📋 Đã sao chép tên miền: " + currentActionResultData.domain);
  }
}

function copyActionResultLink() {
  if (currentActionResultData?.link) {
    copyText(currentActionResultData.link);
    showToast("📋 Đã sao chép link đích!");
  }
}

function copyActionResultTele() {
  if (currentActionResultData?.tele) {
    copyText(currentActionResultData.tele);
    showToast("📋 Đã sao chép link Telegram!");
  }
}

// ── 13. DOMAIN PERMISSION & APPROVAL SUBSYSTEM ────────────────────────────
let permSearchResultsCache = [];

async function loadPermsData() {
  if (currentUser && currentUser.role === "admin") {
    const adminPill = document.getElementById("pillPermAdminApproval");
    if (adminPill) adminPill.style.display = "inline-flex";
    loadAdminPendingRequests();
    loadUsersList();
  } else {
    const adminPill = document.getElementById("pillPermAdminApproval");
    if (adminPill) adminPill.style.display = "none";
  }

  loadMyApprovedDomains();
  loadMyRequestsHistory();
  searchPermDomains();
}

async function searchPermDomains() {
  const query = (document.getElementById("permSearchInput")?.value || "").trim();
  const loading = document.getElementById("permSearchLoading");
  const tbody = document.getElementById("permSearchTableBody");
  const summary = document.getElementById("permSearchResultSummary");

  if (loading) loading.style.display = "block";
  if (summary) summary.textContent = "Đang tìm kiếm...";

  try {
    const res = await fetch(`/api/domains/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
    const data = await res.json();
    if (loading) loading.style.display = "none";

    if (data.success && Array.isArray(data.results)) {
      permSearchResultsCache = data.results;
      if (summary) {
        const scopeNote = currentUser?.role === "admin" ? "trên hệ thống" : "trong danh sách được cấp / đang chờ duyệt";
        summary.textContent = `Tìm thấy ${data.count} tên miền ${scopeNote}`;
      }
      renderPermSearchResults(data.results);
    } else {
      if (summary) summary.textContent = "Lỗi nạp dữ liệu";
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--accent-rose); padding: 20px;">${data.error || "Không thể tải danh sách"}</td></tr>`;
    }
  } catch (err) {
    if (loading) loading.style.display = "none";
    if (summary) summary.textContent = "Lỗi kết nối";
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--accent-rose); padding: 20px;">Lỗi kết nối: ${err.message}</td></tr>`;
  }
}

function renderPermSearchResults(results) {
  const tbody = document.getElementById("permSearchTableBody");
  if (!tbody) return;

  if (results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">Không tìm thấy tên miền nào phù hợp với từ khóa.</td></tr>`;
    return;
  }

  tbody.innerHTML = results.map((r, idx) => {
    let permBadge = "";
    let actionButtons = "";

    if (r.permission === "owned") {
      permBadge = `<span class="badge-status badge-success" style="font-weight: 700;">🟢 ĐÃ CÓ QUYỀN (Full Control)</span>`;
      actionButtons = `
        <div style="display: flex; gap: 6px; justify-content: flex-end;">
          <button class="btn btn-primary btn-sm" onclick="openEditLinkModal('${r.domain}')" title="Cập nhật link đích">
            🔗 Đổi Link
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openSwitchTemplateModal('${r.domain}')" title="Gán mẫu Landing Page khác">
            🎨 Đổi Mẫu
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openSwitchModeModal('${r.domain}')" title="Chuyển sang 302 hoặc Landing Page">
            🔀 302 / LP
          </button>
        </div>
      `;
    } else if (r.permission === "pending") {
      permBadge = `<span class="badge-status badge-warning" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-weight: 700;">⏳ Đang Chờ Admin Duyệt</span>`;
      actionButtons = `<span style="font-size: 12px; color: #fbbf24;">Đã gửi yêu cầu lúc ${r.pendingRequest?.createdAt ? new Date(r.pendingRequest.createdAt).toLocaleTimeString("vi-VN") : "vừa xong"}</span>`;
    } else {
      permBadge = `<span class="badge-status badge-danger" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); font-weight: 700;">🔒 Chưa Có Quyền</span>`;
      actionButtons = `
        <button class="btn btn-primary btn-sm" style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); font-weight: 700;" onclick="openRequestDomainModal('${r.domain}')">
          📩 Gửi Yêu Cầu Xin Cấp Quyền
        </button>
      `;
    }

    const ownerText = r.owner ? (typeof r.owner === "string" ? r.owner : `👤 ${r.owner.username}`) : (r.accountName || "Hệ thống");

    return `
      <tr>
        <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
        <td>
          <strong style="font-size: 14px; color: #fff; font-family: var(--font-mono);">${r.domain}</strong>
        </td>
        <td>
          <span class="badge-status ${r.status === 'active' ? 'badge-success' : 'badge-warning'}">
            ${r.status === 'active' ? '🟢 Active' : '🟡 Pending'}
          </span>
        </td>
        <td style="color: var(--text-muted); font-size: 13px;">${ownerText}</td>
        <td>${permBadge}</td>
        <td style="text-align: right;">${actionButtons}</td>
      </tr>
    `;
  }).join("");
}

function openRequestDomainModal(domain) {
  const domainInput = document.getElementById("reqDomainInput");
  const noteInput = document.getElementById("reqDomainNoteInput");
  if (domainInput) domainInput.value = domain;
  if (noteInput) noteInput.value = "";
  openModal("requestDomainModal");
}

async function handleRequestDomainSubmit(e) {
  e.preventDefault();
  const domain = document.getElementById("reqDomainInput")?.value;
  const note = document.getElementById("reqDomainNoteInput")?.value.trim();
  const btn = document.getElementById("btnSubmitDomainRequest");

  if (!domain) {
    showToast("❌ Vui lòng nhập tên miền hợp lệ");
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/domain-requests", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain, note }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🎉 ${data.message}`);
      closeModal("requestDomainModal");
      searchPermDomains();
      loadMyRequestsHistory();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadMyApprovedDomains() {
  try {
    const res = await fetch("/api/user/my-domains", { headers: authHeaders() });
    const data = await res.json();
    const countEl = document.getElementById("countMyOwnedDomains");
    const tbody = document.getElementById("permMyDomainsTableBody");
    const empty = document.getElementById("permMyDomainsEmpty");

    if (data.success && Array.isArray(data.domains)) {
      if (countEl) countEl.textContent = data.count;

      if (data.domains.length === 0) {
        if (tbody) tbody.innerHTML = "";
        if (empty) empty.style.display = "block";
        return;
      }

      if (empty) empty.style.display = "none";
      if (tbody) {
        tbody.innerHTML = data.domains.map((d, idx) => `
          <tr>
            <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
            <td><strong style="font-size: 14px; color: #fff; font-family: var(--font-mono);">${d.domain}</strong></td>
            <td><span class="dom-tag lp">${d.primaryFolder || d.templateName || "Landing Page"}</span></td>
            <td><span style="font-size: 12px; color: var(--accent-cyan); word-break: break-all;">${d.currentLink || "-"}</span></td>
            <td><span class="badge-status badge-success" style="font-weight: 700;">🟢 Đang Quản Trị</span></td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 6px; justify-content: flex-end;">
                <button class="btn btn-primary btn-sm" onclick="openEditLinkModal('${d.domain}')" title="Cập nhật link đích">
                  🔗 Đổi Link
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openSwitchTemplateModal('${d.domain}')" title="Gán mẫu Landing Page khác">
                  🎨 Đổi Mẫu
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openSwitchModeModal('${d.domain}')" title="Chuyển sang 302">
                  🔀 302
                </button>
              </div>
            </td>
          </tr>
        `).join("");
      }
    }
  } catch {}
}

async function loadMyRequestsHistory() {
  try {
    const res = await fetch("/api/domain-requests", { headers: authHeaders() });
    const data = await res.json();
    const countEl = document.getElementById("countMyRequests");
    const tbody = document.getElementById("permMyRequestsTableBody");
    const empty = document.getElementById("permMyRequestsEmpty");

    if (data.success && Array.isArray(data.requests)) {
      if (countEl) countEl.textContent = data.count;

      if (data.requests.length === 0) {
        if (tbody) tbody.innerHTML = "";
        if (empty) empty.style.display = "block";
        return;
      }

      if (empty) empty.style.display = "none";
      if (tbody) {
        tbody.innerHTML = data.requests.map((r, idx) => {
          let statusTag = "";
          if (r.status === "approved") {
            statusTag = `<span class="badge-status badge-success" style="font-weight: 700;">🟢 ĐÃ ĐƯỢC DUYỆT</span>`;
          } else if (r.status === "rejected") {
            statusTag = `<span class="badge-status badge-danger" style="font-weight: 700;">🔴 TỪ CHỐI (${r.rejectReason || "Không đạt"})</span>`;
          } else {
            statusTag = `<span class="badge-status badge-warning" style="font-weight: 700;">🟡 CHỜ ADMIN DUYỆT</span>`;
          }

          return `
            <tr>
              <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
              <td style="color: var(--text-muted); font-size: 12px;">${new Date(r.createdAt).toLocaleString("vi-VN")}</td>
              <td><strong style="color: #fff; font-family: var(--font-mono); font-size: 14px;">${r.domain}</strong></td>
              <td style="color: var(--text-dim); font-size: 13px;">${r.note || "Xin cấp quyền quản trị"}</td>
              <td>${statusTag}</td>
              <td style="color: var(--text-muted); font-size: 12px;">${r.resolvedBy ? `👤 ${r.resolvedBy} (${new Date(r.resolvedAt).toLocaleTimeString('vi-VN')})` : "Đang chờ"}</td>
            </tr>
          `;
        }).join("");
      }
    }
  } catch {}
}

async function loadAdminPendingRequests() {
  try {
    const res = await fetch("/api/domain-requests", { headers: authHeaders() });
    const data = await res.json();
    const countEl = document.getElementById("countAdminPendingRequests");
    const badgePerms = document.getElementById("badgePendingPermsCount");
    const pendingTag = document.getElementById("adminPendingCountTag");
    const tbody = document.getElementById("adminRequestsTableBody");
    const empty = document.getElementById("adminRequestsEmpty");

    if (data.success && Array.isArray(data.requests)) {
      const pendingList = data.requests.filter((r) => r.status === "pending");
      const pCount = pendingList.length;

      if (countEl) countEl.textContent = pCount;
      if (pendingTag) pendingTag.textContent = `${pCount} Yêu Cầu Chờ Duyệt`;

      if (badgePerms) {
        badgePerms.textContent = pCount;
        badgePerms.style.display = pCount > 0 ? "inline-block" : "none";
      }

      if (pendingList.length === 0) {
        if (tbody) tbody.innerHTML = "";
        if (empty) empty.style.display = "block";
        return;
      }

      if (empty) empty.style.display = "none";
      if (tbody) {
        tbody.innerHTML = pendingList.map((r, idx) => `
          <tr>
            <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
            <td style="color: var(--text-muted); font-size: 12px;">${new Date(r.createdAt).toLocaleString("vi-VN")}</td>
            <td>
              <strong style="color: var(--accent-cyan); font-weight: 700;">👤 ${r.username}</strong>
              <div style="font-size: 11px; color: var(--text-dim);">${r.fullName || ""}</div>
            </td>
            <td><strong style="color: #fff; font-family: var(--font-mono); font-size: 14px;">${r.domain}</strong></td>
            <td style="color: var(--text-dim); font-size: 13px;">${r.note || "Xin cấp quyền quản trị"}</td>
            <td><span class="badge-status badge-warning" style="font-weight: 700;">🟡 Chờ Duyệt</span></td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 6px; justify-content: flex-end;">
                <button class="btn btn-primary btn-sm" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); font-weight: 700;" onclick="handleAdminApproveRequest('${r.id}')">
                  🟢 Duyệt Cấp Quyền
                </button>
                <button class="btn btn-secondary btn-sm" style="color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.4);" onclick="handleAdminRejectRequest('${r.id}')">
                  🔴 Từ Chối
                </button>
              </div>
            </td>
          </tr>
        `).join("");
      }
    }
  } catch {}
}

async function handleAdminApproveRequest(requestId) {
  try {
    const res = await fetch(`/api/admin/domain-requests/${encodeURIComponent(requestId)}/approve`, {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🎉 ${data.message}`);
      loadAdminPendingRequests();
      loadPermsData();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  }
}

async function handleAdminRejectRequest(requestId) {
  const reason = prompt("Nhập lý do từ chối (tùy chọn):", "Admin từ chối yêu cầu cấp quyền");
  if (reason === null) return;

  try {
    const res = await fetch(`/api/admin/domain-requests/${encodeURIComponent(requestId)}/reject`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🗑️ ${data.message}`);
      loadAdminPendingRequests();
      loadPermsData();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  }
}

async function handleAdminManualAssign() {
  const domain = document.getElementById("adminAssignDomainInput")?.value.trim();
  const userId = document.getElementById("adminAssignUserSelect")?.value;

  if (!domain || !userId) {
    showToast("❌ Vui lòng nhập đầy đủ tên miền và chọn user");
    return;
  }

  try {
    const res = await fetch("/api/admin/domain-permissions/assign", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain, userId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🎉 ${data.message}`);
      document.getElementById("adminAssignDomainInput").value = "";
      loadPermsData();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  }
}

function switchPermSubTab(subTabId) {
  const pills = document.querySelectorAll("#tab-domain-perms .sub-pill");
  pills.forEach((p) => p.classList.remove("active"));

  const views = document.querySelectorAll("#tab-domain-perms .perm-sub-view");
  views.forEach((v) => (v.style.display = "none"));

  if (subTabId === "search") {
    document.getElementById("pillPermSearch")?.classList.add("active");
    const v = document.getElementById("permViewSearch");
    if (v) v.style.display = "block";
    searchPermDomains();
  } else if (subTabId === "my-domains") {
    document.getElementById("pillPermMyDomains")?.classList.add("active");
    const v = document.getElementById("permViewMyDomains");
    if (v) v.style.display = "block";
    loadMyApprovedDomains();
  } else if (subTabId === "my-requests") {
    document.getElementById("pillPermMyRequests")?.classList.add("active");
    const v = document.getElementById("permViewMyRequests");
    if (v) v.style.display = "block";
    loadMyRequestsHistory();
  } else if (subTabId === "admin-approval") {
    document.getElementById("pillPermAdminApproval")?.classList.add("active");
    const v = document.getElementById("permViewAdminApproval");
    if (v) v.style.display = "block";
    loadAdminPendingRequests();
    loadUsersList();
  }
}

// ── DOMAIN PURCHASE ORDERS WORKFLOW & MODALS ─────────────────────────────
let currentPurchaseOrderData = null;

function orderDomainClick(btn, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!btn) return;
  const domain = btn.getAttribute("data-domain") || "";
  const priceXu = Number(btn.getAttribute("data-price")) || 250;
  const ruleApplied = btn.getAttribute("data-rule") || "Quy chuẩn";
  let extra = {};
  try {
    extra = JSON.parse(btn.getAttribute("data-extra") || "{}");
  } catch {}
  // Lấy lại từ form hiện tại (user có thể điền link/mẫu sau khi check giá)
  const formExtra = collectBuyFormExtraFromUi();
  extra = { ...extra, ...formExtra };
  if (!extra.link) {
    showToast("⚠️ Điền link đích trên form trước khi đặt mua");
    return;
  }
  if (extra.deployMode !== "302" && !extra.templateId) {
    showToast("⚠️ Chọn mẫu Landing Page trước khi đặt mua");
    return;
  }
  btn.disabled = true;
  btn.dataset.origLabel = btn.innerHTML;
  btn.innerHTML = "⏳ Đang mở...";
  openConfirmDomainPurchaseModal(domain, priceXu, ruleApplied, extra);
  setTimeout(() => {
    btn.disabled = false;
    if (btn.dataset.origLabel) btn.innerHTML = btn.dataset.origLabel;
  }, 400);
}

function buildOrderDomainButtonHtml({ domain, priceXu = 250, ruleApplied = "Quy chuẩn", extra = {} }) {
  const extraJson = escapeHtmlText(JSON.stringify(extra));
  return `<button type="button" class="btn btn-primary btn-sm js-btn-order-domain" data-domain="${escapeHtmlText(domain)}" data-price="${priceXu}" data-rule="${escapeHtmlText(ruleApplied)}" data-extra="${extraJson}" onclick="orderDomainClick(this, event)" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #000; font-weight: 800; border-color: #f59e0b; min-width: 130px;">🛒 Đặt Mua Ngay</button>`;
}

function openConfirmDomainPurchaseModal(domain, priceXu = 250, ruleApplied = "", extra = {}) {
  const norm = (domain || "").trim().toLowerCase();
  const hiddenInput = document.getElementById("confirmOrderDomainHidden");
  const linkHidden = document.getElementById("confirmOrderLinkHidden");
  const teleHidden = document.getElementById("confirmOrderTeleHidden");
  const tplHidden = document.getElementById("confirmOrderTemplateHidden");
  const modeHidden = document.getElementById("confirmOrderDeployModeHidden");
  const badgeDomain = document.getElementById("confirmOrderDomainBadge");
  const badgePrice = document.getElementById("confirmOrderPriceBadge");
  const badgeRule = document.getElementById("confirmOrderRuleBadge");
  const badgeBalance = document.getElementById("confirmOrderBalanceBadge");
  const summaryEl = document.getElementById("confirmOrderSummaryText");
  const modeBadge = document.getElementById("confirmOrderModeBadge");
  const linkBadge = document.getElementById("confirmOrderLinkBadge");
  const tplBadge = document.getElementById("confirmOrderTemplateBadge");
  const tplRow = document.getElementById("confirmOrderTemplateRow");

  const deployMode = extra.deployMode === "302" ? "302" : "LP";
  const templateId = extra.templateId || "";
  const tpl = templateId ? allTemplates.find((t) => t.id === templateId) : null;

  currentPurchaseOrderData = {
    domain: norm,
    priceXu,
    ruleApplied,
    link: extra.link || "",
    tele: extra.tele || "",
    templateId,
    deployMode,
  };

  if (hiddenInput) hiddenInput.value = norm;
  if (linkHidden) linkHidden.value = extra.link || "";
  if (teleHidden) teleHidden.value = extra.tele || "";
  if (tplHidden) tplHidden.value = templateId;
  if (modeHidden) modeHidden.value = deployMode;
  if (badgeDomain) badgeDomain.textContent = norm;
  if (badgePrice) badgePrice.textContent = `${priceXu} Xu (≈ ${(priceXu).toLocaleString("vi-VN")}k đ)`;
  if (badgeRule) badgeRule.textContent = ruleApplied || "Quy chuẩn định giá";

  const userBalance = currentUser ? (currentUser.balance || 0) : 0;
  if (badgeBalance) badgeBalance.textContent = `🪙 ${userBalance.toLocaleString("vi-VN")} Xu`;

  if (modeBadge) {
    modeBadge.textContent = deployMode === "302" ? "⚡ Trỏ 302 trực tiếp" : "🎨 Landing Page";
  }
  if (linkBadge) linkBadge.textContent = extra.link || "— (chưa có link)";
  if (tplRow) tplRow.style.display = deployMode === "302" ? "none" : "flex";
  if (tplBadge) {
    tplBadge.textContent = deployMode === "302" ? "—" : tpl ? tpl.name || templateId : templateId || "— (chưa chọn mẫu)";
  }

  if (summaryEl) {
    const modeTxt = deployMode === "302" ? "trỏ 302" : "gắn Landing Page";
    summaryEl.innerHTML = `Bạn xác nhận dùng <span style="color: #10b981;">${priceXu.toLocaleString("vi-VN")} Xu</span> đặt mua <span style="color: #fbbf24; font-family: var(--font-mono);">${norm}</span> và ${modeTxt}? Đơn sẽ chờ Admin duyệt.`;
  }

  openModal("confirmDomainPurchaseModal");
}

async function handleConfirmDomainPurchaseSubmit(e) {
  e.preventDefault();
  const domain = document.getElementById("confirmOrderDomainHidden")?.value;
  const btn = document.getElementById("btnSubmitConfirmPurchase");

  if (!domain) {
    showToast("❌ Vui lòng cung cấp tên miền hợp lệ");
    return;
  }

  if (btn) btn.disabled = true;

  closeModal("confirmDomainPurchaseModal");
  startHubProgressWatch({ domain, label: "Đang gửi đơn mua", switchTab: false });

  try {
    const link = document.getElementById("confirmOrderLinkHidden")?.value?.trim() || currentPurchaseOrderData?.link || "";
    const tele = document.getElementById("confirmOrderTeleHidden")?.value?.trim() || currentPurchaseOrderData?.tele || "";
    const templateId = document.getElementById("confirmOrderTemplateHidden")?.value?.trim() || currentPurchaseOrderData?.templateId || "";
    const deployMode = document.getElementById("confirmOrderDeployModeHidden")?.value || currentPurchaseOrderData?.deployMode || "LP";
    const note = `Đặt mua ${domain}`;

    const res = await fetch("/api/domain-orders", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ domain, note, link, tele, templateId, deployMode }),
    });
    const data = await res.json();
    if (data.success) {
      showProcessingToast(data.order?.domain || domain);
      
      const successDom = document.getElementById("successOrderDomainText");
      const successPrice = document.getElementById("successOrderPriceText");
      if (successDom) successDom.textContent = data.order?.domain || domain;
      if (successPrice) successPrice.textContent = `${data.order?.priceXu || 250} Xu (≈ ${(data.order?.priceXu || 250)}k đ)`;

      openModal("domainOrderSuccessModal");
      loadDomainOrdersList();
      loadWalletData();
      startHubProgressWatch({ domain: data.order?.domain || domain, switchTab: true });
    } else {
      showToast(`❌ Lỗi đặt mua: ${data.error}`, "error");
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadDomainOrdersList() {
  try {
    const res = await fetch("/api/domain-orders", { headers: authHeaders() });
    const data = await res.json();
    if (!data.success || !Array.isArray(data.orders)) return;

    const pendingBadge = document.getElementById("badgeOrdersPending");
    if (pendingBadge && isAdminUser()) {
      pendingBadge.textContent = String(data.pendingCount || 0);
      pendingBadge.style.display = data.pendingCount > 0 ? "inline-flex" : "none";
    }

    renderAdminDomainOrdersTable(data.orders);
    renderUserDomainOrdersTable(data.orders);
  } catch {}
}

function renderOrderStatusHtml(o, { adminView = false } = {}) {
  let statusHtml = "";
  let actionHtml = "-";

  if (o.status === "approved") {
    if (o.fulfilledAt) {
      statusHtml = `<span class="badge-status badge-success" style="font-weight: 700;">✅ ĐÃ CÀI XONG</span>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">${new Date(o.fulfilledAt).toLocaleString("vi-VN")}</div>`;
    } else {
      statusHtml = `<span class="badge-status badge-success" style="font-weight: 700;">🟢 ĐÃ DUYỆT (-${o.deductedAmount || o.priceXu} Xu)</span>
        <div style="font-size: 11px; color: #fbbf24; margin-top: 4px;">⏳ Chờ hoàn tất cài đặt</div>`;
      if (adminView) {
        actionHtml = `
          <button class="btn btn-primary btn-sm" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); font-weight: 700; font-size: 11px; padding: 6px 10px;" onclick="handleAdminFulfillDomainOrder('${o.id}')" title="Thử mua Spaceship & cài lại">
            🔄 Cài Lại
          </button>
        `;
      }
    }
  } else if (o.status === "rejected") {
    statusHtml = `<span class="badge-status badge-danger" style="font-weight: 700;">🔴 TỪ CHỐI (${o.rejectReason || "Không đạt"})</span>`;
  } else {
    statusHtml = `<span class="badge-status badge-warning" style="font-weight: 700;">🟡 CHỜ ADMIN DUYỆT</span>`;
    if (adminView) {
      const balanceTag = o.hasEnoughBalance
        ? `<span style="color: #10b981; font-size: 11px; font-weight: 700;">🟢 Đủ Xu (${o.userCurrentBalance} Xu)</span>`
        : `<span style="color: #f43f5e; font-size: 11px; font-weight: 700;">🔴 Thiếu Xu (${o.userCurrentBalance}/${o.priceXu} Xu)</span>`;
      actionHtml = `
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-primary btn-sm" style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); font-weight: 700; font-size: 11px; padding: 4px 8px;" onclick="handleAdminApproveDomainOrder('${o.id}')" title="Duyệt, trừ Xu khách và mua trên Spaceship">
              💳 Duyệt & Mua Spaceship
            </button>
            <button class="btn btn-secondary btn-sm" style="color: var(--accent-rose); border-color: rgba(244,63,94,0.4); font-size: 11px; padding: 4px 8px;" onclick="handleAdminRejectDomainOrder('${o.id}')">
              ❌ Từ Chối
            </button>
          </div>
          ${balanceTag}
        </div>
      `;
    }
  }

  return { statusHtml, actionHtml };
}

function renderAdminDomainOrdersTable(orders) {
  const tbody = document.getElementById("adminDomainOrdersTableBody");
  const empty = document.getElementById("adminDomainOrdersEmpty");
  if (!tbody) return;

  if (!isAdminUser()) {
    if (empty) empty.style.display = "none";
    tbody.innerHTML = "";
    return;
  }

  if (orders.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = orders
    .map((o, idx) => {
      const { statusHtml, actionHtml } = renderOrderStatusHtml(o, { adminView: true });
      const balanceDisplay =
        o.userCurrentBalance !== undefined
          ? `<span style="font-family: var(--font-mono); font-weight: 700; color: ${o.hasEnoughBalance ? "#10b981" : "#f43f5e"};">${o.userCurrentBalance} Xu</span>`
          : "-";
      return `
        <tr>
          <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
          <td style="color: var(--text-muted); font-size: 12px;">${new Date(o.createdAt).toLocaleString("vi-VN")}</td>
          <td>
            <strong style="color: var(--accent-cyan); font-weight: 700;">👤 ${o.username}</strong>
            <div style="font-size: 11px; color: var(--text-dim);">${o.fullName || ""}</div>
          </td>
          <td><strong style="color: #fbbf24; font-family: var(--font-mono); font-size: 14px;">${o.domain}</strong></td>
          <td>
            <strong style="color: #10b981; font-family: var(--font-mono);">${o.priceXu} Xu</strong>
            <div style="font-size: 11px; color: var(--text-dim);">${o.ruleApplied || ""}</div>
            ${o.link ? `<div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">🔗 ${o.link.slice(0, 40)}${o.link.length > 40 ? "…" : ""}</div>` : ""}
            ${o.templateId ? `<div style="font-size: 10px; color: var(--text-dim);">🎨 ${o.templateId}</div>` : ""}
            ${o.deployMode === "302" ? `<div style="font-size: 10px; color: #38bdf8;">⚡ 302</div>` : ""}
          </td>
          <td>${balanceDisplay}</td>
          <td style="color: var(--text-dim); font-size: 13px;">${o.note || "-"}</td>
          <td>${statusHtml}</td>
          <td style="text-align: right;">${actionHtml}</td>
        </tr>
      `;
    })
    .join("");
}

function renderUserDomainOrdersTable(orders) {
  const tbody = document.getElementById("userDomainOrdersTableBody");
  const empty = document.getElementById("userDomainOrdersEmpty");
  const panel = document.getElementById("userDomainOrdersPanel");
  if (!tbody) return;

  if (panel) panel.style.display = isAdminUser() ? "none" : "block";

  const myOrders = isAdminUser() ? [] : orders;

  if (myOrders.length === 0) {
    tbody.innerHTML = "";
    if (empty) empty.style.display = isAdminUser() ? "none" : "block";
    return;
  }
  if (empty) empty.style.display = "none";

  tbody.innerHTML = myOrders
    .map((o, idx) => {
      const { statusHtml } = renderOrderStatusHtml(o, { adminView: false });
      return `
        <tr>
          <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
          <td style="color: var(--text-muted); font-size: 12px;">${new Date(o.createdAt).toLocaleString("vi-VN")}</td>
          <td><strong style="color: #fbbf24; font-family: var(--font-mono);">${o.domain}</strong></td>
          <td><strong style="color: #10b981; font-family: var(--font-mono);">${o.priceXu} Xu</strong></td>
          <td style="color: var(--text-dim); font-size: 13px;">${o.note || "-"}</td>
          <td>${statusHtml}</td>
        </tr>
      `;
    })
    .join("");
}

async function handleAdminApproveDomainOrder(orderId) {
  if (!isAdminUser()) return;

  try {
    const listRes = await fetch("/api/domain-orders", { headers: authHeaders() });
    const listData = await listRes.json();
    const order = (listData.orders || []).find((o) => o.id === orderId);
    if (!order) {
      showToast("❌ Không tìm thấy đơn hàng");
      return;
    }
    if (order.status !== "pending") {
      showToast("❌ Đơn không còn ở trạng thái chờ duyệt");
      return;
    }
    if (!order.hasEnoughBalance) {
      showToast(`❌ User thiếu Xu (${order.userCurrentBalance}/${order.priceXu})`, "error");
      return;
    }

    let link = (order.link || "").trim();
    let tele = (order.tele || "").trim();
    let templateId = (order.templateId || "").trim();
    const deployMode = order.deployMode === "302" ? "302" : "LP";

    if (!link) {
      link = prompt(`Nhập link đích cho ${order.domain}:`, "")?.trim() || "";
      if (!link) return;
    }
    if (deployMode !== "302" && !templateId) {
      if (allTemplates && allTemplates.length > 0) {
        templateId = allTemplates[0].id;
        const pick = confirm(`Đơn chưa có mẫu LP. Dùng mẫu "${allTemplates[0].name}"?\n\nCancel để hủy.`);
        if (!pick) return;
      } else {
        templateId = prompt(`Nhập templateId cho LP:`, "")?.trim() || "";
        if (!templateId) return;
      }
    }

    const quote = await fetchSpaceshipQuote(order.domain);
    if (!quote.canPurchase) {
      showToast(`❌ ${quote.message || "Không mua được trên Spaceship"}`, "error");
      return;
    }
    const confirmed = await openSpaceshipBuyConfirmModal(quote);
    if (!confirmed) {
      showToast("Đã hủy — chưa trừ tiền Spaceship.", "info");
      return;
    }

    const approveRes = await fetch(`/api/admin/domain-orders/${encodeURIComponent(orderId)}/approve`, {
      method: "POST",
      headers: authHeaders(),
    });
    const approveData = await approveRes.json();
    if (!approveData.success) {
      showToast(`❌ Duyệt đơn thất bại: ${approveData.error}`, "error");
      return;
    }

    showToast(`✅ Đã duyệt & trừ ${approveData.deductedAmount || order.priceXu} Xu — đang mua Spaceship & cài...`, "success");
    loadDomainOrdersList();
    loadWalletData();

    await executeDeployFlow({
      domain: order.domain,
      link,
      tele,
      templateId,
      isBuy: true,
      type: deployMode === "302" ? "302" : "lp",
      targetUserId: order.userId,
      orderId: order.id,
      spaceshipBuyConfirmed: true,
      quotedTotalUsd: quote.totalUsd,
    });

    setTimeout(() => loadDomainOrdersList(), 3000);
  } catch (err) {
    showToast(`❌ ${err.message}`, "error");
  }
}

async function handleAdminRejectDomainOrder(orderId) {
  const reason = prompt("Nhập lý do từ chối (tùy chọn):", "Admin từ chối đơn đặt mua");
  if (reason === null) return;

  try {
    const res = await fetch(`/api/admin/domain-orders/${encodeURIComponent(orderId)}/reject`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🗑️ ${data.message}`);
      loadDomainOrdersList();
    } else {
      showToast(`❌ Lỗi: ${data.error}`);
    }
  } catch (err) {
    showToast(`❌ Lỗi kết nối: ${err.message}`);
  }
}

async function handleAdminFulfillDomainOrder(orderId) {
  if (!currentUser || currentUser.role !== "admin") return;

  try {
    const res = await fetch("/api/domain-orders", { headers: authHeaders() });
    const data = await res.json();
    const order = (data.orders || []).find((o) => o.id === orderId);
    if (!order) {
      showToast("❌ Không tìm thấy đơn hàng");
      return;
    }
    if (order.status !== "approved") {
      showToast("❌ Chỉ fulfill đơn đã duyệt");
      return;
    }
    if (order.fulfilledAt) {
      showToast("ℹ️ Đơn này đã cài xong rồi");
      return;
    }

    let link = (order.link || "").trim();
    let tele = (order.tele || "").trim();
    let templateId = (order.templateId || "").trim();
    const deployMode = order.deployMode === "302" ? "302" : "LP";

    if (!link) {
      link = prompt(`Nhập link đích cho ${order.domain}:`, "")?.trim() || "";
      if (!link) return;
    }

    if (deployMode !== "302" && !templateId) {
      if (allTemplates && allTemplates.length > 0) {
        templateId = allTemplates[0].id;
        const pick = confirm(`Đơn chưa có mẫu LP. Dùng mẫu mặc định "${allTemplates[0].name}"?\n\nBấm Cancel để hủy và chọn mẫu thủ công trên tab Mua.`);
        if (!pick) return;
      } else {
        templateId = prompt(`Nhập templateId cho LP (${order.domain}):`, "")?.trim() || "";
        if (!templateId) return;
      }
    }

    if (!confirm(`Mua hộ & cài ${order.domain} cho ${order.username}?\n\nSpaceship sẽ tính phí USD (Admin thanh toán). Xu khách đã trừ khi duyệt.`)) {
      return;
    }

    await executeDeployFlow({
      domain: order.domain,
      link,
      tele,
      templateId,
      isBuy: true,
      type: deployMode === "302" ? "302" : "lp",
      targetUserId: order.userId,
      orderId: order.id,
    });

    setTimeout(() => loadDomainOrdersList(), 3000);
  } catch (err) {
    showToast(`❌ ${err.message}`, "error");
  }
}

function goToDomainOrdersHistory() {
  closeModal("domainOrderSuccessModal");
  if (isAdminUser()) {
    switchToTab("tab-orders");
  } else {
    switchToTab("tab-wallet");
  }
  loadDomainOrdersList();
}

// Expose all functions to global window for inline onclick and HTML event handlers
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
window.showProcessingToast = showProcessingToast;
window.showActionResultPopup = showActionResultPopup;
window.copyActionResultDomain = copyActionResultDomain;
window.copyActionResultLink = copyActionResultLink;
window.copyActionResultTele = copyActionResultTele;
window.openEditLinkModal = openEditLinkModal;
window.openSwitchTemplateModal = openSwitchTemplateModal;
window.openSwitchModeModal = openSwitchModeModal;
window.openQuickDeployModal = openQuickDeployModal;
window.openBatchSetLinkModal = openBatchSetLinkModal;
window.copyText = copyText;
window.goToHistoryFromReadyModal = goToHistoryFromReadyModal;
window.goToTasksFromProcessingModal = goToTasksFromProcessingModal;
window.goToHistoryFromProcessingModal = goToHistoryFromProcessingModal;
window.openVisualTemplatePicker = openVisualTemplatePicker;
window.openConfirmSelectTemplateModal = openConfirmSelectTemplateModal;
window.openPreviewModal = openPreviewModal;
window.handleLogout = handleLogout;
window.switchToTab = switchToTab;
window.toggleSwitchModeFields = toggleSwitchModeFields;
window.handleSwitchModeSubmit = handleSwitchModeSubmit;

// Domain permissions globals
window.loadPermsData = loadPermsData;
window.searchPermDomains = searchPermDomains;
window.openRequestDomainModal = openRequestDomainModal;
window.handleRequestDomainSubmit = handleRequestDomainSubmit;
window.switchPermSubTab = switchPermSubTab;
window.handleAdminApproveRequest = handleAdminApproveRequest;
window.handleAdminRejectRequest = handleAdminRejectRequest;
window.handleAdminManualAssign = handleAdminManualAssign;

// Domain Purchase Orders globals
window.openConfirmDomainPurchaseModal = openConfirmDomainPurchaseModal;
window.orderDomainClick = orderDomainClick;
window.runBatchDomainCheck = runBatchDomainCheck;
window.loadSampleBatchCheckDomains = loadSampleBatchCheckDomains;
window.clearBatchDomainCheck = clearBatchDomainCheck;
window.closeSpaceshipBuyConfirmModal = closeSpaceshipBuyConfirmModal;

document.getElementById("btnConfirmSpaceshipBuy")?.addEventListener("click", () => {
  closeSpaceshipBuyConfirmModal(true);
});
window.handleConfirmDomainPurchaseSubmit = handleConfirmDomainPurchaseSubmit;
window.loadDomainOrdersList = loadDomainOrdersList;
window.handleAdminApproveDomainOrder = handleAdminApproveDomainOrder;
window.handleAdminRejectDomainOrder = handleAdminRejectDomainOrder;
window.handleAdminFulfillDomainOrder = handleAdminFulfillDomainOrder;
window.goToDomainOrdersHistory = goToDomainOrdersHistory;




