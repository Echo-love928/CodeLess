# D23-B 只读互审登记

## 2026-10-29 复审：当前结论

对象 [PR #77](https://github.com/Echo-love928/CodeLess/pull/77)，精确提交 `37688c82da25d0ec1184108a53fd3cbd719426ac`，base `26b95e3`。本节覆盖下文历史“缺少 B 材料”的结论，原查询历史保留。只读归档运行，不切 B 分支、不改 B 文件/main；没有重跑付费模型。

### 阻塞问题

本次 B 范围未发现阻塞问题。A 的恢复 T4 单独在 #76 补验，不能用 B 的 fresh-install 结果替代；M4 的最终 Linux 运维启用/权限验收仍按对应清单处理。B 的首轮 full 超时 native1 与后续必需 gate 的成功分别保留，没有将事后 SQL 终态冒充首轮浏览器成功。

### 建议

- `docs/install.md:75-81`（非阻塞）：指南声明不支持插值，建议再明确 `.env` 字符规则或采用不执行配置文本的统一导入器。实际复现中，带字面 `$D23_ENV_UNSET` 且长度足够的 fixture 密码经 `. ./.env` 后被展开，字面相等检查 exit1；未打印秘密。此输入涉及文档已披露的插值限制，不作为当前受支持安装流程的阻塞。证据 `evidence/peer-37688c8/bash-env-observation.json`；后续支持该边界时需同步 Compose/Bash/PowerShell 语义。
- 原生分阶段退出码未知时继续保持 null；当前 root gate 的 native0 与独立 CI 六项 success 是实际记录，不能把导出摘要中的 null 改写成独立捕获的0。

### 已核验内容

| 重点 | 本方复核 |
| --- | --- |
| 新用户 Mock 演示 | 检查真实空库计数、Flyway/Chromium/两用户生成编辑发布下载与失败保留旧版本的完整报告；首轮 FAILED 与后轮 PASSED 分列。B 精确 HEAD 六个 CI 均 completed/success；未重复既有完整 gate |
| 真实模型配置 | `real-model.json` 为1次 DeepSeek PLAN，SUCCEEDED，模型/request/response ID 完整，input1298/output199/total1497；commands 仅1次 real exit0；缺配置 BLOCKED/requestsStarted0/exit2。核验已提交 provider 证据，不冒称本方重新访问其私有 transport 或重跑付费请求，不扩展为真实完整生成质量 |
| 环境示例与失败边界 | 实际 `.env.example` 只有明确本机数据库演示密码，其余密钥/账号密码空、Mock、发布关闭；本方在固定归档中跑安装专项 native0、5/5、无跳过，含缺项/凭据不一致/端口冲突和链接/锁定版本检查 |
| 源码独立构建 | 原 ZIP 和原构建日志 SHA-256 匹配；本方对同 ZIP 在另一全新固定 Node 容器/新 store 独立构建 native0、PASSED、宿主源码未改/未创建 host node_modules。B 明确 reproduction=NOT_REQUESTED，不误报为平台产物摘要复现 |
| A 同伴补验引用 | B 的 A-unit/live 原样安全日志 SHA-256 全匹配，双真实 PG native0/T1 PASSED/T4 NOT_RUN。三份源文件摘要精确对应 A `6fb9836` Git blob 的 LF→CRLF checkout 字节，仅换行转换；没有宣称 B 的原始字节等于 LF Git blob |
| 变更边界 | B 仅 README、环境示例、安装/排障/交接和 tests/install；生产 API/runner/公共契约/迁移/根锁/CI 无改动，无删断言、跳过门禁或秘密引入 |

复现：`python -B tests/backup/review_peer.py` native0。独立5项测试、独立 clean-build 原样日志/摘要、B 补验原样日志及来源归属在 `tests/backup/evidence/peer-37688c8/`。真实请求费用/usage 属于 B 的平台账，本方新增付费请求0。

正式结论：已用非作者账号在精确37688c8提交 [APPROVED](https://github.com/Echo-love928/CodeLess/pull/77#pullrequestreview-5685190954)，API读回一致；提交前重查六项success、HEAD未变且无既有inline讨论。批准只适用该B提交，未批准A、未合并或宣称M4整体完成。状态与精确提交见 `evidence/peer-37688c8/github-review.json`。

## 历史：初次查无材料

本轮查询：GitHub REST `GET /repos/Echo-love928/CodeLess/pulls?state=open&per_page=100` 返回 open PR 0；D23 PR 0。`git ls-remote --heads origin '*d23*'` native 0、空结果；最新 main `26b95e3` 中无 D23-B 交接、契约差异或测试报告。此登记早于本卡草稿 PR 创建，不把后续 D23-A PR 算作 B。

## 阻塞问题

- **缺少审查对象/证据（P0 集成阻塞，不是已发现的 B 代码缺陷）**：未取得 D23-B 精确 PR/提交、契约差异与原始报告，不能批准，也不能声称全新安装通过。影响 M4 与 D23-A-T4 的最后启用组合验收。
- 本机 Docker 不可用，因此没有重新演练 B 的全新安装、真实模型或导出容器。未用已有 D22 结果补写 D23 通过。

## 建议

1. B 提供精确提交、安装命令逐步退出码和 mock 演示浏览器报告。模型配置的真实请求单独记账；没有新的费用授权时不重跑付费模型。
2. 安装清单包括固定 release 包、所有数据根、独立 PG cluster、服务账号和权限；环境模板只用占位符。
3. 恢复环境必须沿用原**绝对数据路径**：`services/runner/src/preview/registry.mjs` 的 `readEvidence` 校验 journal/receipt/report 中的原始路径。不能通过改写不可变证据适配搬迁。操作协议见 `docs/operations.md` 第 3 节。
4. 对恢复后的同一版本真实登录/预览/源码下载，在新隔离容器运行 `tests/export/clean-build.mjs`；保存版本/摘要/截图/ZIP/退出码。不能只证明 fixture 页面可打开。

## 已核验内容

| 重点 | 只读结论 |
| --- | --- |
| 陌生使用者按文档跑通 mock 演示 | 未核验，缺 B 文档与精确报告 |
| 填入模型配置后真实请求完成 | 未核验，缺 B 证据；本卡未使用/新增模型凭据 |
| 环境模板无真实密钥 | 仅核验本卡 `infra/backup/*.example.json`，专项秘密哨兵通过；B 环境模板未取得 |
| 源码导出样例可独立构建 | 已读取原 `SourceExportController`/`ExportTemplate` 与隔离构建测试器；B 新导出包/真实构建未核验 |
| 范围、失败分支、测试强度 | 本卡未修改 B/公共契约/CI/根锁；B 的实际 diff 未取得，不作无证据评价 |

后续只读审查按“阻塞问题 / 建议 / 已核验内容”补增量与具体文件行号，不为了互审配额制造修改。当前未提交正式 GitHub review，未批准任何 PR。
