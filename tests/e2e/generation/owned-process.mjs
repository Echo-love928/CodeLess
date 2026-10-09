import {spawn} from 'node:child_process'
import {readFileSync,writeFileSync,openSync,closeSync,readdirSync,existsSync} from 'node:fs'
import assert from 'node:assert/strict'
const spec=JSON.parse(readFileSync(process.argv[2],'utf8')),sid=process.pid
const stat=pid=>{try{const text=readFileSync('/proc/'+pid+'/stat','utf8'),fields=text.slice(text.lastIndexOf(')')+2).split(' ');return {pid:Number(pid),state:fields[0],sid:Number(fields[3]),start:fields[19]}}catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return null;throw error}}
assert.equal(stat(sid).sid,sid,'setsid must establish ownership before launching the target')
const owned=()=>readdirSync('/proc').filter(name=>/^\d+$/.test(name)).map(stat).filter(p=>p&&p.pid!==sid&&p.sid===sid&&p.state!=='Z')
const kill=(p,signal)=>{const now=stat(p.pid);if(now&&now.sid===sid&&now.start===p.start)try{process.kill(p.pid,signal)}catch(error){if(error.code!=='ESRCH')throw error}}
const fd=openSync(spec.log,'wx'),child=spawn(spec.command[0],spec.command.slice(1),{cwd:spec.cwd,env:process.env,stdio:['ignore',fd,fd]});closeSync(fd)
let finished=false,stopped=false,native=null,terminating=false
const targetDone=new Promise(resolve=>{child.once('error',error=>{native=null;finished=true;resolve()});child.once('exit',code=>{native=code;finished=true;resolve()})})
async function terminate(){
  if(terminating)return;terminating=true
  let complete=false,remaining=null
  try{
    const end=Date.now()+5000
    do{const processes=owned();for(const p of processes)kill(p,'SIGSTOP');for(const p of processes.reverse())kill(p,'SIGKILL');await new Promise(r=>setTimeout(r,20));remaining=owned().length;if(remaining===0){complete=true;break}}while(Date.now()<end)
    await Promise.race([targetDone,new Promise((_,reject)=>setTimeout(()=>reject(Error("Target reap deadline exceeded")),1000))])
  }finally{
    writeFileSync(spec.result,JSON.stringify({nonce:spec.nonce,state:'LINUX_SESSION',nativeExitCode:native,stopRequested:stopped,remaining,complete})+'\n',{flag:'wx'})
  }
  process.exitCode=complete&&!stopped&&Number.isInteger(native)?native:1
}
const timer=setInterval(()=>{if(existsSync(spec.stop)){stopped=true;clearInterval(timer);terminate().catch(()=>{process.exitCode=1})}else if(finished){clearInterval(timer);terminate().catch(()=>{process.exitCode=1})}},20)
process.on('SIGTERM',()=>{stopped=true;clearInterval(timer);terminate().catch(()=>{process.exitCode=1})})
