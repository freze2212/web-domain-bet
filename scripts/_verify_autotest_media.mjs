import { Client } from "ssh2";

const cmd = `
export TZ=Asia/Ho_Chi_Minh
sleep 20
echo '=== PUBLIC HOME ==='
curl -sI --max-time 20 https://autotest-6888.top/ | head -18
echo
echo '=== PUBLIC IMAGE ==='
curl -sI --max-time 20 https://autotest-6888.top/uploads/artboard-1-1789104921240.png | head -18
echo
echo '=== PUBLIC API ==='
curl -sI --max-time 15 https://autotest-6888.top/api/files | head -15
echo
echo '=== HOME SNIP ==='
curl -s --max-time 15 https://autotest-6888.top/ | head -c 250
echo
echo
echo '=== DNS DIG ==='
dig +short autotest-6888.top A
dig +short autotest-6888.top CNAME
`;

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (e, s) => {
    let o = "";
    s.on("data", (d) => (o += d.toString()));
    s.stderr.on("data", (d) => (o += d.toString()));
    s.on("close", () => {
      console.log(o || "(empty)");
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
