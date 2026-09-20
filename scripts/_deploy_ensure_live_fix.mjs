import fs from "fs";
import path from "path";
import { Client } from "ssh2";

const root = "c:/FREZE-PRJ/web-tên-miền";
const files = [
  ["src/cloudflare.js", "/var/www/web-ten-mien/src/cloudflare.js"],
  ["src/templates.js", "/var/www/web-ten-mien/src/templates.js"],
  ["src/server.js", "/var/www/web-ten-mien/src/server.js"],
  ["src/verifier.js", "/var/www/web-ten-mien/src/verifier.js"],
];

function put(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.writeFile(remote, fs.readFileSync(path.join(root, local)), (err) =>
      err ? reject(err) : resolve(remote)
    );
  });
}

const c = new Client();
c.on("ready", () => {
  c.sftp(async (err, sftp) => {
    if (err) throw err;
    for (const [l, r] of files) {
      await put(sftp, l, r);
      console.log("OK", r);
    }
    c.exec(
      `pm2 restart web-tenmienbet --update-env; sleep 3; cd /var/www/web-ten-mien && node --input-type=module <<'NODE'
import { ensureLiveDomainLink } from "./src/cloudflare.js";
import { getTemplate, updateTemplateDomainsJson } from "./src/templates.js";
import { updateHistoryItem, getHistory } from "./src/history.js";

const domain = "gg883f.com";
const link = "https://gg8849.com/?id=211438962";
const tpl = getTemplate("lp_gg88_vip_2");
console.log("tpl path", tpl?.path, "pages", tpl?.pagesProject);

const sync = await updateTemplateDomainsJson(tpl, domain, link, link, {
  cnameTarget: "lp-gg88-vip-9.pages.dev",
  pagesProject: "lp-gg88-vip-9",
  liveTimeoutMs: 120000,
});
console.log("sync liveEnsure", JSON.stringify(sync.liveEnsure));

const hist = getHistory().filter(h => String(h.domain||"").toLowerCase()===domain);
for (const h of hist.slice(0,3)) {
  if (h.status === "in_progress" || h.actionType === "SWITCH_TPL") {
    updateHistoryItem(h.id, {
      status: sync.liveEnsure?.ok ? "success" : "failed",
      progress: null,
      link,
      tele: link,
      cnameTarget: "lp-gg88-vip-9.pages.dev",
      liveStatus: sync.liveEnsure?.ok ? "200_OK" : "LINK_MISMATCH",
      error: sync.liveEnsure?.ok ? null : sync.liveEnsure?.error,
      details: { ...(h.details||{}), liveEnsure: sync.liveEnsure, fixedBy: "ensureLive_system" },
    });
    console.log("hist updated", h.id, h.status);
  }
}
NODE`,
      (e, s) => {
        let o = "";
        s.on("data", (d) => (o += d));
        s.stderr.on("data", (d) => (o += d));
        s.on("close", () => {
          console.log(o);
          c.end();
        });
      }
    );
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
