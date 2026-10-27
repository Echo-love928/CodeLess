# D21 真实验收，2026-10-24

**结果：未通过，不批准、不合并。** 用户授权执行真实验收后，使用 A `0d831a7730c7df542961553a2e68e41bf84b858e` 的原执行器、冻结需求与预算完成两个完整批次。B 在干净提交 `3026a08b2466b240e336e8434480c108742af74e` 独立重放主批次，需求通过 **2/9**，未达到 ≥8/9；六项真实编辑均未执行，≥5/6 为未知。代码故障修复 **0/3**，环境故障停止 **2/2**。

## 主批次

批次 `2026-10-24T13-47-29Z-real-103b5585`，REAL，deepseek/deepseek-flash。短路径、独立 detached A checkout，执行 `run-batch.mjs --mode real --in-place`；IN_PLACE 如实记载于批次，指专用 checkout 内执行，不是 main 或 A/B 作者分支。14/14 样本各执行一次，每个样本独立 JVM/数据库/工作目录；没有子集重跑、修改提示词、预算、TLS 或断言。

| 需求 | 任务 ID | 平台终态 | B 行为判定 / 平台失败码 |
| --- | --- | --- | --- |
| SHOW-01 | a5e3ec52-c4a9-43ec-bc57-5372e9ff7eaa | FAILED | AGENT_MODEL_BUDGET_EXCEEDED |
| SHOW-02 | 199f2723-c614-48c5-962d-932b347bcce3 | READY | PASSED |
| SHOW-03 | dab36bbc-2157-4e36-818d-39d52eebedad | FAILED | AGENT_MODEL_BUDGET_EXCEEDED |
| TASK-01 | 48f1f725-ed69-46ce-9067-9e9084f12b8b | FAILED | AGENT_ACTION_TIMEOUT |
| TASK-02 | 32eaceff-45b9-43ac-85df-f03f500b867e | READY | PASSED |
| TASK-03 | 9bb3c095-cd53-47e9-a015-0e95cef8dcb9 | FAILED | AGENT_ACTION_TIMEOUT |
| CAT-01 | a9978317-e1a7-4ed4-b3dc-952cff45ba60 | FAILED | AGENT_ACCEPTANCE_INVALID |
| CAT-02 | 489afbd0-a516-490c-a753-77868f82883e | FAILED | AGENT_MODEL_BUDGET_EXCEEDED |
| CAT-03 | ace53db6-2923-4e05-a312-41b8483a3da0 | FAILED | MODEL_INVALID_RESPONSE |

平台首轮与最终均2/9；B 校验原 task/version/build/verification/source 摘要，重新构建两个 READY 版本，独立 Chromium 行为断言均通过。其余七项保留 PLATFORM_FAILURE，没有把未进入浏览器判定改写为行为错误。B 重放额外模型请求、token 均为0。

预算错误是平台预算门禁的拒绝，包含调用前额度预约，不能据此声称每项已实际消费50,000 token。动作超时保留原控制类失败及其原始记录，不推断为网络故障。主批次九个需求没有 MODEL_NETWORK；FAULT-ENV-02 的网络故障为明确注入的拒绝端点。

| 故障 | 任务 ID | 结果 | 观察 |
| --- | --- | --- | --- |
| FAULT-CODE-01 | fd38c6f1-0355-4794-ab74-80bc218a960f | FAILED | 进入2轮修复，最终预算拒绝 |
| FAULT-CODE-02 | 7fac2203-e2f8-4398-be8a-d33a66f2ec99 | FAILED | 进入1轮修复，最终 AGENT_MODEL_PROTOCOL_INVALID |
| FAULT-CODE-03 | 4ed629e9-60a2-4d8a-b06e-47f24f56550c | FAILED | 进入1轮修复，最终预算拒绝 |
| FAULT-ENV-01 | cc878e2e-d6d9-4809-9248-a10cee06990f | PASSED | 容器 CLI 不可用后停止；0轮修复、故障后0次文件工具调用 |
| FAULT-ENV-02 | 3330f09f-f407-4e8d-aa13-e5f33674bc55 | PASSED | 注入端点拒绝；只调用1次、0轮修复、usage UNKNOWN |

故障判定检查记录在原 `report.json` 中；3个 CODE 仍是失败，不能用“进入了修复”充当“修复成功”。

## 真实编辑

六项均 NOT_EXECUTED，passed=null，没有编辑任务或前后版本，不能计0/6成功率或冒充已执行失败。

