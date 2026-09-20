import { Client } from "ssh2";

const c = new Client();
c.on("ready", () => {
  console.log("ssh ready");
  c.exec("echo HELLO; hostname; date; pgrep -af switch_7 || echo NO_SWITCH; pgrep -af 'TARGET_TPL=lp_gg88_mx' || echo NO_HEREDOC", (err, stream) => {
    if (err) console.error(err);
    stream.on("data", (d) => process.stdout.write(d.toString()));
    stream.stderr.on("data", (d) => process.stderr.write(d.toString()));
    stream.on("close", (code) => {
      console.log("code", code);
      c.end();
    });
  });
});
c.on("error", (e) => console.error("ssh err", e));
c.connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
