# D25-B 增量独立验收：六项编辑证据接受，总质量 HOLD

锁定 A 交付 `35a9ef3d3ba68519586e06592bce9dad2235a1e1`，真实编辑生产候选 `fb79c402de6b66bc849e87b6880bf955488f8032`，B 评测器 `6e79faf6464f33c260d8c8e47efdce3b0b6dddd2`。独立生产修复 `380811d5270a72706fad0b1a74b7ffab8b97735a` 未用于真实编辑，保持 REAL NOT_EVALUATED。本报告日期为日本时间 2026-10-31。

**接受原六项真实编辑的成功路径验收（6/6）；接受 PR84 本次最小改动的确定性回归证据，未发现新增代码阻塞。不批准、不合并；生成、公网、封面及未覆盖失败路径仍 HOLD。** A 原机执行，B 对公开源码重建及去秘密证据独立审查。B 无模型请求，无私有运行时恢复，无跨机包/密钥要求，不清理 A 环境。

`evals/edit-results/third-round/index.json` 当前executed=6、passed=6、acceptance=true仅对应六项编辑≥5/6门槛；PUBLIC-PAGE/COVER为FAILED、DOWNLOAD为PASSED，overallQuality仍HOLD。此结构校验器不独立证明生产质量，不能将其acceptance字段推广为批准合并。

## 阻塞问题

