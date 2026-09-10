import fs from "node:fs";
import path from "node:path";
import { config, requireEnv } from "./config.js";
import { checkDomainAvailability, registerDomain, resolveContactId, updateNameservers, getDomainInfo } from "./spaceship.js";
import {
  setupCloudflare,
  findZoneByName,
  updateOrCreatePageRule,
  setupDirect302Redirect,
  deleteForwardingPageRules,
  findActiveForwardingRule,
  removeDomainFromAllPagesProjects,
} from "./cloudflare.js";
import { listTemplates, getTemplate, findTemplateByDomain, updateTemplateDomainsJson } from "./templates.js";
import { normalizeDomain, normalizeUrl } from "./utils.js";
import { onTemplateSelected } from "./server.js";
import { findDomainInRepos, checkDomainCfAccount, updateDomainInExactRepos, smartSetLink } from "./repo-scanner.js";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8627043997:AAHAsnjHEXYum3XqbV4eKC5Fc3_knN5S63s";
const API_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const WEB_HUB_URL = process.env.WEB_HUB_URL || "http://localhost:3000";

// Lắng nghe sự kiện người dùng chọn mẫu trên Web Dashboard
onTemplateSelected(async (data) => {
  const { templateId, templateName, templateTitle, cnameTarget, chatId, sessionId, domain } = data;
  console.log(`📡 [Telegram Bot] Nhận sự kiện chọn mẫu từ Web: ${templateName} (ChatId: ${chatId})`);

  if (chatId) {
    const session = userSessions.get(chatId) || userSessions.get(parseInt(chatId, 10)) || {};
    session.selectedTpl = templateId;
    session.templateName = templateName;

    // Nếu đã có sẵn domain & link trong session
    if (session.domain && session.link) {
      const isBuy = session.action === "buy";
      userSessions.delete(chatId);
      const startMsg = await sendMessage(
        chatId,
        `⏳ Đang bắt đầu cài đặt mẫu <b>${templateName}</b> cho <b>${session.domain}</b>...`
      );
      await executeDeployFlow(chatId, startMsg.result.message_id, session.domain, session.link, templateId, isBuy);
      return;
    }

    // Nếu chưa có domain, lưu template vào session và hướng dẫn nhập domain
    userSessions.set(chatId, { ...session, state: "WAIT_BUY_DOMAIN", selectedTpl: templateId });
    userSessions.set(parseInt(chatId, 10), { ...session, state: "WAIT_BUY_DOMAIN", selectedTpl: templateId });

    await sendMessage(
      chatId,
      `🎯 <b>BẠN VỪA CHỌN MẪU TỪ WEB DASHBOARD THÀNH CÔNG!</b>\n\n` +
      `🎨 <b>Mẫu đã chọn:</b> <b>${templateTitle || templateName}</b>\n` +
      `⚡ <b>CNAME Target:</b> <code>${cnameTarget}</code>\n\n` +
      `✍️ <b>Bước tiếp theo:</b> Nhập tên miền bạn muốn mua / trỏ (ví dụ: <code>gg88top.live</code>):`
    );
  }
});

function isValidPublicUrl(url) {
  if (!url || typeof url !== "string") return false;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  if (url.includes("localhost") || url.includes("127.0.0.1")) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

// Trạng thái hội thoại tương tác (Interactive Conversation State)
const userSessions = new Map();

async function tgRequest(method, body = {}) {
  try {
    const res = await fetch(`${API_URL}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`❌ [Telegram API] ${method} thất bại:`, data.description, JSON.stringify(body));
    }
    return data;
  } catch (err) {
    console.error(`❌ [Telegram API Error] ${method}:`, err.message);
    return { ok: false, description: err.message };
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return tgRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return tgRequest("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

async function deleteMessage(chatId, messageId) {
  return tgRequest("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

// Cache Telegram photo file_id vào ổ cứng vĩnh viễn để đổi ảnh tức thì (0.01s Instant Carousel)
const CACHE_FILE = path.join("C:\\FREZE-PRJ\\web-tên-miền\\screenshots", "telegram_file_ids.json");
const photoFileIdCache = new Map();

function loadFileIdCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      for (const [k, v] of Object.entries(data)) {
        photoFileIdCache.set(k, v);
      }
      console.log(`⚡ Đã nạp ${photoFileIdCache.size} photo file_id từ cache.`);
    } catch {}
  }
}

function saveFileIdCache() {
  try {
    const obj = Object.fromEntries(photoFileIdCache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch {}
}

loadFileIdCache();

async function editMessageMedia(chatId, messageId, mediaObject, replyMarkup = null) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    media: mediaObject,
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  return tgRequest("editMessageMedia", body);
}

async function editMessageMediaWithUpload(chatId, messageId, filePath, caption, replyMarkup = null) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("message_id", messageId);
  form.append(
    "media",
    JSON.stringify({
      type: "photo",
      media: `attach://${path.basename(filePath)}`,
      caption: caption,
      parse_mode: "HTML",
    }),
  );
  if (replyMarkup) {
    form.append(
      "reply_markup",
      typeof replyMarkup === "string" ? replyMarkup : JSON.stringify(replyMarkup),
    );
  }
  const fileContent = fs.readFileSync(filePath);
  const blob = new Blob([fileContent], { type: "image/png" });
  form.append(path.basename(filePath), blob, path.basename(filePath));

  const res = await fetch(`${API_URL}/editMessageMedia`, {
    method: "POST",
    body: form,
  });
  return res.json();
}

