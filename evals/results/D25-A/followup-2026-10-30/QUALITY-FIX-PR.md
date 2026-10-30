## 问题与行为

针对 D25 真实失败收窄生成/修复提议：写文件先完成内容，再序列化一个 arguments.content；区分列表/详情与分类按钮的实际唯一目标；显式累计搜索与类别前提；修复消费端必须遵守冻结导出类型。严格解析仍拒绝原重复键、尾数据和截断 JSON，不去重、修补或自动重试。

本轮相对 4c9455d 只改 GEN/REPAIR 两份提示与 RepairContext.java。上下文仅对 TS2339 字段错误优先直接计划依赖；保留普通渲染诊断的原顺序、既有断言和预算判断。整个 PR 另含先前的动作拒绝反馈；无公共契约、依赖、根锁、CI、权限、解析器、runner 或运行时上限变化。

## 固定候选与验证

- **PR #83 固定 HEAD：fb79c402de6b66bc849e87b6880bf955488f8032**；生产实现 64a1a45ca47635ff167252f85e67bec82229b73d，之后只有证据/索引提交。第三轮付费完整复评暂停。
- 新增 10 项确定性回归初验通过；精确收窄实现上的受影响 **55/55、native0**，源字节与 HEAD 未变。红基线 4c9455d 的同组 5 项有 **4 fail/1 pass、native1**。
- 真 PostgreSQL、生产 AgentModel + DeepSeek 回环 HTTP、文件工具、Docker/Vue 构建与 Chromium。模型为明确命名 deterministic-mock；token 为声明的合成值，付费请求 0。
- 原 9618 字节重复 content 回复按摘要锁定；与尾数据/截断各只请求 PLAN+GENERATE 两次，零写入/runner/修复。合法单字段写提议真实接受。
- 原 Café 两元素 heading、图书“科技”三元素、原工具目录错误/矛盾动作仍失败。新独立提议验证唯一 ID/角色、详情切换、后续列表操作、搜索 AND 分类、清空保留分类、显式 All 及真实刷新状态；不隐藏整个列表，不改原数据/过滤规则或旧动作。
- Cafe 字段冲突先真实构建 TS2339，再从实际注入且摘要匹配的冻结类型读取 signature，**一次仅改消费端**；其他文件与冻结新提议动作不变，真实重建/浏览器通过。
- 原生 ci:gate 0；verify:static=0、verify:api=0、verify:runner=0、verify:e2e=0，源字节/HEAD 未变=true/true。GitHub 必需检查以本精确 HEAD 实时状态为准，旧 SHA 成功不继承。

执行：`node tests/agent/repair/d25-quality/record.mjs affected`、`... runtime`、`... gate`；先设置本机已锁定 JAVA_HOME。无模型凭据。先红后绿日志、原生码、原始场景摘要及复现说明见 [本 PR 证据索引](https://github.com/Echo-love928/CodeLess/blob/fb79c402de6b66bc849e87b6880bf955488f8032/tests/agent/repair/d25-quality/README.md)。最终完整门禁结果随评测 [PR #82](https://github.com/Echo-love928/CodeLess/pull/82) 记录，生产候选不再移动。

## 剩余限制 / HOLD

最新真实批次仍为 165e31c 的需求 **6/9**、代码故障 **2/3**、环境 **2/2**；本候选 **REAL NOT_EVALUATED**。确定性回归不证明真实模型效果，CI 成功不解除质量阻塞。

旧付费最后一个 Cafe 修复轮仅注入消费者，数据类型因预算接近耗尽被省略；其原编译排序本已 Card→Data。顺序调整不能证明该晚期预算能同时容纳两文件，不能声称旧批次已修成功。当前测试核验有足够既有预算时真实输入包含二者。中间 d19c4d4 的普通顺序断言失败/中断、夹具错误及全部旧失败均保留，未改旧断言。

B 增量独立复审并双方确认固定候选/四项回归前，不启动第三轮付费评测。未自批、未合并、未推 main。开发 agent input/output/total UNKNOWN；本轮新增付费模型 0，Mock 用量单列，不能混入真实账本。
