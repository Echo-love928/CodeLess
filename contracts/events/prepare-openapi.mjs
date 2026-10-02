import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = resolve(import.meta.dirname, '../..');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
export const basePath = resolve(root, 'contracts/openapi.v0.json');
export const patch = read(resolve(root, 'contracts/events/openapi.patch.json'));

// Preview this narrowly scoped RFC 6902 patch without mutating the maintained source.
export function compose(base = read(basePath)) {
  const result = structuredClone(base);
  for (const operation of patch) {
    const tokens = operation.path.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'));
    const key = tokens.pop();
    let parent = result;
    for (const token of tokens) parent = parent?.[token];
    if (!parent || !Object.hasOwn(parent, key)) throw new Error(`Patch target missing: ${operation.path}`);
    if (operation.op === 'test') {
      if (!isDeepStrictEqual(parent[key], operation.value)) throw new Error(`Patch precondition failed: ${operation.path}`);
    } else if (operation.op === 'replace') parent[key] = structuredClone(operation.value);
    else throw new Error(`Unsupported patch operation: ${operation.op}`);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(root, '.local-data/d06-events-contract/openapi.preview.json');
  const preview = compose();
  // Relative schema refs belong to contracts/, not the ignored preview directory.
  function rebase(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string' && value.$ref.startsWith('./')) {
      value.$ref = relative(dirname(output), resolve(dirname(basePath), value.$ref)).replaceAll('\\', '/');
    }
    for (const child of Object.values(value)) rebase(child);
  }
  rebase(preview);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(preview, null, 2)}\n`);
  console.log(`Preview only; shared OpenAPI is unchanged: ${output}`);
}