async function sendPhoto(chatId, filePath, caption = "", replyMarkup = null) {
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  if (replyMarkup) {
    form.append(
      "reply_markup",
      typeof replyMarkup === "string" ? replyMarkup : JSON.stringify(replyMarkup),
    );
  }
  const fileContent = fs.readFileSync(filePath);
  const blob = new Blob([fileContent], { type: "image/png" });
  form.append("photo", blob, path.basename(filePath));

  const res = await fetch(`${API_URL}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  return res.json();
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  return tgRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

// ── Bàn phím điều khiển chính ──
const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: "🎨 Mua & Gán Landing Page" }, { text: "⚡ Mua & Trỏ 302 Trực Tiếp" }],
      [{ text: "🌐 Mở Web Chọn Mẫu Trực Quan" }, { text: "🖼️ Xem Ảnh Từng Mẫu" }],
      [{ text: "⚡ Trỏ 302 Miền Có Sẵn" }, { text: "⚡ Trỏ Miền Có Sẵn ➔ LP" }],
      [{ text: "🔗 Cập Nhật Link" }, { text: "🔍 Check Giá Miền" }],
    ],
    resize_keyboard: true,
  },
};

// ── Hàm gửi / đổi ảnh Preview mượt mà tức thì (Zero-Lag Carousel) ──
async function sendTemplatePreview(chatId, index = 0, messageId = null) {
  const templates = listTemplates();
  const total = templates.length;
  const currentIdx = ((index % total) + total) % total;
  const tpl = templates[currentIdx];

  const caption =
    `🎨 <b>MẪU GIAO DIỆN [${currentIdx + 1}/${total}]:</b>\n\n` +
    `🏷️ <b>Thương hiệu:</b> <b>[${tpl.brandLabel || tpl.brand || "KHÁC"}]</b>\n` +
    `⭐ <b>Tên mẫu:</b> <b>${tpl.name}</b>\n` +
    `📑 <b>Mô tả:</b> <i>${tpl.title}</i>\n` +
    `⚡ <b>CNAME:</b> <code>${tpl.cnameTarget}</code>\n\n` +
    `💡 <i>Dùng các nút bên dưới để duyệt xem mẫu hoặc mở Web Hub để lọc theo trang!</i>`;

  const prevIdx = (currentIdx - 1 + total) % total;
  const nextIdx = (currentIdx + 1) % total;

  const inline_keyboard = [
    [
      { text: "⬅️ Trước", callback_data: `pv:${prevIdx}` },
      { text: `📌 Chọn Mẫu Này ✅`, callback_data: `pick_pv:${tpl.id}` },
      { text: "Tiếp ➡️", callback_data: `pv:${nextIdx}` },
    ],
  ];

  const row2 = [];
  if (isValidPublicUrl(WEB_HUB_URL)) {
    row2.push({ text: `🌐 Mở Web Hub Đầy Đủ`, url: `${WEB_HUB_URL}?chatId=${chatId}` });
  }
  if (isValidPublicUrl(tpl.sampleUrl)) {
    row2.push({ text: `🔗 Live Demo`, url: tpl.sampleUrl });
  }
  if (row2.length > 0) {
    inline_keyboard.push(row2);
  }

  inline_keyboard.push([
    { text: `📋 Xem Danh Sách Tất Cả Mẫu`, callback_data: `list_all_tpls` },
  ]);

  const screenshotFile = path.join("C:\\FREZE-PRJ\\web-tên-miền\\screenshots", `${tpl.id}.png`);

  // Nếu đang duyệt Carousel trên tin nhắn cũ (messageId có sẵn)
  if (messageId) {
    if (photoFileIdCache.has(tpl.id)) {
      const cachedFileId = photoFileIdCache.get(tpl.id);
      return editMessageMedia(
        chatId,
        messageId,
        {
          type: "photo",
          media: cachedFileId,
          caption,
          parse_mode: "HTML",
        },
        { inline_keyboard },
      );
    } else if (fs.existsSync(screenshotFile)) {
      const editRes = await editMessageMediaWithUpload(
        chatId,
        messageId,
        screenshotFile,
        caption,
        { inline_keyboard },
      );
      if (editRes.ok && editRes.result?.photo) {
        const fileId = editRes.result.photo.slice(-1)[0].file_id;
        photoFileIdCache.set(tpl.id, fileId);
        saveFileIdCache();
      }
      return editRes;
    }
  }

  // Nếu là mở mới Carousel lần đầu
  if (fs.existsSync(screenshotFile)) {
    const sendRes = await sendPhoto(chatId, screenshotFile, caption, { inline_keyboard });
    if (sendRes.ok && sendRes.result?.photo) {
      const fileId = sendRes.result.photo.slice(-1)[0].file_id;
      photoFileIdCache.set(tpl.id, fileId);
      saveFileIdCache();
    }
    return sendRes;
  } else {
    return sendMessage(chatId, caption, { reply_markup: { inline_keyboard } });
  }
}

// ── Tạo Inline Keyboard chọn Template ──
function makeTemplateKeyboard(chatId = null) {
  const templates = listTemplates();
  const inline_keyboard = [];

  const topRow = [
    { text: "🖼️ Duyệt Ảnh Từng Mẫu (Carousel)", callback_data: "pv:0" },
  ];

  if (chatId && isValidPublicUrl(WEB_HUB_URL)) {
    topRow.unshift({
      text: "🌐 Mở Web Hub Trực Quan",
      url: `${WEB_HUB_URL}?chatId=${chatId}`,
    });
  }

  inline_keyboard.push(topRow);

  // Hiển thị danh sách mẫu (tối đa 14 mẫu phổ biến nhất để tránh quá tải tin nhắn)
  const displayTpls = templates.slice(0, 14);
  for (let i = 0; i < displayTpls.length; i += 2) {
    const row = [];
    const t1 = displayTpls[i];
    const brandTag1 = t1.brand ? `[${t1.brand}] ` : "";
    const label1 = (brandTag1 + (t1.name || t1.title || t1.folder)).slice(0, 24);
    row.push({
      text: `🎨 ${label1}`,
      callback_data: `tpl:${t1.id}`,
    });
    if (i + 1 < displayTpls.length) {
      const t2 = displayTpls[i + 1];
      const brandTag2 = t2.brand ? `[${t2.brand}] ` : "";
      const label2 = (brandTag2 + (t2.name || t2.title || t2.folder)).slice(0, 24);
      row.push({
        text: `🎨 ${label2}`,
        callback_data: `tpl:${t2.id}`,
      });
    }
    inline_keyboard.push(row);
  }

  if (templates.length > 14) {
    if (isValidPublicUrl(WEB_HUB_URL)) {
      inline_keyboard.push([
        { text: `📑 Xem thêm ${templates.length - 14} mẫu khác trên Web ➔`, url: `${WEB_HUB_URL}?chatId=${chatId || ""}` },
      ]);
    } else {
      inline_keyboard.push([
        { text: `📑 Xem danh sách đầy đủ ${templates.length} mẫu ➔`, callback_data: "list_all_tpls" },
      ]);
    }
  }

  inline_keyboard.push([
    { text: "❌ Huỷ Bỏ", callback_data: "cancel" },
  ]);

  return { inline_keyboard };
}

// ── Xử lý Lệnh Check ──
async function handleCheck(chatId, domainInput) {
  if (!domainInput) {
    return sendMessage(chatId, "⚠️ Vui lòng nhập tên miền cần kiểm tra.\nVí dụ: <code>/check gg88vip.top</code>");
  }

  const domain = normalizeDomain(domainInput);
  const msg = await sendMessage(chatId, `🔍 Đang kiểm tra tên miền <b>${domain}</b>...`);

  try {
    const [info, cfInfo, zone] = await Promise.all([
      checkDomainAvailability(domain).catch(() => ({ result: "unknown" })),
      checkDomainCfAccount(domain).catch(() => ({ accountName: "Chưa rõ" })),
      findZoneByName(domain).catch(() => null),
    ]);

    let activeRule = null;
    if (zone) {
      activeRule = await findActiveForwardingRule(zone.id);
    }

    const repoMatches = findDomainInRepos(domain);

    if (info.result === "available") {
      const price = info.premiumPricing?.[0]?.price || "1.5 - 3.0";
      const currency = info.premiumPricing?.[0]?.currency || "USD";
      await editMessage(
        chatId,
        msg.result.message_id,
        `✅ Tên miền: <b>${domain}</b>\n` +
        `📊 Trạng thái: <b>CÒN TRỐNG (Có thể mua ngay)</b>\n` +
        `💵 Giá đăng ký: <b>${price} ${currency}</b>\n\n` +
        `👉 <i>Bấm lệnh dưới để mua & kích hoạt ngay:</i>\n` +
        `• <b>Mua Dùng Landing Page:</b>\n<code>/buy ${domain} https://link-dich-cua-ban.com</code>\n` +
        `• <b>Mua Trỏ 302 Trực Tiếp:</b>\n<code>/buy302 ${domain} https://link-dich-cua-ban.com</code>`
      );
    } else {
      let configStatusText = "";
      if (repoMatches.length > 0) {
        const repoList = repoMatches.map((m) => `• 📁 <code>${m.folderPath}</code>\n  🔗 Link hiện tại: <code>${m.config?.main_url || m.config?.url || "N/A"}</code>`).join("\n");
        configStatusText =
          `🎨 <b>Loại cấu hình:</b> <b>Landing Page (Mã nguồn Repos)</b>\n` +
          `📂 <b>Vị trí trong mã nguồn:</b>\n${repoList}\n`;
      } else if (activeRule) {
        configStatusText =
          `⚡ <b>Loại cấu hình:</b> <b>Chuyển hướng 302 Trực Tiếp (Cloudflare Page Rules)</b>\n` +
          `🎯 <b>Link đích 302:</b> <code>${activeRule.targetUrl}</code>\n` +
          `ℹ️ <i>Chưa có trong mã nguồn Landing Page.</i>\n`;
      } else {
        configStatusText = `⚠️ <b>Loại cấu hình:</b> Chưa cấu hình Landing Page hoặc 302.\n`;
      }

      await editMessage(
        chatId,
        msg.result.message_id,
        `ℹ️ <b>THÔNG TIN TÊN MIỀN:</b> <code>${domain}</code>\n\n` +
        `🏢 <b>Tài khoản Cloudflare:</b> <b>${cfInfo.accountName}</b>\n` +
        configStatusText + "\n" +
        `💡 <b>CÁC THAO TÁC KHẢ DỤNG:</b>\n` +
        `• <b>Đổi Link Đích:</b> <code>/setlink ${domain} https://link_moi.com</code>\n` +
        `• <b>Gán / Đổi Mẫu Landing Page (Tự tắt 302 nếu có):</b>\n<code>/add ${domain} https://link_moi.com</code>\n` +
        `• <b>Chuyển Sang Trỏ 302:</b>\n<code>/add302 ${domain} https://link_moi.com</code>`
      );
    }
  } catch (err) {
    await editMessage(chatId, msg.result.message_id, `❌ Lỗi khi kiểm tra: ${err.message}`);
  }
}

