// Explicit MOCK platform-response fixture, never evidence of a real edit/model.
import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fixture, changeFixture } from '../../../evals/browser/fixture.mjs'
import { manifest, sha } from '../../../evals/browser/core.mjs'
import { edits } from '../../../evals/edit/cases.mjs'

export async function mockRecord(t, id = 'EDIT-01') {
  const directory = await mkdtemp(join(tmpdir(), 'd21-edit-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const source = join(directory, 'before'), candidate = join(directory, 'after')
  await fixture(source); await cp(source, candidate, { recursive: true })
  const edit = edits.find(e => e.id === id)
  await changeFixture(candidate, edit)
  const app = randomUUID(), generation = randomUUID(), taskId = randomUUID()
  const snapshot = async (directory, task, number) => {
    const m = await manifest(directory), version = { id: randomUUID(), applicationId: app, taskId: task, number,
      sourceDigest: m.digest, buildId: randomUUID(), status: 'VERIFIED' }
    const artifactFiles = [{ path: 'index.html', bytes: Buffer.byteLength('MOCK artifact'), digest: sha('MOCK artifact') }]
    const artifact = { files: artifactFiles, digest: sha(JSON.stringify(artifactFiles)) }
    return { version, snapshot: { versionId: version.id, status: version.status, sourceDigest: m.digest, files: m.files,
      validation: { status: 'VERIFIED', sourceDigest: m.digest, artifact, artifactDigest: artifact.digest,
        report: { status: 'VERIFIED', sourceDigest: m.digest, buildId: version.buildId, buildStatus: 'SUCCEEDED', exitCode: 0,
          verificationId: randomUUID(), verificationStatus: 'PASSED', artifactDigest: artifact.digest, failureCode: null } } },
      files: await Promise.all(m.files.map(async f => ({ ...f, versionId: version.id, sourceDigest: m.digest, content: await readFile(join(directory, f.path), 'utf8') }))) }
  }
  const before = await snapshot(source, generation, 1), after = await snapshot(candidate, taskId, 2)
  const names = { HomePage: 'home-page', TasksPage: 'tasks-page', CatalogPage: 'catalog-page', WorkCard: 'work-card' }
  const mapping = { protocol: 'codeless-component-mapping/v1', versionId: before.version.id, sourceDigest: before.version.sourceDigest,
    components: before.snapshot.files.filter(f => f.path.endsWith('.vue')).map(f => ({ sourceFile: f.path, fileDigest: f.digest,
      componentId: names[f.path.split('/').at(-1).replace('.vue', '')], scope: 'SOURCE_FILE' })), disabled: [] }
  before.mapping = mapping
  const task = { id: taskId, applicationId: app, status: 'READY', prompt: edit.prompt, failureCode: null }
  const batch = { batchId: 'synthetic-mock-edit-records', mode: 'MOCK', provider: { id: 'deterministic-mock' } }
  const record = { schemaVersion: 1, batchId: batch.batchId, mode: 'MOCK', sampleId: edit.id,
    collection: { kind: 'PLATFORM_API', fixture: true }, before, after,
    edit: { task, baseVersionId: before.version.id, source: { type: 'COMPONENT', componentId: edit.componentId,
      sourceFile: edit.file, sourceDigest: before.version.sourceDigest, versionId: before.version.id } },
    modelCalls: { page: 0, size: 100, totalItems: 1, totalPages: 1, items: [{ id: randomUUID(), taskId, applicationId: app,
      provider: 'deterministic-mock', model: 'fixture', stage: 'GENERATE', status: 'SUCCEEDED', usage: 'KNOWN', inputTokens: 0, outputTokens: 0, totalTokens: 0 }] } }
  return { directory, source, candidate, edit, record, batch, mapping,
    base: { record: { task: { id: generation, applicationId: app } }, version: before.version } }
}

export async function writeBundle(directory, batch, records) {
  await mkdir(directory, { recursive: true })
  const entries = []
  for (const record of records) { const raw = JSON.stringify(record); await writeFile(join(directory, record.sampleId + '.json'), raw); entries.push({ sampleId: record.sampleId, digest: sha(raw) }) }
  await writeFile(join(directory, 'index.json'), JSON.stringify({ schemaVersion: 1, batchId: batch.batchId, mode: batch.mode, records: entries }))
}

export async function refreshSnapshot(value, directory) {
  const m = await manifest(directory)
  value.version.sourceDigest = m.digest
  value.snapshot.sourceDigest = m.digest; value.snapshot.files = m.files
  value.snapshot.validation.sourceDigest = m.digest; value.snapshot.validation.report.sourceDigest = m.digest
  value.files = await Promise.all(m.files.map(async f => ({ ...f, versionId: value.version.id,
    sourceDigest: m.digest, content: await readFile(join(directory, f.path), 'utf8') })))
}
