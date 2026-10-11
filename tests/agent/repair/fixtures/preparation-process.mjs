import {spawn} from 'node:child_process'
import {writeFileSync} from 'node:fs'
const [mode,output]=process.argv.slice(2)
if(!['normal','nonzero','blocked'].includes(mode)||!output)throw Error('Invalid preparation lifecycle fixture')
const child=spawn(process.execPath,['-e',`setTimeout(()=>process.exit(0),${mode==='blocked'?30000:200})`],{stdio:'ignore'})
writeFileSync(output,JSON.stringify({parent:process.pid,child:child.pid}))
if(mode==='blocked')setTimeout(()=>process.exit(0),30000)
else child.on('exit',()=>process.exit(mode==='normal'?0:7))