// ── Thực thi Quy trình Mua / Trỏ Full Flow ──
async function executeDeployFlow(chatId, messageId, domain, link, templateId, isBuy = true) {
  const template = getTemplate(templateId);
  const steps = [
    `🚀 <b>Cài đặt tên miền:</b> <a href="https://${domain}"><b>${domain}</b></a>`,
    `🎯 <b>Link chuyển hướng:</b> <a href="${link}">${link}</a>`,
    `🎨 <b>Giao diện:</b> <b>${template.name}</b>`,
    `────────────────────`,
  ];

  const updateStatus = async (stepText) => {
    steps.push(stepText);
    await editMessage(chatId, messageId, steps.join("\n"));
  };

  try {
    // Bước 1: Mua miền nếu cần
    if (isBuy) {
      await updateStatus(`⏳ <b>1/4.</b> Đang đăng ký tên miền...`);
      const availability = await checkDomainAvailability(domain);
      
      const contactId = await resolveContactId();
      await registerDomain(domain, contactId);
      steps[steps.length - 1] = `✅ <b>1/3.</b> Đăng ký tên miền thành công!`;
      await editMessage(chatId, messageId, steps.join("\n"));
    } else {
      steps.push(`⏩ <b>1/3.</b> Xác nhận tên miền có sẵn.`);
      await editMessage(chatId, messageId, steps.join("\n"));
    }

    // Bước 2: Cập nhật Nameservers & Gắn Cloudflare Pages
    await updateStatus(`⏳ <b>2/3.</b> Đang kết nối Cloudflare Nameservers & Pages...`);
    const zone = await getOrCreateZone(domain);
    const nameservers = getZoneNameservers(zone);
    if (nameservers) {
      await updateNameservers(domain, nameservers).catch(() => {});
    }
    await deleteForwardingPageRules(zone.id).catch(() => {});
    if (template.pagesProject) {
      await addPagesDomain(domain, template.pagesProject, template.path).catch(() => {});
    }
    steps[steps.length - 1] = `✅ <b>2/3.</b> Kết nối Cloudflare & Pages thành công!`;
    await editMessage(chatId, messageId, steps.join("\n"));

    // Bước 3: Đồng bộ link chuyển hướng & Deploy
    await updateStatus(`⏳ <b>3/3.</b> Đang đồng bộ link đích & Deploy...`);
    await updateTemplateDomainsJson(template, domain, link);
    steps[steps.length - 1] = `✅ <b>3/3.</b> Đồng bộ cấu hình & Deploy thành công!`;
    await editMessage(chatId, messageId, steps.join("\n"));

    // Hoàn tất
    steps.push(`────────────────────`);
    steps.push(`🎉 <b>CÀI ĐẶT HOÀN TẤT THÀNH CÔNG!</b>`);
    steps.push(`🌐 Website: <a href="https://${domain}"><b>https://${domain}</b></a>`);
    steps.push(`⚡ <i>Trạng thái: Website đã sẵn sàng hoạt động!</i>`);

    await editMessage(chatId, messageId, steps.join("\n"));
  } catch (err) {
    steps.push(`────────────────────`);
    steps.push(`❌ <b>Lỗi:</b> ${err.message}`);
    await editMessage(chatId, messageId, steps.join("\n"));
  }
}

