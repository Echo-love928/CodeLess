# D29-B 对 D29-A 的只读审查

2026-11-04（Asia/Tokyo）；[PR98](https://github.com/Echo-love928/CodeLess/pull/98) 精确候选 `3d15a920e189579d7c48b89961a986035bf81b3e`，基线 `aefaca193af3019bcadbcf8fdf3f6424baee750c`。审查22个变更文件，均为README、A交付/讲解/交接及其对应测试和证据；无产品、契约、依赖锁、CI或迁移差异。不修改A分支、不提交评论或批准。

## 阻塞问题

- Windows默认CRLF检出下，`tests/delivery/backend/audit.py` 的 `offline()` 对三个历史Python校验器直接按工作区字节比较，实际命令 `python tests/delivery/backend/audit.py offline` 原生1，报告 `d28_final_intake.py`、`d28_final_quality_audit.py`、`d28_final_source_budget_audit.py` 摘要不符。影响：默认Windows检出无法复现其“材料校验0”。三个Git原始blob均与D28期望SHA一致，差异仅CRLF；在独立审查副本中使用同一Git原始字节重跑原检查，原生0、28引用/17历史摘要/40链接通过，随后恢复工作区原字节。两次原件和摘要见[peer-a.json](d29-evidence/peer-a.json)。这不是历史证据篡改，也不能把首轮1改成0。建议A明确LF检出前提并提供可复现入口，或在本卡校验器中明确区分Git原件与工作区换行差异；不要归一化真实日志/PNG/ZIP。修正后只重查该材料入口。

## 建议

- A材料仍按原卡保留真人换手与B旧候选缺口；本会话用户已取消B侧真人彩排及完整录像，B本轮已据此更新。A应在下次增量审查中使用B最终SHA及最新范围，不能将PR97@28037c5的旧状态当最终结论；不跨会话代替A作者批准或改写其用户要求。
- A正文中的本机失败和最终远端成功已经分列；继续保留原失败，最终CI原日志私存不等于读者可直接获取，应按现有受控渠道交接。

## 已核验内容

- B独立匿名GET仓库元数据和PR98精确SHA的README均200，无Cookie/Authorization，正文与Git blob逐字节一致：[回执](d29-evidence/peer-anonymous.json)。
- main first-parent只有一个显示作者，不能冒充双人贡献统计。PR94/95作者、候选和批准回执共同追溯；closed且merged=false仍与合并状态分开。B在原本地仓库只读执行 `git diff --exit-code 1fe1389 aefaca1 -- services apps templates prompts contracts infra` 原生0，支持主线与最终候选产品目录一致的声明。
- C1–C7引用对应代码/测试可定位，最终D28需求8/9为增量组合、TASK-03仍失败，代码故障3/3、环境2/2复用；mock与独立REAL分账、账单UNKNOWN，没有以模型文本替代构建结果。
- 材料高置信秘密模式检查无发现；不等于全历史或所有格式秘密审计。未公开原请求、Cookie、密钥、数据库备份或完整生产日志。
- 独立读取PR98精确SHA的CI运行 `41664397700`，六项全部success；[快照](d29-evidence/peer-ci.json)。未将GitHub job结论写成其API未暴露的原生进程退出码。
- A对B首次提交的审查指出过时D28状态、缺门禁回执及原真人/录像要求：B已修正最终状态索引、交付去敏回执和原件定位；真人/完整录像按用户最新要求取消。新增文档回归将口播与最终质量JSON绑定。未声称A已复审或批准这些变更。

结论：存在上述材料复现问题，保持只读审查待修正；未提交GitHub审批。审查副本恢复为干净状态，未重新运行A整套门禁、付费评测或生产部署。
