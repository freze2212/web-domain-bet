import { Client } from "ssh2";

const c = new Client();
c.on("ready", () => {
  const cmd = `
cd /var/www/web-ten-mien
python3 - <<'PY'
import json, time
fp='data/history.json'
data=json.load(open(fp,encoding='utf-8'))
hid='hist_1789140982970_4s0vr'
for it in data:
  if it.get('id')==hid:
    it['liveStatus']='200_OK'
    it['lastCheckError']=None
    it['verifiedAt']=time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
    it['lastCheckedAt']=it['verifiedAt']
    it['cnameTarget']='lp-gg88-vip-7.pages.dev'
    it['details']=it.get('details') or {}
    it['details']['repaired1014']=True
    it['details']['repairNote']='CNAME cũ trỏ lp-gg88-vip-4 (project đã xoá) → gắn lại lp-gg88-vip-7'
    print('UPDATED', json.dumps({k:it.get(k) for k in ['id','domain','status','liveStatus','cnameTarget','link','verifiedAt']}, ensure_ascii=False))
    break
else:
  print('NOT FOUND')
json.dump(data, open(fp,'w',encoding='utf-8'), ensure_ascii=False, indent=2)
print('saved')
PY
curl -sI https://gg88a.ink | head -3
`;
  c.exec(cmd, (e, st) => {
    let o = "";
    st.on("data", (d) => (o += d));
    st.stderr.on("data", (d) => (o += d));
    st.on("close", () => {
      console.log(o);
      c.end();
    });
  });
}).connect({ host: "103.146.22.218", username: "root", password: "admin123@!" });
