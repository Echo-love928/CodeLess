// D21-A report: derived only from the raw files of one batch directory.
//   node scripts/eval/report.mjs <batchDir> --write   writes report.json and report.md
//   node scripts/eval/report.mjs <batchDir> --check   recomputes both and exits 1 on any difference
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CATEGORIES, canonical, plannedSamples, sha256, validateFrozen } from './lib.mjs'
import { consistency, faultSummary, requirementSummary } from './ledger.mjs'

export const GENERATOR = 'scripts/eval/report.mjs#v2'

/** Loads one batch. Every file read is listed with its digest; planned samples come from the batch's frozen copies. */
export function loadBatch(batchDir) {
  const dir = resolve(batchDir)
  const inputs = {}
  const read = (relativePath, required = false) => {
    const path = join(dir, relativePath)
    if (!existsSync(path)) {
      if (required) throw new Error('missing ' + relativePath)
      return null
    }
    const bytes = readFileSync(path)
    inputs[relativePath] = sha256(bytes)
    return JSON.parse(bytes.toString('utf8'))
  }
  const batch = read('batch.json', true)
  const frozen = {}
  for (const key of ['requirements', 'faults', 'runConfig']) {
    const value = read('frozen/' + key + '.json', true)
    if (inputs['frozen/' + key + '.json'] !== batch.frozen[key].sha256) throw new Error('frozen copy digest differs: ' + key)
    frozen[key] = { value }
  }
  validateFrozen(frozen.requirements.value, frozen.faults.value)
  const planned = plannedSamples(frozen).filter((sample) => batch.samples.some((b) => b.id === sample.id))
  if (planned.map((s) => s.id).join() !== batch.samples.map((s) => s.id).join()) throw new Error('batch sample plan differs from its frozen copies')
  const items = planned.map((sample) => ({
    planned: sample,
    spec: read('samples/' + sample.id + '/spec.json'),
    invocation: read('samples/' + sample.id + '/invocation-result.json'),
    record: read('samples/' + sample.id + '/record.json')
  }))
  const complete = read('batch-complete.json')
  return { dir, batch, frozen, items, complete, inputs }
}

export function buildReport(batchDir) {
  const { batch, items, complete, inputs } = loadBatch(batchDir)
  const requirementItems = items.filter((item) => item.planned.kind === 'REQUIREMENT')
  const faultItems = items.filter((item) => item.planned.kind !== 'REQUIREMENT')
  const calls = items.flatMap((item) => item.record?.modelCalls ?? [])
  const foreign = calls.filter((call) => call.provider !== batch.provider.id || (batch.mode === 'REAL' && call.model !== batch.provider.model))
  return {
    schemaVersion: 1,
    generator: GENERATOR,
    batchId: batch.batchId,
    mode: batch.mode,
    realModelEvidence: batch.mode === 'REAL' && foreign.length === 0,
    statistics: batch.mode === 'REAL' ? 'REAL_MODEL' : 'DETERMINISTIC_MOCK_HARNESS_DRY_RUN_NOT_MODEL_QUALITY',
    provider: batch.provider,
    callsFromOtherProviders: foreign.length,
    platformCommit: batch.git.head,
    isolation: batch.isolation,
    frozen: Object.fromEntries(Object.entries(batch.frozen).map(([key, value]) => [key, value.sha256])),
    completion: { plannedSamples: items.length, invocations: items.filter((i) => i.invocation).length,
      records: items.filter((i) => i.record).length, batchComplete: Boolean(complete),
      credentialOccurrences: complete?.secretScan?.credentialOccurrences ?? null },
    requirements: requirementItems.length ? requirementSummary(requirementItems, CATEGORIES) : null,
    faults: faultItems.length ? faultSummary(faultItems) : null,
    consistency: consistency(items),
    inputs: Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b)))
  }
}

const pct = (value) => (value === null ? '未知' : (value * 100).toFixed(1) + '%')
const tokens = (usage) => usage.complete ? String(usage.totalTokens) : usage.callRecord === 'MISSING' ? '未知（无调用记录）'
  : '≥' + usage.knownTotalTokens + '（' + usage.unknownCalls + ' 次未知' +
  (usage.samplesWithoutTaskRecord ? '，' + usage.samplesWithoutTaskRecord + ' 个样本无任务记录' : '') +
  (usage.samplesWithoutCallRecord ? '，' + usage.samplesWithoutCallRecord + ' 个样本无调用记录' : '') + '）'
