import {spawn} from 'node:child_process'
import {writeFileSync} from 'node:fs'
const [mode,marker,parent]=process.argv.slice(2)
if(mode==='branch'){
  const leaf=spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{stdio:'ignore'})
  writeFileSync(marker,JSON.stringify({root:Number(parent),branch:process.pid,leaf:leaf.pid}))
  process.send?.('READY')
  setTimeout(()=>{},30000)
}else{
  if(!['normal','nonzero','blocked'].includes(mode))throw Error('Invalid isolated fixture')
  const branch=spawn(process.execPath,[process.argv[1],'branch',marker,String(process.pid)],{stdio:['ignore','ignore','ignore','ipc']})
  if(mode==='blocked')setTimeout(()=>{},30000)
  else {const deadline=setTimeout(()=>process.exit(1),8000);branch.once('message',message=>{if(message==='READY'){clearTimeout(deadline);process.exit(mode==='normal'?0:7)}})}
}
