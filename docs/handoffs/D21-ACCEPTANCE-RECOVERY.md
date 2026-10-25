# D21 验收补齐：定位、预算与原样本保留

基于 D24-A `33abee92246f996ec1743b463c14f36f471c21d4`，整合 B 的独立浏览器/编辑工具。冻结需求、六项编辑 prompt、50,000 token / 12 模型请求 / 20 工具槽 / 3 修复轮限制均不变。

## 改动

- B 的作品和目录读取支持 article/li/listitem；紧凑书名作者列表可从真实详情补齐分类简介，详情标题允许条目名。独立正反例保留错误作者、错误分类交集、错误数量和空地点的拒绝。旧报告不改写；旧真实批次重放 7/9 行为通过，剩余两项为原平台预算失败，编辑仍未执行。
- GENERATE 反馈保留所有实际 committedContent 和摘要，省略已被最新库存取代的 source 清单及空字段；输入预约仍是 UTF-8 字节 + 512。全部计划文件已存在且普通请求预算不足时，允许移除工具定义的 completionOnly 请求，仍由模型提出原动作，真实 freeze/build/browser 决定成功。协议提示只给合法 tool/done 形式，不复制供应商传输类型；解析器仍严格拒绝非法回复，不追加协议重试。
- GenerationEvalIT 在 SHOW-01、SHOW-02、TASK-01 完成原记录采集后导出原 PostgreSQL schema/data，并把原私有根直接放在批次私有目录。三者从创建开始共用确定性的批次 owner UUID；应用、任务、版本和构建仍独立。SHA256 清单保留原文件，导出不含登录凭据或模型密钥，不提交仓库。
- retained-runtime.mjs 核验清单，将三份数据合入新回环 PostgreSQL，复制互不覆盖的版本/任务/模型账本文件，启动真实 API。测试专用 Java 入口只为原用户行绑定临时登录密码；管理员独立登录。身份与摘要逐项核对后产生私有会话文件。
- execute-retained-edits.mjs 使用同一固定提交的 B 工具，预检、每项独立幂等键和 CSRF POST、终态采集、独立重放，然后取得下一项 current selection。POST 结果不确定时停止，绝不自动重发。失败依赖项停止，独立应用继续；最终保留失败、未知用量、未执行项。
- network-preflight.mjs 不带凭据进行 12 次真实证书链握手、12 次正常 JVM 请求、Docker 和镜像检查。REAL driver 只接受十分钟内全部通过的门禁记录；不改 TLS、代理或 truststore。

## 无模型自测

首次还原发现 fs.cp 拒绝已经存在的 models 目录，未启动 API、未执行付费请求；失败目录与专属停止容器保留。改为逐项复制不同 UUID 的文件/目录，不覆盖现有成员。

MOCK 批次 `2026-10-25T07-13-51Z-mock-5c3ea9ff` 三项原任务全部保留；合库恢复后原 owner 登录成功，三个原 application/task/version/build/source 关联和模型账本读取通过。一次真实 HTTP/CSRF 的 MOCK component-edit 达到 READY，前后版本与模型账本采集通过。该自测的真实模型调用和真实编辑验收数均为 0。

私有证据：`.local-data/d21-acceptance/mock-runtime-2/restoration-check.json`、`mock-smoke-1/result.json`、`mock-smoke-1/records/`。原始导出在 `.local-data/d21-a/batches/<batchId>/retained/`，会话在 runtime 的 session.private.json，禁止归档会话文件。此前中断的集成测试没有完整退出码，不能计成整组通过；完整复跑单独记录。

## 最终执行

先固定干净提交，并完成单元/集成门禁。Windows 本机已安装的 Git Bash 路径可由 CODELESS_EVAL_GIT_BASH 指定；Java/Node/pnpm/Chromium 与仓库锁定版本相同。

