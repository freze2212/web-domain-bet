/** Khóa miền trong domains.json: chữ thường, bỏ www. */
export function domainKeyApex(key) {
  return String(key || "").trim().toLowerCase().replace(/^(www\.)+/, "");
}

/** Mọi khóa trỏ về cùng miền (G88VIP.UK, www.g88vip.uk, ...) */
export function findDomainKeys(dj, domain) {
  if (!dj || typeof dj !== "object" || Array.isArray(dj)) return [];
  const norm = domainKeyApex(domain);
  return Object.keys(dj).filter((k) => domainKeyApex(k) === norm);
}

/** Entry của miền, ưu tiên khóa chữ thường */
export function getDomainEntry(dj, domain) {
  const keys = findDomainKeys(dj, domain);
  if (!keys.length) return undefined;
  const norm = domainKeyApex(domain);
  const exact = keys.find((k) => k === norm) || keys.find((k) => k === `www.${norm}`) || keys[0];
  return dj[exact];
}

export function removeDomainKeys(dj, domain) {
  const keys = findDomainKeys(dj, domain);
  for (const k of keys) delete dj[k];
  return keys.length;
}

/**
 * Patch LP index.html — chỉ load link từ domains.json theo hostname.
 * Không đụng href/link cứng dùng chung của mẫu: chép link miền vừa sửa vào đó làm miền khác ăn nhầm link.
 */
export function patchIndexHtmlLinks(html, domain, newLink) {
  if (!html || !newLink) return html;
  let h = String(html);

  h = h.replace(/window\.REDIRECT_URL\s*=\s*["'][^"']*["']/gi, `window.REDIRECT_URL = ""`);

  // QUAN TRỌNG: check typeof string TRƯỚC — nếu để e.link trước sẽ đụng String.prototype.link (native)
  const loader = `
<script id="hub-domains-json-loader">
(function(){
  function isHttpUrl(u){ return typeof u==="string" && /^https?:\\/\\//i.test(u.trim()); }
  function pick(e){
    if(!e) return "";
    if(typeof e==="string") return isHttpUrl(e)?e.trim():"";
    var c=e.main_url||e.url||e.messenger_url||e.target_url||"";
    return isHttpUrl(c)?String(c).trim():"";
  }
  function apply(u){
    if(!isHttpUrl(u)) return;
    window.REDIRECT_URL=u;
    window.__HUB_LINK__=u;
    var links=document.querySelectorAll('a.redirect-link,a.ref-btn,a.btn-register,a.cta-btn,#main-cta');
    for(var i=0;i<links.length;i++){ links[i].setAttribute('href',u); links[i].href=u; }
  }
  fetch('/domains.json?v='+Date.now()).then(function(r){return r.json();}).then(function(d){
    if(!d) return;
    var h=(window.location.hostname||'').toLowerCase();
    var nh=h.replace(/^www\\./,'');
    var e=d[h]||d[nh]||d['www.'+nh];
    apply(pick(e));
  }).catch(function(){});
})();
</script>`;

  if (h.includes("hub-domains-json-loader")) {
    h = h.replace(/<script id="hub-domains-json-loader">[\s\S]*?<\/script>/i, loader.trim());
  } else {
    h = h.replace(/<\/body>/i, `${loader}\n</body>`);
  }
  return h;
}

/** Xóa defaultLink / default_link — không dùng fallback repo-wide */
export function stripDomainsJsonFallbacks(dj) {
  if (!dj || typeof dj !== "object" || Array.isArray(dj)) return dj;
  delete dj.defaultLink;
  delete dj.default_link;
  return dj;
}
