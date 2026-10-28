// Developer-side SSH transport. Never copies connection files or prints destinations/identities.
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function connection(file) {
  const tokens = [...readFileSync(file, 'utf8').trim().matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3]);
  if (!/^(?:.*[\\/])?ssh(?:\.exe)?$/i.test(tokens.shift())) throw Error('Expected SSH connection command');
  const args = []; let target = null;
  while (tokens.length) {
    const t = tokens.shift();
    if (['-i', '-p', '-l'].includes(t)) { const value = tokens.shift(); if (!value) throw Error('Missing SSH option'); args.push(t, value); }
    else if (!t.startsWith('-') && target === null) target = t;
    else throw Error('Unsupported SSH connection option');
  }
  if (!target || !/^([A-Za-z0-9_.-]+@)?[A-Za-z0-9.-]+$/.test(target)) throw Error('Invalid SSH destination');
  if (args.includes('-i') && !existsSync(args[args.indexOf('-i') + 1])) throw Error('SSH identity file unavailable');
  return ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', ...args, target];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = connection(process.env.CODELESS_CAPACITY_SSH_CONFIG_FILE);
  const script = "python3 -c 'import json,os,platform; print(json.dumps(dict(connected=True,cpu=os.cpu_count(),memoryBytes=os.sysconf(\"SC_PAGE_SIZE\")*os.sysconf(\"SC_PHYS_PAGES\"),kernel=platform.release())))'";
  const r = spawnSync('ssh', [...args, script], {encoding: 'utf8', windowsHide: true, timeout: 20000});
  if (r.status === 0) process.stdout.write(r.stdout);
  else console.log(JSON.stringify({connected: false, exitCode: r.status, error: r.error?.code ?? 'SSH_FAILED'}));
  process.exit(r.status ?? 1);
}
