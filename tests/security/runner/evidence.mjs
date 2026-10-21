import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
export async function evidence(name, result) {
  const root = resolve(process.env.CODELESS_SECURITY_EVIDENCE_DIR ?? '.local-data/d19-b/results')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, name + '.json'), JSON.stringify(result, null, 2))
}