1. **原生成质量及故障门槛未满足。** B 在干净 `6e79faf` 上真实 Docker/Vue/Chromium 重放，需求 **6/9**、编辑 **6/6**，整体 **native 1**。TASK-02/CAT-01 仍 MODEL_INVALID_RESPONSE，TASK-03 固定 `/tasks` 仍占位且行为失败。见本目录 `behavior-report.json` 的 `rows`、`requirements.real`、`targets`。A [README:20–21](https://github.com/Echo-love928/CodeLess/blob/35a9ef3d3ba68519586e06592bce9dad2235a1e1/evals/results/D25-A/six-edits-2026-10-30/README.md#L20) 继续保留代码1/3、原环境0/2、原13/14不完整。B此前接受ENV-02首次实际JVM单列补验的结论不变，不合并改写原批次。PR84未真实生成复评，不能继承本轮或确定性成绩。
2. **公网链路未全部通过。** A [README:35](https://github.com/Echo-love928/CodeLess/blob/35a9ef3d3ba68519586e06592bce9dad2235a1e1/evals/results/D25-A/six-edits-2026-10-30/README.md#L35)、`public-browser/public-browser-ipv4/report.json` 与 `public-show02-network-recheck/report.json` 保留SHOW-02 JS/CSS三秒期限超时，原公网浏览器2/3。本机三个真实域名当前分别解析到198.18.0.70/71/72，`publicAddress` 全部拒绝；B独立公网重查 **未完成**，不是公网功能失败的新样本，也不是成功。见 `verification.json/live`。未替换IP、放宽TLS或超时；A归档TLS证书/远端IP/逐资产摘要与清单关联已审查。
3. **功能封面及生产接口未完成。** A [covers/report.json:87](https://github.com/Echo-love928/CodeLess/blob/35a9ef3d3ba68519586e06592bce9dad2235a1e1/evals/results/D25-A/six-edits-2026-10-30/covers/report.json#L87) 为 `productionCoverRouteEnabled=false`。原生队列2/3 SUCCEEDED中，TASK-01根路径PNG经B人工查看为“欢迎／这是一个受控 Vue 页面”，不能算 `/tasks` 功能封面。SHOW-02两次失败保留，只有SHOW-01功能封面可接受。私有adapter的权限检查不能证明生产HTTP/OpenAPI已启用。
4. **自然FAILED编辑保护没有真实覆盖。** A [security-download/report.json:288](https://github.com/Echo-love928/CodeLess/blob/35a9ef3d3ba68519586e06592bce9dad2235a1e1/evals/results/D25-A/six-edits-2026-10-30/security-download/report.json#L288) 明确自然FAILED编辑任务0、latestReady保护NOT_COVERED，先前发布保护NOT_COVERED_NO_PRIOR_PUBLICATION。六项成功、15次404和确定性夹具均不解除该项；不额外付费制造失败。
5. **本地截图worker清理异常继续保留。** A `production-gate.json` 为精确PR84候选本地E2E74/75、gate native1；失败位置 `tests/e2e/share/screenshot.acceptance.mjs:142`。B同候选单项独立运行native0、1/1，150ms和原断言不变，只能说明本次未复现，不能证明历史异常已修复。远端六项success与本地失败分别登记。

## 建议

- A继续保留数据库、原三应用、六新版本、前置版本、两次retained快照、原失败及账本；本次接受编辑成功路径不代表允许清理归档。无需将SQL、cookie、密钥或私密连接配置发给B。
- 公网允许无需模型的补取证：在正常登录后采集同三个不可变版本的版本/发布绑定，真实HTTPS证书、DNS、初次和刷新资产长度/摘要、原生退出码及SHOW-02完整失败；保留三秒期限与原报告。不要重复到成功后覆盖旧失败。若需改生产cover路由/接口或其他部署设置，先另行明确范围；本报告未授权生产启用。
- TASK-01功能封面必须绑定 `/tasks` 及同版本，SHOW-02封面保留两次终态，不重置队列。若现有生产协议不能表达功能入口，先单列设计与最小变更，不能用根占位图交付。
- 自然失败保护若必须补验，先提出无需新增付费、明确标记受控故障的方案及其证明边界；不得把它冒称自然模型FAILED编辑。任何新增付费生成复评/编辑须单独授权，剩余预算不构成授权。
- PR84下一步若申请真实生成复评，应固定候选、原九样本及3+2故障、冻结动作与预算，保留旧失败和未知用量。本轮不启动、不建议依据15项确定性测试直接宣布生成缺陷解决。

## 已核验内容

| 独立检查 | 原生命令/结果 | 本目录证据 |
| --- | --- | --- |
| 交付复算 | A精确检出运行 `node scripts/eval/check-six-edit-delivery.mjs`，native0、consistency PASSED、quality HOLD | `consistency.log`、`verification.json` |
| 原九＋原六源码重放 | B干净6e79运行下方命令，native1；6/9＋6/6 | `behavior-report.json`，十二张 `EDIT-*-before/after.png`；原trace在B本地运行目录保留，摘要在报告 |
| REAL/依赖/用量 | 六项ID无替换；01→02→03→05，04/06独立；逐行REAL，任务/版本/mapping/源码/构建/调用关联有效，各只改选中单一源文件；共享实例及TASK-01后续/刷新断言通过 | 同上；A原 `records/`、`sources/EDIT-*/source.diff`、`model-audits/` |
| 预算独立核算 | 14调用全部KNOWN；input58608、output6819、total65427；(58608×2＋6819×8)/1000000＝0.171768元；actual=null | `verification.json/metrics`；原第三轮1.759246上界、51调用47已知4未知单独保留 |
| 权限/历史证据 | A第二普通USER15次404、模型26→26；六个前置版本与原记录ID/摘要绑定一致；不是B在线再执行，也未宣称服务端拒绝审计已交付 | `verification.json/security`；A `security-download/report.json` |
| 三份真实ZIP | 各运行 `python scripts/eval/verify-source-export.py <ZIP> <原after快照> <新报告>`，各native0；CRC、清单、全文件字节、版本/source/artifact/content/ZIP摘要一致，无解压 | `EDIT-04-zip.json`、`EDIT-05-zip.json`、`EDIT-06-zip.json` |
| 交付清单 | 对精确Git对象校验204文件：203逐字节相同，1项为A已声明的普通执行脚本CRLF→LF，独立复算一致；评测证据未变化 | `verification.json/deliveryManifest`；A `publication-audit-final.json/gitBlobComparison` |
| PR84受影响Java | Java21，`services/api/mvnw.cmd -f services/api/pom.xml -Dtest=D25EntrySerializationTest,D25QualityPolicyTest,PlanValidatorTest test`，native0，15/15，无skip | `junit-summary.json`，原JUnit完整文件本地保留 |
| PR84路由夹具 | 下方命令native0；历史/tasks FAILED、历史/ PASSED、独立手工新提议/tasks PASSED，原字节不变 | `route-report.json`；不计真实生成成绩 |
| worker清理单项 | PR84精确检出 `node --test --test-name-pattern="real stdio worker is forcibly bounded" tests/e2e/share/screenshot.acceptance.mjs`，native0、1/1 | `verification.json/additionalIndependentCommands`；A原失败保留 |
| 视频 | 原WebM251381字节及SHA一致；独立全帧解码/转码native0，3.4秒PNG抽帧native0并人工核看；6.8秒SHOW-01发布后回放 | `verification.json/video`、`video-frame.png`；初次不支持null muxer的命令非零日志 `video-decode.log`保留，不是制品损坏 |
| 远端CI | gh只读核对PR82/35a9ef3、PR84/380811d各六项SUCCESS，含ci-gate，HEAD精确一致 | `pr82-ci.json`、`pr84-ci.json`；不替代真实质量或本地门禁 |

PR84差异只有两个提示、两个新增测试、一份路由夹具。无生产Java、严格解析器、单元素执行、写入协议、运行时预算、锁、CI、权限或公共契约修改。原12模型/20工具/50000token/3修复、4096输出和12分钟上限不变。JSON强调完成源文件后只序列化一次、开闭引号都转义，解析失败仍终止；没有修补JSON/去重/重试代码。原始私有wire不在公开交付中，B本轮没有独立运行这两个wire用例；A的2/2离线原生重放回执仅作为已审查证据，不称B独立2/2。

复现目录：`<A>`是检出35a9ef3的绝对路径，`<B>`是检出6e79faf的绝对路径；不使用A回环地址或旧会话。原生退出码应保留，不能用包装器把预期native1改成native0。

```text
# cwd=<A>，无需模型
node scripts/eval/check-six-edit-delivery.mjs
# cwd=<B>；应native1，requirements6/9、edits6/6
node evals/browser/run.mjs --batch <A>/evals/results/generation/runs/2026-10-30T08-15-32Z-real-29ffed9b --edit-records <A>/evals/results/D25-A/six-edits-2026-10-30/records
# cwd=PR84精确380811d；应native0，输出目录必须新建
node tests/agent/repair/d25-entry-json/route-fixture.mjs <A>/evals/results/generation/runs/2026-10-30T08-15-32Z-real-29ffed9b <B> <新输出绝对路径>
```

B本次源码重放的本地运行目录为 `.local-data/d21-b/runs/2026-10-30T16-04-37.703Z-6984a1de-df5a-495c-a06a-cf8e9bc68c46`；`report.revision`为6e79faf、`changes`为空。归档/索引更新发生在重放结束后。新B报告提交不继承6e79或A的CI状态。main未动；未向A发布评论、未审批PR。

另以 `git diff --name-only cf80bed8dc180a1df3517d0ed1e15799b819737b 35a9ef3d3ba68519586e06592bce9dad2235a1e1 -- evals/results/generation/runs/2026-10-30T08-15-32Z-real-29ffed9b evals/results/D25-A/third-round-2026-10-30` 独立核对，native0、无输出：原批次和此前故障/补验交付均未改写。公网本机拒绝可在B目录运行 `node --input-type=module -e "import {resolve4} from 'node:dns/promises'; import {publicAddress} from './services/runner/src/publish/probe-policy.mjs'; for(const ip of await resolve4('d9977ce0dbbd48bf49930ac48967fe427.sites.codeless-publish.top')) console.log(ip,publicAddress(ip))"`；当次输出198.18.0.70 false（另两域分别.71/.72），命令native0仅表示诊断完成，不代表请求成功。目录内 `.gitattributes` 固定取证文件字节，避免后续Windows检出换行转换破坏摘要。