- EDIT-01/02/03/05 依赖 SHOW-01，EDIT-06 依赖 TASK-01：基线生成任务失败，没有可用的已验证版本。
- EDIT-04 依赖 SHOW-02：重建的可信 catalog 对 `src/pages/HomePage.vue` 返回 `componentId=null, disabledReason=MISSING_COMPONENT_ID`。

B 没有向原源码添加标识、替换成 fixture 或伪造 selection。本轮完成的是生成、故障及可执行范围内的独立行为验收，真实编辑仍没有可执行前提。

## 保留的首次批次及路径归因

`2026-10-24T13-31-57Z-real-7c732b40` 同样完整执行14项：需求0/9、代码故障0/3、环境故障2/2。该次隔离 checkout 再嵌套工作目录，在本机 Windows 深路径中 `fs.mkdtemp` 返回 ENOENT，部分真实生成源码无法进入 runner。此问题由本次执行路径触发，不能归为所有模型输出均错误；该批也存在独立的协议/动作/预算错误，不能全部抹成环境故障。

同一份 SHOW-01 源码摘要 `sha256:ea74aaa0682fdef7bff7b9dc5efb0de38d578a2e1a2f7e0c9fad3f8609e2dc74` 在长根路径226字符时失败，在短根路径115字符时 VERIFIED；随后实际 bridge 预检也通过。这仅用于环境诊断，不增加首次批次成功数。改用短路径专用 checkout 后才重新运行完整主批次，不挑样本补跑。未删除、覆盖或并入旧的3/9批次。

付费前的无凭据连接探针12/12到达端点（HTTP401）；没有把它当成模型质量验证。原探针日志与短路径诊断在本地保留，其摘要在 JSON 证据中。

## 用量与证据完整性

| 范围 | 调用记录 | 已知/未知 usage | 已知 token 下界 | 精确总 token |
| --- | --- | --- | --- | --- |
| 主批次需求 | 61 | 61 / 0 | 222315 | 222315 |
| 主批次故障 | 38 | 37 / 1 | 133964 | null |
| 首次路径故障批次需求 | 45 | 45 / 0 | 159901 | 159901 |
| 首次路径故障批次故障 | 25 | 24 / 1 | 84590 | null |
| 本轮两批合计（仅用量，不合并成绩） | 169 | 167 / 2 | 600770 | null |

两个未知均来自注入的拒绝端点，没有供应商 usage；保留未知，不补0。169是账本调用次数，不等于169次已计费请求。个人开发 agent token 与上述平台运行时账本分开。

两个批次均有14个唯一任务、完整9项需求分母，47个报告输入摘要、184/184完整性检查，JSON/Markdown 报告逐字复算通过。验证器 exit0 只说明证据完整，不表示质量通过。原始 batch-complete 凭据扫描命中0；公开包另行核对实际凭据字节命中0，排除的宿主路径文件仅为每批 `preflight-1.json`，不属于47个复算输入。原文件及其摘要保留。

- [结构化结果与完整任务ID](evidence/real-acceptance-2026-10-24.json)
- [主批次 B 独立行为结果](evidence/real-acceptance-2026-10-24-primary.json)，含两张页面截图
- [首次路径故障批次 B 结果](evidence/real-acceptance-2026-10-24-path-failure.json)
- [两批原始记录与精确 A 验证器源码 ZIP](evidence/real-acceptance-2026-10-24-raw.zip)，解压后两个批次再次184/184、报告复算通过

无需凭据或模型调用的复现：解压 ZIP 到新目录，执行其中 README 的两个 Node 命令。独立行为重放使用本PR代码、既有固定依赖与 Docker/Chromium：

```powershell
node evals/browser/record-command.mjs batch <解压目录>/evals/generation/runs/2026-10-24T13-47-29Z-real-103b5585
```

预期命令 exit1、需求2/9、六项编辑NOT_EXECUTED；不要为“通过”修改原始记录。公开归档 SHA256 及全部公开文件摘要见相邻 JSON 清单。

## 阻塞问题 / 建议 / 已核验内容

- 阻塞问题：真实需求2/9、代码故障修复0/3、真实编辑六项未执行；不满足本卡冻结目标。
- 建议：后续由相应实现者按原任务记录定位预算预约、动作协议/超时和缺失组件标识；另行修复和按冻结规则新开完整批次。本轮不为分数调预算或重试。
- 已核验内容：真实模型调用已执行；两个 READY 需求通过 B 独立判定；环境故障能停止；未知 usage 保留；所有分母/任务ID完整；两批原始报告可复算。没有修改 main 或 A 分支，没有批准或合并。
