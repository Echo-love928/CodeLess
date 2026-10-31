# D25-A：真实复评证据、四项确定性修复与待复审清单（HOLD）

最新真实评测仍为165e31c的需求6/9、代码故障2/3、环境2/2；未达门槛。此 PR 保留原九样本、3+2故障及三批真实原始失败/用量，新增固定生产候选 fb79c402de6b66bc849e87b6880bf955488f8032（独立 PR #83）的四项回归和真实门禁证据。没有第三轮付费运行；新候选 REAL NOT_EVALUATED。

## 主要变化

- 生产修复独立位于 [PR #83](https://github.com/Echo-love928/CodeLess/pull/83)，本 PR 同步该固定依赖并记录评测限制。对比该 base 只剩评测/报告/测试交接，不夹带共享契约、根锁或CI改动。
- 单content提议约束；新提议实际唯一目标；搜索与分类累计状态/显式复位；实际冻结类型中的消费端字段修复。原非法JSON、歧义和矛盾动作仍失败，原真实结果不改成功。
- 交付原生退出、397项JUnit、实际修复输入、字段单文件摘要变化、原始执行源快照与Git关联、精确HEAD CI及可复制B复审请求。

## 验证

- PR #83固定 fb79c402de6b66bc849e87b6880bf955488f8032：新增10/10、受影响55/55；完整本地四阶段/ci:gate均0，API397/397无skip；远端六项success（快照 2026-10-30T06:27:45.860Z）。生产候选保持不变。
- 评测分支同步后unit44、mutation12及static全部native0。新交付HEAD的远端CI以实时为准，旧0ee8e1a成功不继承。
- 中间d19c4d4的失败/中断完整保留，API UNKNOWN_INTERRUPTED、runner/e2e NOT_EXECUTED；最终修复限定TS2339并保留全部旧断言。

报告 [evals/results/D25-A/four-fixes-2026-10-30/README.md](evals/results/D25-A/four-fixes-2026-10-30/README.md)，复审请求 [REVIEW-REQUEST.md](evals/results/D25-A/four-fixes-2026-10-30/REVIEW-REQUEST.md)。此前两轮新增真实证据已获用户明确公开授权，新增本轮仅生产/确定性证据且审计不含密钥、私有SQL或会话；本轮付费请求0，Mock合成用量分账，开发token未知。

## 剩余阻塞

B 增量独立复审、双方确认固定候选后才决定第三轮完整付费复评。旧晚期预算缺类型不能用顺序调整声称恢复；真实≥8/9及代码3/3仍无新证明。B编辑及公网真实验收保持原限制。未自批、未合并、未推main。
