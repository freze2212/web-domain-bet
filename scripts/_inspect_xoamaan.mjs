import { Client } from "ssh2";

const cmd = `
echo '=== folders ==='
ls -la /var/www/Landingpages/LLWIN/ | grep -i xoamaan
echo
echo '=== git remotes ==='
for d in /var/www/Landingpages/LLWIN/lp-6c-xoamaan-llwin /var/www/Landingpages/LLWIN/landing-xoamaan-5f; do
  echo "-- $d"
  if [ -d "$d/.git" ]; then git -C "$d" remote -v; git -C "$d" branch -v; git -C "$d" log -1 --oneline; else echo no-git; fi
  echo domains.json:
  head -c 800 "$d/domains.json" 2>/dev/null || echo '(none)'
  echo
done
echo '=== hub templates match ==='
grep -RIn --include='*.js' --include='*.json' -E 'xoamaan|xoa.?ma.?an|lp-6c-xoamaan' /var/www/web-ten-mien/src /var/www/web-ten-mien/data 2>/dev/null | head -30
echo '=== pages.dev? ==='
grep -RIn --include='*.json' -E 'xoamaan' /var/www/Landingpages/LLWIN/lp-6c-xoamaan-llwin /var/www/Landingpages/LLWIN/landing-xoamaan-5f 2>/dev/null | head -20
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d));
    s.stderr.on("data", (d) => (o += d));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