const ms = (value) => (value === null ? '未知' : (value / 1000).toFixed(1) + ' s')
const count = (value) => (value === null ? '未知' : String(value))
// A READY task row whose harness or sample JVM failed is shown as such: it is not a success.
const final = (s) => (s.finalSuccess ? 'READY' : s.outcome === 'READY' ? 'READY（不计成功）' : s.outcome)
const cell = (value) => (value === null || value === undefined ? '—' : String(value).replaceAll('|', '\\|'))

export function renderMarkdown(report) {
  const lines = [`# D21-A 生成评测报告 ${report.batchId}`, '',
    `由 \`${report.generator}\` 从本目录原始记录生成；\`node scripts/eval/report.mjs <batchDir> --check\` 可复算。`, '',
    `- 模式：**${report.mode}**（${report.statistics}）；真实模型证据：${report.realModelEvidence ? '是' : '否'}`,
    `- Provider：${report.provider.id} / ${report.provider.model}；其他 provider 调用：${report.callsFromOtherProviders}`,
    `- 平台提交：\`${report.platformCommit}\`（${report.isolation}）`,
    `- 冻结集：requirements ${report.frozen.requirements}，faults ${report.frozen.faults}，run-config ${report.frozen.runConfig}`,
    `- 完成度：计划 ${report.completion.plannedSamples}，已启动 ${report.completion.invocations}，原始记录 ${report.completion.records}，批次完成 ${report.completion.batchComplete ? '是' : '否'}，凭据出现次数 ${cell(report.completion.credentialOccurrences)}`, '']
  const r = report.requirements
  if (r) {
    lines.push('## 9 个需求（分母固定为冻结计划）', '',
      `- 首轮成功（首次真实构建+浏览器即通过、0 次修复）：**${r.firstPass.count}/${r.denominator}**（${pct(r.firstPass.rate)}）`,
      `- 3 轮内最终成功（平台 READY）：**${r.finalSuccess.count}/${r.denominator}**（${pct(r.finalSuccess.rate)}）；目标 ≥${r.target.finalSuccessAtLeast}/${r.target.of}：${r.target.met ? '达到' : '未达到'}（基线目标，不是既有成绩）`,
      `- 需求级最终成功（叠加 D21-B 行为断言）：${r.behaviorAssertions.status}，当前为未知，不计为成功`,
      `- 缺失记录：${r.missingRecords.length ? r.missingRecords.join(', ') : '无'}；harness 错误：${r.harnessErrors.length ? r.harnessErrors.join(', ') : '无'}；样本进程异常（不计成功）：${r.executionFailures.length ? r.executionFailures.map((f) => f.sampleId + ' ' + f.execution).join(', ') : '无'}`,
      `- 修复：共 ${r.repairs.totalRounds} 轮，${r.repairs.samplesWithRepairs} 个样本发生修复`,
      `- 实际 token：${tokens(r.usage)}；输入 ${cell(r.usage.inputTokens)} / 输出 ${cell(r.usage.outputTokens)}；已知下限 输入 ${r.usage.knownInputTokens} / 输出 ${r.usage.knownOutputTokens}；缓存命中（已含在输入中）${cell(r.cacheHitInputTokens)}`,
      `- 运行时预算计费（含保守估算，非实际用量）：${count(r.charged.chargedTokens)}，估算调用 ${count(r.charged.estimatedCalls)}${r.charged.samplesWithoutJournal ? '（' + r.charged.samplesWithoutJournal + ' 个样本无可读任务日志）' : ''}`,
      `- 模型请求 ${count(r.modelCalls)}，工具槽 ${count(r.toolSlots)}；耗时中位数 ${ms(r.duration.medianMs)}，最大 ${ms(r.duration.maxMs)}（已知 ${r.duration.knownSamples}，未知 ${r.duration.unknownSamples}）`,
      `- 失败类型：${Object.entries(r.failureTypes).filter(([, n]) => n).map(([t, n]) => t + '×' + n).join('，') || '无'}`, '',
      '| 需求 | 类别 | 任务 ID | 首次验证 | 最终 | 修复轮 | 失败类型 / 代码 | 模型请求 | 实际 token | 耗时 |',
      '| --- | --- | --- | --- | --- | ---: | --- | ---: | --- | ---: |')
    for (const s of r.samples) {
      lines.push(`| ${s.sampleId} | ${s.category} | ${cell(s.taskId)} | ${s.firstVerify} | ${final(s)} | ${cell(s.repairRounds)} | ${s.failure ? s.failure.type + ' / ' + cell(s.failure.code) : '—'} | ${count(s.modelCalls.total)} | ${tokens(s.usage)} | ${ms(s.durationMs)} |`)
    }
    lines.push('')
  }
  const f = report.faults
  if (f) {
    lines.push('## 故障集（与 9 个需求分开统计）', '',
      `- 代码故障按预期修复：**${f.code.passed}/${f.code.denominator}**；环境故障按预期停止：**${f.environment.passed}/${f.environment.denominator}**`,
      `- 故障集实际 token：${tokens(f.usage)}`, '')
    for (const result of f.results) {
      lines.push(`### ${result.faultId}（${result.class} / ${result.injection}，基于 ${result.baseRequirement}）：${result.status}`, '',
        `任务 ${cell(result.sample.taskId)}；最终 ${final(result.sample)}；修复轮 ${cell(result.sample.repairRounds)}；失败 ${result.sample.failure ? result.sample.failure.type + ' / ' + cell(result.sample.failure.code) : '—'}`, '',
        '| 检查 | 期望 | 实际 | 结果 |', '| --- | --- | --- | --- |')
      for (const c of result.checks) lines.push(`| ${c.check} | ${cell(JSON.stringify(c.expected))} | ${cell(JSON.stringify(c.actual))} | ${c.pass ? '通过' : '**未通过**'} |`)
      lines.push('')
    }
  }
  lines.push('## 一致性核对', '', report.consistency.length ? '以下字段评测计算与平台日志计量不一致：' : '评测计算的模型请求数、工具槽与预算计费均与平台日志计量一致。', '')
  for (const note of report.consistency) lines.push(`- ${note.sampleId} ${note.field}: 评测 ${note.evaluation} / 平台 ${note.platform}`)
  lines.push('', '## 输入文件摘要', '', ...Object.entries(report.inputs).map(([path, digest]) => `- \`${path}\` ${digest}`), '')
  return lines.join('\n')
}

