// Developer-only PR bookkeeping. Credential-helper output stays in memory and is never printed or persisted.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const mode=process.argv[2];
if(!['create','update','status','peer'].includes(mode))throw Error('Expected create|update|status|peer');
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
if(credential.status!==0)throw Error('GitHub credential helper unavailable');
const fields=Object.fromEntries(credential.stdout.split(/\r?\n/).filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
if(!fields.password)throw Error('GitHub credential missing');
const repo='repos/Echo-love928/CodeLess';
const api=async(path,method='GET',data)=>{const response=await fetch('https://api.github.com/'+path,{method,headers:{Authorization:`Bearer ${fields.password}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  if(!response.ok)throw Error(`GitHub ${method} ${path}: HTTP ${response.status}`);return response.json();};
const prs=await api(repo+'/pulls?state=open&per_page=100');
if(mode==='peer') {
  const peer=prs.find(p=>p.head.ref.includes('d22-b'));
  if(!peer)throw Error('D22-B PR missing');
  const full=await api(repo+'/pulls/'+peer.number),files=await api(repo+'/pulls/'+peer.number+'/files?per_page=100');
  const data={checkedAt:new Date().toISOString(),number:full.number,url:full.html_url,head:full.head.sha,base:full.base.sha,branch:full.head.ref,draft:full.draft,body:full.body,
    files:files.map(f=>({filename:f.filename,status:f.status,additions:f.additions,deletions:f.deletions,patch:f.patch??null}))};
  writeFileSync('tests/performance/api/evidence/peer-pr.json',JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify(data));process.exit(0);
}
let pr=prs.find(p=>p.head.ref==='codex/d22-a-api-capacity');
if(mode==='create'&&!pr)pr=await api(repo+'/pulls','POST',{title:'D22-A：后端容量限制与关键链路测量',head:'codex/d22-a-api-capacity',base:'main',draft:true,body:readFileSync('tests/performance/api/PR-DRAFT.md','utf8')});
if(mode==='update'){if(!pr)throw Error('D22-A PR not found');pr=await api(repo+'/pulls/'+pr.number,'PATCH',{body:readFileSync('tests/performance/api/PR-DRAFT.md','utf8')});}
const output={checkedAt:new Date().toISOString(),peer:prs.filter(p=>p.head.ref.includes('d22-b')).map(p=>({number:p.number,url:p.html_url,head:p.head.sha})),pr:pr?{number:pr.number,url:pr.html_url,head:pr.head.sha,base:pr.base.sha,draft:pr.draft}:null};
if(pr){const checks=await api(repo+'/commits/'+pr.head.sha+'/check-runs?per_page=100');output.checks=checks.check_runs.map(c=>({name:c.name,status:c.status,conclusion:c.conclusion,head:c.head_sha,url:c.html_url}));}
writeFileSync('tests/performance/api/pr-status.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output));
