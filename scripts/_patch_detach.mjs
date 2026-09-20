import { Client } from "ssh2";

const cmd = `
python3 - <<'PY'
from pathlib import Path
p=Path('/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js')
t=p.read_text(encoding='utf-8')
old='''  } catch (e) {
    if (Date.now() - lastHallShapeLogAt > 15000) {
      lastHallShapeLogAt = Date.now();
      console.log(`[HALL POLL] ${nameServiceSocket} err=${e.message}`);
    }
    return false;
  }
}'''
new='''  } catch (e) {
    const msg = String(e && e.message || e);
    if (/detached|Execution context was destroyed|navigation/i.test(msg)) {
      return true;
    }
    if (Date.now() - lastHallShapeLogAt > 15000) {
      lastHallShapeLogAt = Date.now();
      console.log(`[HALL POLL] ${nameServiceSocket} err=${msg}`);
    }
    return false;
  }
}'''
if old not in t:
    raise SystemExit('poll catch missing')
p.write_text(t.replace(old,new,1), encoding='utf-8')
print('DETACH_OK')
PY
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
