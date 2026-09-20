import { Client } from "ssh2";

const tok = "cfut_LilEayRZX9hV25QCUedDj73ZFwa6HHzlba5OotzFaf262ef3";
const c = new Client();

const remoteScript = `
set -e
cd /var/www
mkdir -p Landingpages/GG88
if [ -f Landingpages/GG88/landing-page-uae/domains.json ]; then
  echo CLONE_OK
  cd Landingpages/GG88/landing-page-uae && git pull --ff-only || true
else
  git clone https://github.com/freze2212/landing-page-uae.git Landingpages/GG88/landing-page-uae
  echo CLONED
fi
cd /var/www/web-ten-mien
if grep -q '^CLOUDFLARE_ADMIN_API_TOKEN=' .env; then
  sed -i "s|^CLOUDFLARE_ADMIN_API_TOKEN=.*|CLOUDFLARE_ADMIN_API_TOKEN=${tok}|" .env
else
  echo "CLOUDFLARE_ADMIN_API_TOKEN=${tok}" >> .env
fi
echo TOKEN_PREFIX=$(grep '^CLOUDFLARE_ADMIN_API_TOKEN=' .env | cut -c1-28)
grep -n landing_page_uae src/templates.js | head -3
pm2 restart web-tenmienbet --update-env
sleep 2
node --input-type=module -e "import { getTemplate } from './src/templates.js'; import { findTemplateByPagesCname } from './src/repo-scanner.js'; const t=getTemplate('landing_page_uae'); console.log('HUB', t.id, t.gitRepo, t.path); console.log('MAP', findTemplateByPagesCname('landing-page-uae-2.pages.dev')?.id);"
`;

c.on("ready", () => {
  c.exec(remoteScript, (e, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", (code) => {
      console.log(o);
      console.log("exit", code);
      c.end();
      process.exit(code || 0);
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
