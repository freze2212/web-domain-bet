/** Patch LP index.html — bỏ hardcode link, chỉ load từ domains.json theo hostname */
export function patchIndexHtmlLinks(html, domain, newLink) {
  if (!html || !newLink) return html;
  let h = String(html);

  h = h.replace(/window\.REDIRECT_URL\s*=\s*["'][^"']*["']/gi, `window.REDIRECT_URL = ""`);
  h = h.replace(/https?:\/\/(?:www\.)?gg88\d+\.com[^"'\\s]*/gi, newLink);
  h = h.replace(/(<a\b[^>]*class=["'][^"']*redirect-link[^"']*["'][^>]*href=["'])[^"']*(["'])/gi, `$1${newLink}$2`);
  h = h.replace(/(<a\b[^>]*href=["'])[^"']*(["'][^>]*class=["'][^"']*redirect-link)/gi, `$1${newLink}$2`);

  const loader = `
<script id="hub-domains-json-loader">
(function(){
  function apply(u){
    if(!u) return;
    window.REDIRECT_URL=u;
    var links=document.querySelectorAll('a.redirect-link,a.ref-btn,a.btn-register,a.cta-btn');
    for(var i=0;i<links.length;i++){ links[i].setAttribute('href',u); links[i].href=u; }
  }
  fetch('/domains.json?v='+Date.now()).then(function(r){return r.json();}).then(function(d){
    if(!d) return;
    var h=(window.location.hostname||'').toLowerCase();
    var nh=h.replace(/^www\\./,'');
    var e=d[h]||d[nh];
    if(!e) return;
    apply(e.main_url||e.url||e.link||(typeof e==='string'?e:''));
  }).catch(function(){});
})();
</script>`;

  if (!h.includes("hub-domains-json-loader")) {
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
