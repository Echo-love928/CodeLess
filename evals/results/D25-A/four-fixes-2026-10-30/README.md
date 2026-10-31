# D25-A｜四项生产修复与固定候选交接

本轮四项最小修复及确定性验证已完成，交 B 增量独立复审；质量仍 **HOLD**。第三轮付费完整复评未启动，本候选 REAL NOT_EVALUATED，不能用 Mock 或 CI 改写既有真实 6/9、代码 2/3、环境 2/2。

- 任务分支 codex/d25-a-final-evaluation；生产分支 codex/d25-a-quality-fixes / [PR #83](https://github.com/Echo-love928/CodeLess/pull/83)。修改前 4c9455d85175a2df83aecdd399e370da3e302a73，实施提交 64a1a45ca47635ff167252f85e67bec82229b73d，固定候选 **fb79c402de6b66bc849e87b6880bf955488f8032**。
- 交接写入前评测源码检查点 993e91254ce4f3aaa4b7390f071b65b2b455d2a0；与候选的 prompts、API 源/测试、runner 与模板 Git 内容完全相同。最终交付 HEAD 以 [PR #82](https://github.com/Echo-love928/CodeLess/pull/82) 为准；证据提交不移动生产候选。local main 944738c3c4f035f3d503281fecba9f96a09fdf88 未动，10 个原有未跟踪目录保留。
- 相对 4c9455d 生产仅两份提示与 RepairContext.java；整个 PR #83 还包含先前 AcceptanceActions 反馈。新增两类测试、原已公开冻结夹具、记录器及证据；无共享契约/根锁/CI/迁移/依赖/权限/解析器/运行时上限变化。

## 四项回归

| 项目 | 结果与原生行为 | 证据 |
| --- | --- | --- |
| F1 单 content / 严格 JSON | 合法单字段写提议真实接受；原 9618 字节重复 content 为 DUPLICATE_KEY，尾数据 TRAILING_TOKENS，截断 SYNTAX。三个负例各 PLAN+GENERATE 两次后 FAILED，无写入/runner/自动去重、修补或重试。 | gate/cases.json、case-summary.json；D25QualityRegressionTest |
| F2 唯一目标 | 原 Café heading 两元素、图书“科技”三元素仍 worker native1。新独立提议的唯一 ID / button 角色 worker0，覆盖详情切换与后续列表操作；未改历史动作、first()、单元素规则或隐藏列表。 | 同上 café/books 四行 |
| F3 累计状态 | 原工具目录全序列仍失败；额外隔离的“测试 + doc 却期待 Docusaurus”仍超时。新提议按原数据搜索 AND 分类，清空搜索保留分类，显式 All 后打开 Vite，验证详情与后续列表；STATIC 原实现 reload 后真实默认9条。数据/过滤函数不改。隔离诊断不是原固定样本替换。 | tools 三行；原源夹具 hash |
| F4 类型消费 | 真实构建先 native2/TS2339，再从实际 repairSources 中摘要匹配的冻结 Cafe.signature 及消费者构造单文件更新；仅 CafeCard.vue 从 signatureDrink 改回 signature，其余文件字节/冻结新提议动作不变；重建0/浏览器0。 | actualRepairInputs、drafts、changed path=src/components/CafeCard.vue |

GEN/REPAIR 的 LF 大小 5162/1738，低于原始 5338/1763。只在 TS2339 字段诊断时优先已计划的直接依赖，普通渲染诊断原顺序及全部旧断言保留。严格解析、单元素、原样本/故障/冻结动作及 3轮/12模型/20工具/50000运行时token/12分钟/4096输出上限均保持。

旧付费最后 Cafe 轮只注入消费者、类型因预算接近耗尽省略；其原编译排序已是 Card→Data。不能声称新排序能让该晚期预算同时容纳两文件或旧批次已修成功。当前回归只核验在既有预算足够时实际输入确含相应类型和依赖。详见生产证据 baseline/historical-cafe-context.json。

## 命令与门禁

前置设置本机既有锁定 JAVA_HOME；本机值 F:/JAVA/CodeLess/CodeLess/.local-data/d07-a/tools/java21/jdk-21.0.12.1+1。需要既有 Docker/Chromium，不需要模型凭据。

```powershell
node tests/agent/repair/d25-quality/record.mjs affected
node tests/agent/repair/d25-quality/record.mjs runtime
node tests/agent/repair/d25-quality/record.mjs gate
node scripts/eval/record-final.mjs unit
node scripts/eval/record-final.mjs mutation
node scripts/eval/record-final.mjs static
```

| 命令/检查 | 精确位置与结果 |
| --- | --- |
| 新增策略先红 | baseline 4c9455d，5 项 4 fail/1 pass，native1；生产 evidence/baseline/four-policy-exact-red.json、policy-exact-red.log |
| 新增专项 | 10/10，最终固定候选完整 API 再次覆盖，JUnit 两类各5项，0 fail/error/skip |
| 受影响 | 64a1a45ca47635ff167252f85e67bec82229b73d，55/55 native0，记录源字节/HEAD未变；affected 证据路径见 summary.json |
| verify:static | native0；52 Node +201 前端，lint/typecheck/build |
| verify:api | native0；397/397，83套，0 failure/error/skip |
| verify:runner | native0；268/268，真实 Docker/Vue/Chromium |
| verify:e2e | native0；75/75，且全产品链 PASSED / browserExitCode0 |
| ci:gate | native0；固定 fb79c402de6b66bc849e87b6880bf955488f8032，2026-10-30T05:38:08.284Z 至 2026-10-30T06:30:46.074Z；gate/command.json，4阶段均0，源/HEAD未变，既有截图按原字节恢复 |
| 精确远端 CI | 2026-10-30T06:27:45.860Z，本候选六项 success，含 ci-gate；remote-fix-checks.json。PR #82 新交付 HEAD 的 CI 另查，不继承旧成功 |
| 评测分支 | unit44、mutation12 均 native0；static native0。任务分支static另含58 Node +201前端；分别 evals/results/D25-A/commands/2026-10-30T05-42-28.046Z-unit/command.json、evals/results/D25-A/commands/2026-10-30T05-42-31.681Z-mutation/command.json、evals/results/D25-A/commands/2026-10-30T06-32-49.558Z-static/command.json |

中间 d19c4d4 因普通诊断排序断言失败，162 个已完成测试观察1 failure，随后本人仅终止已核对 PID 的门禁子树；gate native1，API UNKNOWN_INTERRUPTED，runner/e2e NOT_EXECUTED。失败/未知保留在生产 evidence/interrupted-d19c4d4.json，不被最终成功覆盖。启动时 Docker/Java 前置及夹具阶段/错误图书ID记录亦保留；这些不冒充产品先红证据。收窄后所有旧断言未变。

本地完整日志 SHA256：sha256:931834fc923c080e6cc115febedcb6d0242530465038254c2a6c7cc56b55a034，保留于记录 command.privateLog；公开源快照逐字节匹配执行摘要，CRLF→LF 后关联 Git blob，未 trim/BOM/Unicode 处理。source-provenance.json 同时记录任务分支现场换行差异，不把规范化相等冒称原始字节相等。

## 验收与下一步

- 原 D25-A-T1：九样本/3+2故障及三批旧结果未替换或删改，frozen-inputs.json。
- T2：最新真实6/9未达≥8/9；本候选 NOT_EVALUATED。T3：最新真实代码2/3、环境2/2，代码门槛仍未达；上述确定性回归分账。T4：原真实账本未知量不改0，44项评测与12项负向控制通过，真实下界/UNKNOWN保持原报告。
- PR摘要：独立生产 PR #83 收窄提议及类型上下文；本评测 PR #82 只同步依赖、证据和真实限制。主任务真实质量尚未验收，未自批、未合并、未推 main。
- 同伴审查：此前 B #81 /6ecf3f5 的 mode 修复独立6/6及反例拒绝已记录，真实编辑/公网验收仍HOLD；本轮没有新的 B 代码输入，未重复批准。A 本候选等待 B 对四项增量独立复审，具体文件/复现命令在 REVIEW-REQUEST.md。
- D26/后续：B 核验四项回归并双方确认 fb79c402de6b66bc849e87b6880bf955488f8032 后才决定第三轮付费全14条复评；仍须原九需求≥8/9、三个代码故障和两个环境故障约定、独立行为证据。未知模型遵从性及旧晚期预算不足不得当完成。
- 开发 agent input/output/合计：UNKNOWN/UNKNOWN/UNKNOWN，无实测接口；未把60000预算当用量。本轮新增付费请求0；专项11个Mock任务共 51 请求、声明合成token 10200，不是实测或收费。完整门禁Mock总量未汇总，UNKNOWN；先前真实两轮140请求、2未知、已知下界586797独立保留。
