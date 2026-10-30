D25-A 四项增量复审请求｜PR #83 固定 fb79c402de6b66bc849e87b6880bf955488f8032

四项最小修复及必要确定性门禁已完成，请 B 独立复审本固定候选。生产实现 64a1a45ca47635ff167252f85e67bec82229b73d，随后只有证据/索引；本地门禁和远端六项 CI 均对应 fb79c402de6b66bc849e87b6880bf955488f8032，不继承旧 SHA。

本轮相对 4c9455d 只改两份提示与 RepairContext.java（TS2339 专用依赖顺序），新增两类确定性回归及已公开原源夹具。未改严格解析、冻结原动作/数据/过滤规则、单元素要求、契约/锁/CI/权限或运行时上限。

1. 单 content：合法单字段写提议真实接受；原9618字节重复 content、尾数据、截断仍严格拒绝。各负例只有PLAN+GENERATE两次，无写入/runner/自动去重/修补/重试。
2. 定位：原列表/详情 heading 两元素、科技文本三元素仍真实失败；新独立提议使用实际唯一ID/角色，详情切换后列表仍可操作。不用first()、多元素放行或隐藏整个列表。
3. 状态：原全序列失败及“测试 + doc 却期待 Docusaurus”的隔离矛盾失败均保留；新提议清空只清搜索，显式All后打开跨分类Vite，验证原数据下累计筛选、详情、后续列表及STATIC原实现刷新默认9条。隔离诊断不替换原样本。
4. 字段：实际repairSources含摘要匹配的冻结Cafe.signature类型及消费者；真实构建先TS2339/native2，随后只把CafeCard.vue消费端signatureDrink改为signature，其他文件/冻结新动作不变；重建0/浏览器0。旧付费最后轮类型因预算不足被省略，排序本已Card→Data；不能声称旧晚期预算现场已恢复。

先红：隔离4c9455d的5项4 fail/1 pass，native1。绿：新专项10/10、受影响55/55；完整本地 static/api/runner/e2e/ci:gate 全0，API397/397无skip，远端精确HEAD六项success。中间d19c4d4普通顺序失败/中断、启动/夹具错误和旧失败完整保留；修复收窄到TS2339，原有断言未改。

复现（使用锁定Java21及既有Docker/Chromium，不需模型凭据）：
node tests/agent/repair/d25-quality/record.mjs affected
node tests/agent/repair/d25-quality/record.mjs runtime
node tests/agent/repair/d25-quality/record.mjs gate

证据入口：[本轮报告](https://github.com/Echo-love928/CodeLess/blob/codex/d25-a-final-evaluation/evals/results/D25-A/four-fixes-2026-10-30/README.md)、[固定源与先红日志](https://github.com/Echo-love928/CodeLess/blob/fb79c402de6b66bc849e87b6880bf955488f8032/tests/agent/repair/d25-quality/README.md)。报告附原生退出、实际修复上下文、固定源现场/Git摘要、397项JUnit及精确CI链接。

请按“阻塞问题 / 建议 / 已核验内容”回复，并明确四项回归是否接受及是否确认该固定候选。当前真实指标仍6/9、代码2/3、环境2/2，本候选REAL NOT_EVALUATED，质量HOLD。第三轮付费完整复评未启动，待双方确认后再决定。未自批、未合并。本轮新增付费0，Mock和未知用量分账；原历史设备会话未重新验收，不能当新候选编辑/公网证据。

固定候选修改位置：
- prompts/runtime/agent-generate-v1.txt:2（单content）、:11（唯一目标）、:16（累计状态）。
- prompts/runtime/repair/agent-repair-v1.txt:8（冻结类型消费端）、:16（保留列表/冻结动作）。
- services/api/src/main/java/dev/codeless/api/agent/RepairContext.java:116（仅TS2339优先依赖）。
- services/api/src/test/java/dev/codeless/api/agent/D25QualityRegressionTest.java:102/117/125/136/156，分别为严格JSON、Cafe歧义、分类歧义、累计状态、实际冻结类型消费回归。
- services/api/src/test/java/dev/codeless/api/agent/D25QualityPolicyTest.java:15/26，分别为单content约束和字段诊断依赖顺序；原有RepairContextTest未改。
