# D25-A / PR #83 四项最小修复与确定性回归

状态：四项修改已实现，新增专项初验 10/10；固定提交完整门禁及 B 增量独立复审待补。第三轮付费完整复评暂停。确定性 fixture 不能证明真实模型会遵守提示，真实质量仍 HOLD，旧 6/9、代码故障 2/3 不改写。

## 生产修改

相对 4c9455d85175a2df83aecdd399e370da3e302a73，仅改两份提示与 RepairContext.java。GEN/REPAIR 写提议要求先完成文件、一次序列化一个 arguments.content，禁止在同一提议追加替代 content；严格 AgentModel 解析和 provider 不变。新提议区分列表/详情目标和分类按钮角色，覆盖详情切换及后续列表操作；按原始数据累计搜索 AND 分类，清空搜索保留分类，跨分类打开前显式 All，刷新按真实持久化实现验证。修复优先使消费端遵守冻结导出类型，不能改字段数据凑通过。

RepairContext 只将直接、已计划的冻结依赖移到无关排队页面之前，仍由既有 seed/allowance/read 规则决定能否注入，没有上下文新权限、跨文件写协议、预算或工具变化。GEN/REPAIR 的 LF 大小为 5162/1738 字节，低于原始 5338/1763 和前版 5190/1758。

## 新增测试与证据边界

- D25QualityPolicyTest：5 个提示契约/依赖排序/预算断言，修改前 4 fail、1 pass（native 1），日志 baseline/policy-red.log；修改后 5/5（native 0）。这是提示契约回归，不是 LLM 效果证据。
- D25QualityRegressionTest：5 个真实 PostgreSQL、生产 AgentModel + DeepSeek 回环传输、受限文件工具、Docker/Vue 构建和 Chromium 用例，初验 5/5。具名 deterministic-mock 的固定提议使用显式合成用量，付费调用 0。
- 原 TASK-02 的 9618 字节重复 content 回复逐字节摘要锁定，DUPLICATE_KEY；合法单 content 文件提议真实写入；尾数据及截断 JSON 仍严格失败。三个负例各只 PLAN + GENERATE 两次请求，无写入、runner、自修补、去重或重试。
- 原 CAT-02 的 heading 同名仍 strict violation / 两元素；原 CODE-03 已去异常 v2 的“科技”文本仍 strict violation / 三元素。新提议使用源中真实唯一 ID 或 button 角色，详情切换后列表仍可点击、过滤和观察。没有 first()、多元素放行或隐藏列表。
- CAT-03 使用原第一轮 9 条静态数据与原过滤函数，旧完整动作仍失败（其首个错误是 build 查询错误期望空结果）；另外独立诊断保留“测试 + doc 却期待 Docusaurus”的矛盾失败。新序列明确 All 后再打开 Vite，清空只清搜索，详情切换后仍验证列表，reload 真实回到此 STATIC 实现的默认 9 条；未增加原需求未要求的持久化或更改过滤规则/数据。
- Cafe 类型例从原 CAT-02 v3 的消费者 signatureDrink 冲突开始，真实构建先 TS2339，修复实际输入包含摘要匹配的 CafeCard.vue 和原 cafes.ts（signature: string），仅一次 files.update 把消费端改回 signature。冻结原动作贯穿两次构建不变，其他文件摘要不变；新增唯一动作是独立的新提议，绝不替换旧批次动作。

实际付费旧最后修复轮因预算已近耗尽，只注入 CafeCard.vue，未注入 cafes.ts；原编译错误的排序本已是 Card→Data。顺序优化不能证明该晚期预算快照可同时容纳两文件。见 baseline/historical-cafe-context.json。这里只验证新确定性候选在既有预算中确实收到对应类型，不声称旧实测已修成功。

## 可复制命令

使用仓库锁定的 Java 21、Node 24.22.1、pnpm 12.6 和既有 Docker/Chromium。凭据不需要。

```powershell
node tests/agent/repair/d25-quality/record.mjs policy
node tests/agent/repair/d25-quality/record.mjs runtime
node tests/agent/repair/d25-quality/record.mjs affected
node tests/agent/repair/d25-quality/record.mjs gate
```

记录器不重试。原生命令及退出码、精确 HEAD、现场源文件摘要、JUnit、每阶段退出、案例的构建/浏览器退出及实际修复上下文写入本目录的新时间戳子目录。完整日志/XML 留在 .local-data/d25-quality，公开摘要含 SHA256；既有截图按运行前字节还原。首次原生失败、未知和历史记录保留。

## 启动/夹具问题（不算产品先红证据）

baseline/four-red.json：Docker 未运行，6 项中 3 fail/1 error；启动既有 Desktop 后再测，没有安装升级。four-runtime-red.json：离线 provider 错把无 phase 的 PLAN 请求当 GENERATE，5 项 2 fail/3 error，修正夹具阶段判断。four-runtime-baseline.json：5 项中 1 fail，夹具猜错原图书 ID，真实浏览器读到了加西亚·马尔克斯；改为从冻结书名提取实际 ID，没有改原数据。有效产品先红是独立 five-policy 的 4 个失败及每个旧案例 worker 的原生非零，不能把夹具问题计成产品修复。

开发 agent input/output/total：UNKNOWN（无实测接口）。平台新增付费请求 0；确定性 provider 的 token 为 DECLARED_SYNTHETIC_NOT_MEASURED，不能合入个人或真实模型用量。主分支、共享契约、锁、CI、迁移、权限、严格解析、1..20 动作/单目标要求、3 轮/12 模型/20 工具/50000 token/12 分钟上限不变。未自批、未合并。