// ── Thực thi Quy trình Mua / Trỏ 302 Trực Tiếp (Direct 302) ──
async function execute302DeployFlow(chatId, messageId, domain, link, isBuy = true) {
  const steps = [
    `⚡ <b>${isBuy ? "Mua & Trỏ" : "Trỏ"} 302 Trực Tiếp:</b> <a href="https://${domain}"><b>${domain}</b></a>`,
    `🎯 <b>Link chuyển hướng:</b> <a href="${link}">${link}</a>`,
    `⚙️ <b>Cấu hình:</b> Cloudflare Page Rules (Direct 302)`,
    `────────────────────`,
  ];

  const updateStatus = async (stepText) => {
    steps.push(stepText);
    await editMessage(chatId, messageId, steps.join("\n"));
  };

  try {
    // Bước 1: Mua miền nếu cần
    if (isBuy) {
      await updateStatus(`⏳ <b>1/3.</b> Đang kiểm tra & đăng ký tên miền trên Spaceship...`);
      const availability = await checkDomainAvailability(domain);

      if (availability.result === "available") {
        const contactId = await resolveContactId();
        await registerDomain(domain, contactId);
        steps[steps.length - 1] = `✅ <b>1/3.</b> Đăng ký tên miền thành công trên Spaceship!`;
      } else {
        try {
          await getDomainInfo(domain);
          steps[steps.length - 1] = `ℹ️ <b>1/3.</b> Tên miền đã thuộc quyền sở hữu của bạn.`;
        } catch {
          throw new Error(`Tên miền hiện không khả dụng để mua (${availability.result})`);
        }
      }
      await editMessage(chatId, messageId, steps.join("\n"));
    } else {
      steps.push(`⏩ <b>1/3.</b> Sử dụng tên miền có sẵn.`);
      await editMessage(chatId, messageId, steps.join("\n"));
    }

    // Dọn dẹp repo Landing Page cũ nếu có
    const existingMatches = findDomainInRepos(domain);
    for (const m of existingMatches) {
      await removeDomainFromRepo(domain, m.filePath).catch(() => {});
    }
    await removeDomainFromAllPagesProjects(domain).catch(() => {});

    // Bước 2: Tạo Zone & Cập nhật Nameservers
    await updateStatus(`⏳ <b>2/3.</b> Đang kết nối DNS Cloudflare...`);
    const cf = await setupDirect302Redirect(domain, link);
    if (cf.nameservers) {
      await updateNameservers(domain, cf.nameservers).catch(() => {});
    }
    steps[steps.length - 1] = `✅ <b>2/3.</b> Cấu hình DNS Cloudflare hoàn tất!`;
    await editMessage(chatId, messageId, steps.join("\n"));

    // Bước 3: Kích hoạt Page Rule 302
    await updateStatus(`⏳ <b>3/3.</b> Đang kích hoạt chuyển hướng 302 tức thì...`);
    steps[steps.length - 1] = `✅ <b>3/3.</b> Quy tắc chuyển hướng 302 đã kích hoạt!`;
    await editMessage(chatId, messageId, steps.join("\n"));

    // Hoàn tất
    steps.push(`────────────────────`);
    steps.push(`🎉 <b>CÀI ĐẶT TRỎ 302 HOÀN TẤT THÀNH CÔNG!</b>`);
    steps.push(`🌐 Website: <a href="https://${domain}"><b>https://${domain}</b></a>`);
    steps.push(`🎯 Chuyển hướng tới: <code>${link}</code>`);
    steps.push(`⚡ <i>Trạng thái: Tên miền sẽ tự động chuyển hướng 302 ngay khi truy cập!</i>`);

    await editMessage(chatId, messageId, steps.join("\n"));
  } catch (err) {
    steps.push(`────────────────────`);
    steps.push(`❌ <b>Lỗi:</b> ${err.message}`);
    await editMessage(chatId, messageId, steps.join("\n"));
  }
}

