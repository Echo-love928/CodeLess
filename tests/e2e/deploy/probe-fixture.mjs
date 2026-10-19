// TEST ONLY. Docker --internal network, no internet. Production worker still rejects this private IP.
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { inspectTarget } from '/probe/probe-worker.mjs'

let input = ''
for await (const chunk of process.stdin) input += chunk
const result = await inspectTarget(JSON.parse(input), (options, listener) => https.request({ ...options, ca: readFileSync('/certs/server.pem') }, listener))
console.log(JSON.stringify(result))
process.exitCode = result.status === 'PASSED' ? 0 : 1
