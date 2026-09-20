from pathlib import Path

p = Path("/var/www/bot-keo-nhom-bcr/bot-keo-nhom-bcr-main/servicePuppeteer/session.js")
t = p.read_text(encoding="utf-8")
old = """  } catch (e) {
    if (Date.now() - lastHallShapeLogAt > 15000) {
      lastHallShapeLogAt = Date.now();
      console.log(`[HALL POLL] ${nameServiceSocket} err=${e.message}`);
    }
    return false;
  }
}"""
new = """  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/detached|Execution context was destroyed|navigation/i.test(msg)) {
      return true;
    }
    if (Date.now() - lastHallShapeLogAt > 15000) {
      lastHallShapeLogAt = Date.now();
      console.log(`[HALL POLL] ${nameServiceSocket} err=${msg}`);
    }
    return false;
  }
}"""
if old not in t:
    raise SystemExit("poll catch missing")
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print("DETACH_OK")