// ── Xử lý Tin Nhắn Đến (Incoming Messages) ──
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const userId = msg.from?.id;

  if (!text) return;

  // Lệnh /start & /help
  if (text === "/start" || text === "/help" || text === "ℹ️ Trạng Thái Hệ Thống") {
    userSessions.delete(userId);
    const welcome = `🤖 <b>HỆ THỐNG QUẢN TRỊ TÊN MIỀN TỰ ĐỘNG</b>\n\n` +
      `Hệ thống giúp bạn mua tên miền và kích hoạt Landing Page hoặc Trỏ 302 hoàn toàn tự động chỉ sau 1 phút!\n\n` +
      `📌 <b>CÁC CHỨC NĂNG CHÍNH:</b>\n` +
      `• <b>🎨 Mua & Gán Landing Page:</b> Đăng ký miền và gắn giao diện LP\n` +
      `• <b>⚡ Mua & Trỏ 302 Trực Tiếp:</b> Đăng ký miền và trỏ 302 ngay\n` +
      `• <b>⚡ Trỏ 302 Miền Có Sẵn:</b> Trỏ 302 cho miền đã có\n` +
      `• <b>⚡ Trỏ Miền Có Sẵn ➔ LP:</b> Gắn giao diện LP cho miền đã có\n` +
      `• <b>🔗 Cập Nhật Link:</b> Đổi link đích chuyển hướng nhanh chóng\n` +
      `• <b>🖼️ Xem Mẫu:</b> Xem ảnh chụp thực tế các mẫu giao diện\n\n` +
      `<i>👉 Bấm vào các nút menu bên dưới để thực hiện!</i>`;
    return sendMessage(chatId, welcome, MAIN_KEYBOARD);
  }

  // Nút: Mua & Gán Landing Page
  if (text === "🎨 Mua & Gán Landing Page" || text === "🚀 Mua & Trỏ Miền Tự Động") {
    userSessions.set(userId, { state: "WAIT_BUY_LP_DOMAIN" });
    return sendMessage(chatId, "🎨 <b>[MUA DÙNG LANDING PAGE]</b>\n\n✍️ <b>Bước 1:</b> Nhập tên miền bạn muốn mua (ví dụ: <code>gg88top.live</code>):");
  }

  // Nút: Mua & Trỏ 302 Trực Tiếp
  if (text === "⚡ Mua & Trỏ 302 Trực Tiếp") {
    userSessions.set(userId, { state: "WAIT_BUY_302_DOMAIN" });
    return sendMessage(chatId, "⚡ <b>[MUA TRỎ 302 TRỰC TIẾP]</b>\n\n✍️ <b>Bước 1:</b> Nhập tên miền bạn muốn mua (ví dụ: <code>gg88win.top</code>):");
  }

  // Nút: Trỏ 302 Miền Có Sẵn
  if (text === "⚡ Trỏ 302 Miền Có Sẵn") {
    userSessions.set(userId, { state: "WAIT_ADD_302_DOMAIN" });
    return sendMessage(chatId, "⚡ <b>[TRỎ 302 MIỀN CÓ SẴN]</b>\n\n✍️ <b>Bước 1:</b> Nhập tên miền đã có của bạn (ví dụ: <code>g8us.top</code>):");
  }

  // Nút: Trỏ Miền Có Sẵn ➔ LP
  if (text === "⚡ Trỏ Miền Có Sẵn ➔ LP" || text === "⚡ Trỏ Miền Có Sẵn") {
    userSessions.set(userId, { state: "WAIT_ADD_LP_DOMAIN" });
    return sendMessage(chatId, "🎨 <b>[TRỎ MIỀN CÓ SẴN VÀO LANDING PAGE]</b>\n\n✍️ <b>Bước 1:</b> Nhập tên miền đã có của bạn (ví dụ: <code>g8us.top</code>):");
  }

  // Nút: Check Giá Miền
  if (text === "🔍 Check Giá Miền" || text === "🔍 Kiểm Tra Miền") {
    userSessions.set(userId, { state: "WAIT_CHECK_DOMAIN" });
    return sendMessage(chatId, "🔍 Nhập tên miền cần kiểm tra giá (ví dụ: <code>88vip.top</code>):");
  }

  // Nút: Cập Nhật Link
  if (text === "🔗 Cập Nhật Link" || text === "🔗 Cập Nhật Link Đích") {
    userSessions.set(userId, { state: "WAIT_SETLINK_DOMAIN" });
    return sendMessage(chatId, "✍️ Nhập tên miền muốn đổi link (ví dụ: <code>betgg88.uk</code>):");
  }

  // Nút: Mở Web Chọn Mẫu Trực Quan
  if (text === "🌐 Mở Web Chọn Mẫu Trực Quan" || text === "🌐 Mở Web Chọn Mẫu" || text === "/web") {
    if (isValidPublicUrl(WEB_HUB_URL)) {
      return sendMessage(
        chatId,
        `🌐 <b>LANDING PAGE INTERACTIVE HUB</b>\n\n` +
        `Bạn có thể mở giao diện Web để xem toàn bộ ảnh chụp màn hình, lọc theo thương hiệu (GG88, LLWIN, MM88, ALO8) và chọn mẫu trực quan ngay trên Web!\n\n` +
        `👇 <i>Bấm nút bên dưới để mở:</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🚀 Mở Web Chọn Mẫu Ngay ➔", url: `${WEB_HUB_URL}?chatId=${chatId}` }
              ]
            ]
          }
        }
      );
    } else {
      return sendMessage(
        chatId,
        `🌐 <b>LANDING PAGE INTERACTIVE HUB</b>\n\n` +
        `• 💻 Web Dashboard nội bộ đang mở tại: <code>${WEB_HUB_URL}</code>\n` +
        `• Bạn có thể duyệt trực tiếp toàn bộ ảnh và chọn mẫu ngay trên Telegram bằng nút bên dưới!`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🖼️ Duyệt Ảnh Mẫu (Carousel)", callback_data: "pv:0" }
              ],
              [
                { text: "📋 Danh Sách Tất Cả Mẫu", callback_data: "list_all_tpls" }
              ]
            ]
          }
        }
      );
    }
  }

  // Lệnh: /templates hoặc nút "Xem Mẫu Landing Page (Kèm Ảnh)"
  if (
    text === "/templates" ||
    text === "/mau" ||
    text === "🖼️ Xem Mẫu Landing Page (Kèm Ảnh)" ||
    text === "🖼️ Xem Ảnh Từng Mẫu" ||
    text === "📑 Danh Sách Mẫu Landing Page" ||
    text === "Xem Mẫu Landing Page"
  ) {
    return sendTemplatePreview(chatId, 0);
  }

  // Lệnh: /check
  if (text.startsWith("/check")) {
    const parts = text.split(/\s+/);
    return handleCheck(chatId, parts[1]);
  }

  // Lệnh: /buy302 <domain> <link>
  if (text.startsWith("/buy302") || text.startsWith("/buy_302")) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return sendMessage(chatId, "⚠️ Cú pháp: <code>/buy302 &lt;tên_miền&gt; &lt;link_đích&gt;</code>\nVí dụ: <code>/buy302 gg88win.top https://t.me/link_dich</code>");
    }
    const domain = normalizeDomain(parts[1]);
    const link = normalizeUrl(parts[2]);
    const startMsg = await sendMessage(chatId, `⏳ Đang bắt đầu mua & trỏ 302 cho <b>${domain}</b>...`);
    return execute302DeployFlow(chatId, startMsg.result.message_id, domain, link, true);
  }

  // Lệnh: /add302 <domain> <link>
  if (text.startsWith("/add302") || text.startsWith("/add_302")) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return sendMessage(chatId, "⚠️ Cú pháp: <code>/add302 &lt;tên_miền&gt; &lt;link_đích&gt;</code>\nVí dụ: <code>/add302 g8us.top https://t.me/link_dich</code>");
    }
    const domain = normalizeDomain(parts[1]);
    const link = normalizeUrl(parts[2]);
    const startMsg = await sendMessage(chatId, `⏳ Đang cấu hình trỏ 302 cho <b>${domain}</b>...`);
    return execute302DeployFlow(chatId, startMsg.result.message_id, domain, link, false);
  }

  // Lệnh: /buy <domain> <link>
  if (text.startsWith("/buy")) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return sendMessage(chatId, "⚠️ Cú pháp: <code>/buy &lt;tên_miền&gt; &lt;link_đích&gt;</code>\nVí dụ: <code>/buy gg88win.top https://t.me/link_dich</code>");
    }
    const domain = normalizeDomain(parts[1]);
    const link = normalizeUrl(parts[2]);
    userSessions.set(userId, { action: "buy", domain, link, state: "WAIT_TPL_SELECTION" });
    return sendMessage(
      chatId,
      `🎯 <b>Chọn mẫu giao diện muốn áp dụng cho:</b>\n🌐 Tên miền: <code>${domain}</code>\n🔗 Link đích: <code>${link}</code>`,
      { reply_markup: makeTemplateKeyboard(chatId) }
    );
  }

  // Lệnh: /add <domain> <link>
  if (text.startsWith("/add")) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return sendMessage(chatId, "⚠️ Cú pháp: <code>/add &lt;tên_miền&gt; &lt;link_đích&gt;</code>\nVí dụ: <code>/add g8us.top https://t.me/link_dich</code>");
    }
    const domain = normalizeDomain(parts[1]);
    const link = normalizeUrl(parts[2]);
    userSessions.set(userId, { action: "add", domain, link, state: "WAIT_TPL_SELECTION" });
    return sendMessage(
      chatId,
      `🎯 <b>Chọn mẫu giao diện cho tên miền đã có:</b>\n🌐 Tên miền: <code>${domain}</code>\n🔗 Link đích: <code>${link}</code>`,
      { reply_markup: makeTemplateKeyboard(chatId) }
    );
  }

// ── Hàm cập nhật link thông minh: Quét đúng folder gốc ➔ Báo rõ tài khoản CF ──
async function handleSmartSetLink(chatId, domainInput, linkInput, messageIdToEdit = null) {
  let domain, link;

  // 1. Kiểm tra tính hợp lệ của Tên Miền
  try {
    domain = normalizeDomain(domainInput);
  } catch (err) {
    const errorMsg =
      `❌ <b>Tên miền không hợp lệ:</b> <code>${domainInput}</code>\n\n` +
      `💡 <i>Định dạng đúng ví dụ:</i> <code>betgg88.uk</code> hoặc <code>8386llwin.com</code>\n` +
      `⚠️ Tên miền không được chứa dấu cách, ký tự đặc biệt hoặc thiếu phần đuôi (.com, .uk,...).`;
    if (messageIdToEdit) return editMessage(chatId, messageIdToEdit, errorMsg);
    return sendMessage(chatId, errorMsg);
  }

  // 2. Kiểm tra tính hợp lệ của Link Đích
  try {
    link = normalizeUrl(linkInput);
  } catch (err) {
    const errorMsg =
      `❌ <b>Link chuyển hướng không hợp lệ:</b> <code>${linkInput}</code>\n\n` +
      `💡 <i>Link phải bắt đầu bằng <b>http://</b> hoặc <b>https://</b></i>\n` +
      `Ví dụ: <code>https://t.me/cskh_bot</code> hoặc <code>https://gg8838.com/?id=123</code>`;
    if (messageIdToEdit) return editMessage(chatId, messageIdToEdit, errorMsg);
    return sendMessage(chatId, errorMsg);
  }

  // 3. Gửi thông báo đang xử lý (Loading)
  let loadMsgId = messageIdToEdit;
  if (!loadMsgId) {
    const loadMsg = await sendMessage(
      chatId,
      `⏳ <b>Đang xử lý:</b> Đang quét kiểm tra tài khoản Cloudflare & folder gốc cho <code>${domain}</code>...`
    );
    loadMsgId = loadMsg?.result?.message_id;
  } else {
    await editMessage(
      chatId,
      loadMsgId,
      `⏳ <b>Đang xử lý:</b> Đang quét kiểm tra tài khoản Cloudflare & folder gốc cho <code>${domain}</code>...`
    );
  }

  try {
    const res = await smartSetLink(domain, link, "", {
      userId: `tg_${chatId}`,
      username: `telegram_${chatId}`,
      fullName: "Telegram Bot",
    });

    if (res.success) {
      let detailText = "";
      if (res.type === "landing_page") {
        const repoListText = (res.updatedRepos || [])
          .map((r) => `• 📁 <code>${r.folderPath}</code> [${r.projectName || "Pages"}] ${r.gitPushed ? "(Git Pushed ✅)" : ""}`)
          .join("\n");
        detailText = `📂 <b>Đã cập nhật đúng tại folder gốc:</b>\n${repoListText || "• Landing Page Pages Project"}\n\n`;
      } else {
        detailText = `⚙️ <b>Loại cấu hình:</b> Cloudflare Page Rules (Direct 302)\n`;
      }

      const successMsg =
        `✅ <b>CẬP NHẬT LINK CHUẨN XÁC THÀNH CÔNG!</b>\n\n` +
        `🌐 <b>Tên miền:</b> <code>${domain}</code>\n` +
        `🏢 <b>Tài khoản Cloudflare:</b> <b>${res.cfAccount}</b>\n` +
        `🎯 <b>Link đích mới:</b> <code>${link}</code>\n\n` +
        detailText +
        `⚡ <i>Trạng thái: ${res.actionLabel || "Đã đồng bộ & kích hoạt ngay lập tức!"}</i>`;

      if (loadMsgId) return editMessage(chatId, loadMsgId, successMsg);
      return sendMessage(chatId, successMsg);
    } else {
      throw new Error(res.error || "Không thể cập nhật link");
    }
  } catch (err) {
    const errorMsg =
      `❌ <b>Lỗi khi cập nhật tên miền <code>${domain}</code>:</b>\n\n` +
      `⚠️ <i>Chi tiết lỗi:</i> ${err.message}\n\n` +
      `👉 Vui lòng thử lại sau vài giây hoặc liên hệ hỗ trợ kỹ thuật.`;
    if (loadMsgId) return editMessage(chatId, loadMsgId, errorMsg);
    return sendMessage(chatId, errorMsg);
  }
}

  // Lệnh: /setlink <domain> <link>
  if (text.startsWith("/setlink")) {
    const parts = text.split(/\s+/);
    if (parts.length < 3) {
      return sendMessage(
        chatId,
        "⚠️ <b>Cú pháp chưa đủ:</b> <code>/setlink &lt;tên_miền&gt; &lt;link_mới&gt;</code>\n\n" +
        "Ví dụ: <code>/setlink betgg88.uk https://t.me/link_moi</code>"
      );
    }
    return handleSmartSetLink(chatId, parts[1], parts[2]);
  }

  // ── Xử lý hội thoại từng bước (Step-by-step wizard) ──
  const session = userSessions.get(userId);
  if (session) {
    if (session.state === "WAIT_CHECK_DOMAIN") {
      userSessions.delete(userId);
      return handleCheck(chatId, text);
    }

    // 1. Mua dùng Landing Page
    if (session.state === "WAIT_BUY_DOMAIN" || session.state === "WAIT_BUY_LP_DOMAIN") {
      try {
        session.domain = normalizeDomain(text);
        session.state = "WAIT_BUY_LP_LINK";
        session.action = "buy";
        return sendMessage(chatId, `🎨 <b>[MUA DÙNG LANDING PAGE]</b>\n🌐 Tên miền: <b>${session.domain}</b>\n\n✍️ <b>Bước 2:</b> Nhập link chuyển hướng đích (ví dụ: <code>https://t.me/cskh_bot</code>):`);
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Tên miền không hợp lệ:</b> <code>${text}</code>\n\n💡 Vui lòng nhập đúng định dạng (ví dụ: <code>gg88top.live</code>):`);
      }
    }

    if (session.state === "WAIT_BUY_LINK" || session.state === "WAIT_BUY_LP_LINK") {
      try {
        session.link = normalizeUrl(text);
        const domain = session.domain;
        if (session.selectedTpl) {
          const tplId = session.selectedTpl;
          const isBuy = true;
          userSessions.delete(userId);
          const startMsg = await sendMessage(chatId, `⏳ Đang bắt đầu cài đặt cho <b>${domain}</b>...`);
          return executeDeployFlow(chatId, startMsg.result.message_id, domain, session.link, tplId, isBuy);
        }
        session.state = "WAIT_TPL_SELECTION";
        session.action = "buy";
        return sendMessage(
          chatId,
          `🎨 <b>Bước 3:</b> Chọn giao diện Landing Page cho miền <b>${domain}</b>:`,
          { reply_markup: makeTemplateKeyboard(chatId) }
        );
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Link không hợp lệ:</b> <code>${text}</code>\n\n💡 Link phải bắt đầu bằng <b>http://</b> hoặc <b>https://</b>. Vui lòng nhập lại:`);
      }
    }

    // 2. Mua trỏ 302 Trực Tiếp
    if (session.state === "WAIT_BUY_302_DOMAIN") {
      try {
        session.domain = normalizeDomain(text);
        session.state = "WAIT_BUY_302_LINK";
        session.action = "buy_302";
        return sendMessage(chatId, `⚡ <b>[MUA TRỎ 302 TRỰC TIẾP]</b>\n🌐 Tên miền: <b>${session.domain}</b>\n\n✍️ <b>Bước 2:</b> Nhập link đích muốn chuyển hướng tới (ví dụ: <code>https://14llwin.com/?id=785929208</code>):`);
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Tên miền không hợp lệ:</b> <code>${text}</code>\n\n💡 Vui lòng nhập đúng định dạng (ví dụ: <code>gg88win.top</code>):`);
      }
    }

    if (session.state === "WAIT_BUY_302_LINK") {
      try {
        session.link = normalizeUrl(text);
        const domain = session.domain;
        const link = session.link;
        userSessions.delete(userId);
        const startMsg = await sendMessage(chatId, `⏳ Đang bắt đầu mua & cài đặt trỏ 302 cho <b>${domain}</b>...`);
        return execute302DeployFlow(chatId, startMsg.result.message_id, domain, link, true);
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Link không hợp lệ:</b> <code>${text}</code>\n\n💡 Link phải bắt đầu bằng <b>http://</b> hoặc <b>https://</b>. Vui lòng nhập lại:`);
      }
    }

    // 3. Trỏ 302 cho miền có sẵn
    if (session.state === "WAIT_ADD_302_DOMAIN") {
      try {
        session.domain = normalizeDomain(text);
        session.state = "WAIT_ADD_302_LINK";
        session.action = "add_302";
        return sendMessage(chatId, `⚡ <b>[TRỎ 302 MIỀN CÓ SẴN]</b>\n🌐 Tên miền: <b>${session.domain}</b>\n\n✍️ <b>Bước 2:</b> Nhập link đích muốn chuyển hướng tới:`);
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Tên miền không hợp lệ:</b> <code>${text}</code>\n\n💡 Vui lòng nhập đúng định dạng (ví dụ: <code>g8us.top</code>):`);
      }
    }

    if (session.state === "WAIT_ADD_302_LINK") {
      try {
        session.link = normalizeUrl(text);
        const domain = session.domain;
        const link = session.link;
        userSessions.delete(userId);
        const startMsg = await sendMessage(chatId, `⏳ Đang cấu hình trỏ 302 cho <b>${domain}</b>...`);
        return execute302DeployFlow(chatId, startMsg.result.message_id, domain, link, false);
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Link không hợp lệ:</b> <code>${text}</code>\n\n💡 Link phải bắt đầu bằng <b>http://</b> hoặc <b>https://</b>. Vui lòng nhập lại:`);
      }
    }

    // 4. Trỏ miền có sẵn vào Landing Page
    if (session.state === "WAIT_ADD_DOMAIN" || session.state === "WAIT_ADD_LP_DOMAIN") {
      try {
        session.domain = normalizeDomain(text);
        session.state = "WAIT_ADD_LP_LINK";
        session.action = "add";
        return sendMessage(chatId, `🎨 <b>[TRỎ MIỀN CÓ SẴN ➔ LANDING PAGE]</b>\n🌐 Tên miền: <b>${session.domain}</b>\n\n✍️ <b>Bước 2:</b> Nhập link chuyển hướng đích:`);
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Tên miền không hợp lệ:</b> <code>${text}</code>\n\n💡 Vui lòng nhập đúng định dạng (ví dụ: <code>g8us.top</code>):`);
      }
    }

    if (session.state === "WAIT_ADD_LINK" || session.state === "WAIT_ADD_LP_LINK") {
      try {
        session.link = normalizeUrl(text);
        session.state = "WAIT_TPL_SELECTION";
        session.action = "add";
        const domain = session.domain;
        return sendMessage(
          chatId,
          `🎨 <b>Bước 3:</b> Chọn giao diện Landing Page cho <b>${domain}</b>:`,
          { reply_markup: makeTemplateKeyboard(chatId) }
        );
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Link không hợp lệ:</b> <code>${text}</code>\n\n💡 Link phải bắt đầu bằng <b>http://</b> hoặc <b>https://</b>. Vui lòng nhập lại:`);
      }
    }

    if (session.state === "WAIT_SETLINK_DOMAIN") {
      try {
        session.domain = normalizeDomain(text);
        session.state = "WAIT_SETLINK_LINK";
        return sendMessage(chatId, `🌐 Tên miền: <b>${session.domain}</b>\n\n✍️ Nhập link chuyển hướng mới (ví dụ: <code>https://t.me/link_moi</code>):`);
      } catch (err) {
        return sendMessage(chatId, `❌ <b>Tên miền không hợp lệ:</b> <code>${text}</code>\n\n💡 Vui lòng nhập đúng tên miền (ví dụ: <code>betgg88.uk</code>):`);
      }
    }

    if (session.state === "WAIT_SETLINK_LINK") {
      const domain = session.domain;
      const rawLink = text;
      userSessions.delete(userId);
      return handleSmartSetLink(chatId, domain, rawLink);
    }
  }

  // Tin nhắn tự do
  return sendMessage(chatId, "💡 Bạn có thể dùng menu phím bấm bên dưới hoặc gõ <code>/help</code> để xem hướng dẫn.");
}

