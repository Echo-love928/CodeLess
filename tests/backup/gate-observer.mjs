// Observe native child exits without changing commands, results or gate policy.
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
const original = cp.spawnSync;
cp.spawnSync = function (...args) {
  const result = original.apply(this, args);
  const stage = args[1]?.find(value => /^verify:(static|api|runner|e2e)$/.test(value));
  if (stage && process.env.D23_STAGE_EXITS) appendFileSync(process.env.D23_STAGE_EXITS,
    JSON.stringify({ stage, exitCode: result.status, signal: result.signal, error: result.error?.code ?? null }) + '\n');
  return result;
};
syncBuiltinESMExports();
