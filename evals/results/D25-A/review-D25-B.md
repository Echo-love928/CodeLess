# D25-A 对 D25-B 的只读审查

## 2026-10-30 修复复审：6ecf3f5

复审 [PR #81](https://github.com/Echo-love928/CodeLess/pull/81) 精确提交 `6ecf3f5050c47e24ffe211a32e60460a2a6c033d`，仅检查上次审查后的变更和受影响范围。**模式校验代码阻塞已解除；真实验收仍 HOLD，不批准。** 未发送评论或 GitHub 正式 review。

- **阻塞问题**：六项真实编辑、公网页面/封面/下载仍 `NOT_EXECUTED`，结构结果 `executed=0, passed=0, acceptance=null`。B 如实记录缺原运行时/有效会话；不能以修复校验器、fixture 或六项 CI success 解除真实验收阻塞。原 A 数据导出仍保留，原设备恢复/重新登录后需重新预检并采集终态。
- **建议**：真实执行时固定产品候选、保留 01→02→03→05 的依赖关系，04/06 独立；每次成功后重探最新版本。完成后只复查新增真实证据和受影响范围。本方 F1/F2/F3 正在独立修复及新批次复评，旧 7/9、1/3 保留为历史。
- **已核验内容**：`evals/edit-results/validate.mjs:14` 对全部九行校验 `row.mode === index.mode`；`tests/eval/d25-b.test.mjs:30` 起覆盖六项完整 MOCK 成功行、九行任意混合及缺失/未知模式，包含合法成功的正对照。A 从精确 Git 归档独立运行 **6/6、exit 0**；原 A 反例 **exit 0、rejected=true**。文件记录实际字节摘要及 CRLF 与 Git LF 的等价关系，不冒称原字节相同，见 `followup-2026-10-30/peer-unit.json`、`peer-counterexample.json`。修复提交自身六项远端检查全部 success，快照见 `peer-checks.json`（2026-10-30T02:25:40Z）。

增量只涉及校验器、专项测试和任务文档/证据；未改生产、公共契约、锁、CI、权限或删除断言。演示口径已更新 A 候选与 HOLD，未发现新增代码阻塞或公开差异中的秘密。两次局部归档缺依赖的启动失败已识别，补齐完整归档后才取得上述专项结果；不算产品失败或测试通过。

以下保留 2026-10-29 对旧提交的原始审查，不将已关闭的模式缺陷继续当作当前阻塞。

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