1. `node scripts/eval/network-preflight.mjs <新私有预检目录>`。
2. 设置 CODELESS_EVAL_NETWORK_PREFLIGHT 为该目录的 preflight.json，CODELESS_EVAL_REAL_APPROVED=1；密钥仅沿既有环境传入。`node scripts/eval/run-batch.mjs --mode real --in-place` 只跑一次完整 14 样本。
3. verify-batch 和 report --check；失败样本保留，不能重跑或替换。对新批次独立行为重放，仍以九项为分母。
4. `node scripts/eval/retained-runtime.mjs <批次私有 retained> <新运行时目录> REAL`，保持该进程存活。
5. `node scripts/eval/execute-retained-edits.mjs <原完整批次> <运行时目录> <本固定工作树> <新编辑输出目录>`。
6. 确认归档文件 SHA256，保留原始数据库导出及私有根；会话、登录密码、数据库密码、模型密钥不进交付归档。未确认摘要前不删除数据库和文件。原 CI 单次 fixture 5/6 仍为 UNATTRIBUTED。

达到 ≥8/9 真实需求行为、≥5/6 真实编辑及所需门禁之前，不声明 D21 通过；MOCK 与源码重放均不冒充在线编辑。

## 首次完整执行与后续修复（2026-10-25）

`2026-10-25T07-45-54Z-real-4f814e6e` 在 `a3eb204a446f1c6ce150cf7f1811881aca60b06e` 上完成全部 14 个原始样本，没有重跑。开跑前正常 TLS 证书链握手 12/12、JVM TransportProbe 12/12、Docker/镜像检查通过；六项 CI 通过。批次完整性验证 184/184、报告重算及凭据扫描通过，不代表质量验收通过。

- 平台需求 READY 2/9（SHOW-01、TASK-03），代码故障修复 0/3，环境故障 2/2 按预期停止。
- 独立行为初次重放 1/9；TASK-03 使用合法的购买切换按钮，被只接受 checkbox 的判定误拒。兼容按钮后全量源码重放为 2/9，其他七项仍为平台失败。六项真实编辑全部 NOT_EXECUTED；SHOW-02、TASK-01 没有可用原始 READY 版本，不能替换样本或制造记录。
- 实际已知用量 266,765 token / 76 次调用，3 次用量未知；预算计费 302,947。未知项保留，不把计费上界写成实际用量。
- SHOW-03、CAT-02、CAT-03、FAULT-CODE-01、FAULT-CODE-03 为 MODEL_INVALID_RESPONSE；TASK-02 为 AGENT_MODEL_PROTOCOL_INVALID；SHOW-02、CAT-01 为 MODEL_HTTP_ERROR；TASK-01、FAULT-CODE-02 为 AGENT_TOOL_NOT_ALLOWED。HTTP 状态未保存在原采集里，原因仍未知。

TASK-01 已成功写入修正的无扩展名 TypeScript import，随后反复写入完全相同的源码，耗尽请求槽而未请求验证。修复上下文现在记录实际成功写入后的整树摘要；有过真实变化后再次写入已见候选时，宿主冻结当前实际源码并执行原构建和浏览器动作。它不把重复补丁视为成功，不救回非法模型回复，不放宽任何预算。新集成测试在旧 AgentLoop 上失败，在新实现上通过；数据库、工具写入、构建和浏览器均实际执行，模型为 MOCK。

保存的实际模型补丁离线重建说明：TASK-01 候选可以通过原动作；SHOW-02 一个中间候选通过，但首次回访的候选仍 ACTION_TIMEOUT。不能据此改写原任务结果，也不能声称重复候选机制一定修好 SHOW-02。生成提示恢复完整验收动作约束，加入无 `.ts` 后缀导入和完整文件尽量低于 6 KiB 的提示；4096 输出上限保持不变，真实模型效果待新批次验证。

还原自测另发现 PostgreSQL 初始化阶段的临时 UNIX socket 早于正式 TCP 服务就绪，现改为 TCP pg_isready 门禁。启动器从固定源码自行 test-compile 并生成锁定依赖 classpath，不再依赖操作员临时文件；REAL 还原要求干净源码及与原批次完全相同的提交。三份原 MOCK 导出重新恢复、登录、一次 HTTP/CSRF 编辑和前后快照/账本采集已通过，真实模型调用为 0。

私有证据保留在原工作树 `.local-data/d21-acceptance/` 和稳定修复工作树 `.local-data/stabilization/`，原始失败批次保持不变。后续新的付费完整批次需要先明确确认执行范围；不把本次失败样本逐个重跑来替换结果。旧 CI 单次 fixture 5/6 仍为 UNATTRIBUTED。
