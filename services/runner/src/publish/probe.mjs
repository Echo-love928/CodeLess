import { lookup } from 'node:dns/promises'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { deploymentUrl, publicationSite, publicAddress } from './policy.mjs'

export function createPublicProbe({ publicOrigin, platformOrigin, previewOrigin }) {
  const { site } = publicationSite(publicOrigin, platformOrigin, previewOrigin)
  return async (receipt, deadline = Date.now() + 30000) => {
    const remaining = () => deadline - Date.now()
    if (!Number.isFinite(deadline) || remaining() <= 3000 || remaining() > 30000) throw new Error('DEPLOYMENT_TIMEOUT')
    receipt = structuredClone(receipt)
    if (receipt.url !== deploymentUrl(receipt.deploymentId, site)) throw new Error('probe deployment binding rejected')
    let dnsTimer
    const records = await Promise.race([
      lookup(new URL(receipt.url).hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error('public DNS timeout')), Math.min(3000, remaining() - 3000)) }),
    ]).finally(() => clearTimeout(dnsTimer))
    if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error('public DNS rejected')
    if (remaining() <= 3000) throw new Error('DEPLOYMENT_TIMEOUT')
    const name = 'codeless-publish-probe-' + randomUUID()
    const directory = fileURLToPath(new URL('.', import.meta.url))
    const args = ['run', '--name', name, '--rm', '-i', '--read-only', '--user', '10001:10001',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '32', '--memory', '128m', '--cpus', '0.5',
      '--mount', `type=bind,source=${directory},target=/probe,readonly`,
      'node:24.16.0-bookworm-slim', 'node', '/probe/probe-worker.mjs']
    // Worker policy is standalone; it does not mount API source, platform secrets or Docker socket.
    return new Promise(done => {
      const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      let output = '', overflow = false, timedOut = false, cleanup = null
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify({ url: receipt.url, address: records[0].address, files: receipt.files, deadline: deadline - 3000 }))
      child.stderr.resume()
      child.stdout.on('data', chunk => {
        if (output.length + chunk.length > 512 * 1024) { overflow = true; child.kill() }
        else output += chunk
      })
      // One A deadline includes DNS, container startup, requests and owned-container cleanup.
      const timer = setTimeout(() => { timedOut = true; child.kill() }, Math.max(1, remaining() - 2500))
      child.once('error', () => {})
      child.once('close', async (exitCode, signal) => {
        clearTimeout(timer)
        // Also reclaim a container whose docker client died before --rm ran.
        cleanup = await new Promise(resolve => {
          const remover = spawn('docker', ['rm', '-f', name], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
          const cleanupTimer = setTimeout(() => { remover.kill(); resolve(false) }, Math.max(1, Math.min(2000, remaining() - 250)))
          let error = ''; remover.stderr.on('data', bytes => { error = (error + bytes).slice(0, 1000) })
          remover.once('error', () => { clearTimeout(cleanupTimer); resolve(false) })
          remover.once('close', code => { clearTimeout(cleanupTimer); resolve(code === 0 || error.includes('No such container')) })
        })
        let result
        try { result = JSON.parse(output) } catch { result = null }
        if (exitCode !== 0 || signal !== null || timedOut || overflow || cleanup !== true || result?.status !== 'PASSED')
          done({ status: 'FAILED', failure: timedOut ? 'PROBE_TIMEOUT' : result?.failure ?? 'PROBE_FAILED',
            exitCode, signal, cleanup, observations: result?.observations ?? null })
        else done({ ...result, exitCode, signal, cleanup })
      })
    })
  }
}
