// Print a reviewable request using a saved owner-only component-selection response.
// No HTTP writes, model invocations, source paths or publish flags in the payload.
import { readFile } from 'node:fs/promises'
import { edits, requestFor } from './cases.mjs'
const [id, path] = process.argv.slice(2)
const edit = edits.find(edit => edit.id === id)
if (!edit || !path) throw new Error('Usage: node evals/edit/requests.mjs EDIT-01 <selection.json>')
console.log(JSON.stringify(requestFor(edit, JSON.parse(await readFile(path, 'utf8'))), null, 2))
