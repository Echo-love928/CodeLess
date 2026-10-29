# D25-A 对 D25-B 的只读审查

对象：[PR #81](https://github.com/Echo-love928/CodeLess/pull/81)，精确 HEAD `bd6188ffef5cb1d2ab5d05a14d94f5e8e71a58ac`，产品候选 `5de2e6cf995c95ee91a1f9dc40403654df0af3de`。公开差异快照 `peer-pr81.json`；私有精确 Git 归档 `.local-data/d25-a/peer-bd6188f/`。未修改 B 工作，未提交远端审查或批准。

## 阻塞问题

1. **真实验收证据缺失**。`evals/edit-results/D25-B/index.json:8` 起的六项编辑和三项交付均 `NOT_EXECUTED/null`；`docs/handoffs/D25-B.md:19` 起明确真实 ≥5/6、公网页面、封面、下载未完成。fixture 6/6 和本地 HTTPS 平台链不解除它。复现：在精确归档根运行 `node evals/edit-results/validate.mjs evals/edit-results/D25-B/index.json`，exit 0、executed=0、acceptance=null。需要同候选原始运行时、真实编辑及发布/封面/下载采集后复核；本项是验收阻塞，B 没有虚报通过。
2. **P2：结构校验器允许 MOCK 行计入 REAL 成功**。`evals/edit-results/validate.mjs:12` 的逐行校验未核对 `row.mode === index.mode`，`:35` 起按 passed 计分。保持顶层 REAL，把六项行显式标为 MOCK，填写合成成功标记后，返回 passed=6、acceptance=true。复现：`node tests/eval/d25-a-peer-repro.mjs .local-data/d25-a/peer-bd6188f <新输出路径>`，预期拒绝，实测 exit 1，见 `peer-mode-counterexample-repeat.json`。这不是要求结构校验器证明文件真实性，而是已有 mode 字段的一致性缺口；建议逐行拒绝非 REAL 模式，并补反例。当前 B 原始空值仍保持空值，未被本反例改写。

## 建议

- `docs/handoffs/D25-B.md` 的“无 D25-A 候选”是其采集时事实；本卡交付后更新引用，不将旧阻塞快照当作永久结论。
- A 的生成执行提交与 B 产品候选不同；后端/runner/prompts/templates 字节一致，B 另含 PreviewPanel 修复。最后启用功能的 PR 应在当前 main 组合上完成联调，不用二者单独 CI 推断组合成功。
- 演示脚本已完成与实际录屏未执行的表述清楚，继续保留两者区别。

## 已核验内容

- 差异仅新增评测索引、文档、图片与专项测试，没有生产模块、共享契约、锁文件、CI 或权限变化；未发现削弱已有测试的改动。公开文本/差异中未发现密钥；未取得其私有完整日志，不能替其证明私有日志无秘密。
- 独立在精确归档运行 `node --test tests/eval/d25-b.test.mjs`，exit 0、4/4；结构校验 exit 0、真实 acceptance=null。证据 `peer-independent-tests.json`。
- 精确 HEAD 六项远端 static/api/runner/e2e/infra-preflight/ci-gate 均 success，见 `peer-checks-bd6188f.json`，没有借用旧提交检查。本地聚合取消保持 CANCELLED/UNKNOWN，没有伪装为通过。
- `docs/demo/D25-B.md` 明确区分实时、历史、受控错误；未把 MOCK 说成真实模型质量或 localhost 说成公网。`docs/evidence/D25-B/issues.md` 保留全部已知失败、未知与未执行项。
- `full-product.json` 和 fixture 报告为 B 的执行证据，本方检查其版本/模式/结果字段；没有把 B 的私有执行冒称 A 独立实测。在线编辑权限、历史版本保护和公网交付仍待真实验证。
- `node tests/eval/d25-a-peer-evidence.mjs <精确归档> <新输出>` exit 0，检查两用户应用→编辑版本→发布→导出关联、三个导出的内部摘要一致性、16 个 404 越权拒绝、409 旧版本/产物错配及失败保留旧版本字段。`peer-evidence-check.json` 只证明所提交 MOCK 报告的结构关联，没有原 ZIP/私有日志/公网验收的独立证明。

结论：保持草稿/HOLD，未批准。作者修复模式校验后只复查该差异及受影响用例；真实验收证据补齐后再审相应链路。