// ── Xử lý Nút Bấm Inline (Callback Queries) ──
async function handleCallbackQuery(cb) {
  const chatId = cb.message.chat.id;
  const messageId = cb.message.message_id;
  const userId = cb.from?.id;
  const data = cb.data;

  await answerCallbackQuery(cb.id);

  if (data === "cancel") {
    userSessions.delete(userId);
    return editMessage(chatId, messageId, "❌ Đã huỷ thao tác.");
  }

  // 1. Duyệt Carousel Preview ảnh
  if (data.startsWith("pv:")) {
    const idx = parseInt(data.split(":")[1], 10) || 0;
    await sendTemplatePreview(chatId, idx, messageId);
    return;
  }

  // 2. Chọn mẫu từ Carousel
  if (data.startsWith("pick_pv:")) {
    const tplId = data.split(":")[1];
    const tpl = getTemplate(tplId);
    const session = userSessions.get(userId);
    if (session && session.domain && session.link) {
      const { domain, link, action } = session;
      const isBuy = action === "buy";
      userSessions.delete(userId);
      const startMsg = await sendMessage(chatId, `⏳ Đang bắt đầu cài đặt cho <b>${domain}</b>...`);
      return executeDeployFlow(chatId, startMsg.result.message_id, domain, link, tpl.id, isBuy);
    } else {
      userSessions.set(userId, { state: "WAIT_BUY_DOMAIN", selectedTpl: tpl.id });
      return sendMessage(
        chatId,
        `✅ Bạn đã chọn mẫu: <b>${tpl.name}</b>\n\n` +
        `✍️ <b>Bước 1:</b> Nhập tên miền bạn muốn mua (ví dụ: <code>gg88top.live</code>):`
      );
    }
  }

  // 3. Xem danh sách dạng text
  if (data === "list_all_tpls") {
    const templates = listTemplates();
    let reply = `📑 <b>DANH SÁCH CÁC MẪU GIAO DIỆN HIỆN CÓ:</b>\n\n`;
    const inline_keyboard = [];

    templates.forEach((t, index) => {
      reply += `<b>${index + 1}. ${t.name}</b>\n`;
      reply += `   📑 Mô tả: <i>${t.title}</i>\n`;
      if (isValidPublicUrl(t.sampleUrl)) {
        reply += `   🔗 Xem thử: <a href="${t.sampleUrl}">Xem Live</a>\n\n`;
      } else {
        reply += `\n`;
      }

      const row = [{ text: `🖼️ Xem Ảnh: ${t.name}`, callback_data: `pv:${index}` }];
      if (isValidPublicUrl(t.sampleUrl)) {
        row.push({ text: `🌐 Live Demo`, url: t.sampleUrl });
      }
      inline_keyboard.push(row);
    });

    return sendMessage(chatId, reply, {
      reply_markup: { inline_keyboard },
      disable_web_page_preview: true,
    });
  }

  if (data.startsWith("tpl:")) {
    const templateId = data.replace("tpl:", "");
    const session = userSessions.get(userId);

    if (!session || !session.domain || !session.link) {
      return editMessage(
        chatId,
        messageId,
        "⚠️ <b>Phiên làm việc đã hết hạn.</b>\n" +
        "Vui lòng bấm nút <b>🚀 Mua & Trỏ Miền Tự Động</b> để bắt đầu lại nhé!"
      );
    }

    const { domain, link, action } = session;
    const isBuy = action === "buy";
    userSessions.delete(userId);

    await editMessage(chatId, messageId, `⏳ Đang bắt đầu cài đặt cho <b>${domain}</b>...`);
    await executeDeployFlow(chatId, messageId, domain, link, templateId, isBuy);
  }
}

// ── Long Polling Loop ──
let lastUpdateId = 0;
let isRunning = true;

export async function startBot() {
  console.log("🤖 Telegram Bot đang kết nối...");
  const me = await tgRequest("getMe");

  if (!me.ok) {
    console.error("❌ Không thể kết nối Bot Telegram:", me.description);
    return;
  }

  console.log(`✅ Bot đã kết nối thành công: @${me.result.username} (${me.result.first_name})`);
  console.log("🚀 Sẵn sàng nhận lệnh từ Telegram!");

  while (isRunning) {
    try {
      const updates = await tgRequest("getUpdates", {
        offset: lastUpdateId + 1,
        timeout: 25,
      });

      if (updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          lastUpdateId = update.update_id;

          if (update.message) {
            await handleMessage(update.message);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      console.error("Lỗi Polling:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Chạy trực tiếp nếu file được execute
if (process.argv[1]?.endsWith("bot.js")) {
  startBot();
}
