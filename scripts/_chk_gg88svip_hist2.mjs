import { Client } from "ssh2";
const cmd = `python3 - <<'PY'
import json
from pathlib import Path
p=Path('/var/www/web-ten-mien/data/history.json')
data=json.loads(p.read_text(encoding='utf-8'))
items=data if isinstance(data,list) else data.get('items') or data.get('history') or []
rows=[x for x in items if str(x.get('domain','')).lower()=='gg88svip.co']
rows=sorted(rows, key=lambda x: x.get('timestamp') or '', reverse=True)
print('count', len(rows))
for x in rows[:3]:
  print({k:x.get(k) for k in ['timestamp','status','actionType','templateName','templateId','error','link','cnameTarget']})
  print('---')
PY`;
const c=new Client();
c.on('ready',()=>{
  c.exec(cmd,(e,st)=>{
    let o=''; st.on('data',d=>o+=d); st.stderr.on('data',d=>o+=d);
    st.on('close',()=>{console.log(o); c.end();});
  });
}).connect({host:'103.146.22.218',username:'root',password:'admin123@!'});