export function writeReport(batchDir) {
  const report = buildReport(batchDir)
  writeFileSync(join(resolve(batchDir), 'report.json'), canonical(report))
  writeFileSync(join(resolve(batchDir), 'report.md'), renderMarkdown(report))
  return report
}

/** T4: the committed report must equal a fresh computation from the raw records. */
export function checkReport(batchDir) {
  const report = buildReport(batchDir)
  const problems = []
  for (const [name, expected] of [['report.json', canonical(report)], ['report.md', renderMarkdown(report)]]) {
    const path = join(resolve(batchDir), name)
    if (!existsSync(path)) problems.push(name + ' missing')
    else if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== expected) problems.push(name + ' differs from recomputation')
  }
  return { ok: problems.length === 0, problems, report }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [dir, flag] = process.argv.slice(2)
  if (!dir) { console.error('usage: node scripts/eval/report.mjs <batchDir> [--write|--check]'); process.exit(2) }
  if (flag === '--write') {
    const report = writeReport(dir)
    console.log(JSON.stringify({ batch: report.batchId, written: ['report.json', 'report.md'] }))
  } else if (flag === '--check') {
    const result = checkReport(dir)
    console.log(JSON.stringify({ batch: result.report.batchId, ok: result.ok, problems: result.problems }))
    process.exitCode = result.ok ? 0 : 1
  } else {
    const report = buildReport(dir)
    console.log(JSON.stringify({ batch: report.batchId, mode: report.mode, requirements: report.requirements &&
      { firstPass: report.requirements.firstPass, finalSuccess: report.requirements.finalSuccess, usage: report.requirements.usage },
      faults: report.faults && { code: report.faults.code, environment: report.faults.environment } }, null, 2))
  }
}
