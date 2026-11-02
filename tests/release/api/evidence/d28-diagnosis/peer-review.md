# B产物只读互审（精确7db代码 / a264cf1交接）

## 阻塞问题

- `docs/handoffs/D28-B.md`及`tests/release/browser/evidence/d28/resolution/native-retests.json`：B已保留7db Windows完整E2E原生1（73通过/4失败/3未运行）及失败后重下载原生1；这些不能由远端六success或本轮14单元替代。复现先取得同次原件/trace及原命令，不提高原30秒/120秒/10秒截止。
- `tests/release/browser/evidence/d28/resolution/binding.json`：7db含真实前端修复，旧00fd/52e包不能证明新候选，当前最终组包及实际部署未建立；禁止给旧包重贴候选或拼接旧61公网与新本地ZIP。
- 原API中断、D19清理超时、重下载原件在B私有主机，用户确认B已关机，当前未能独立读取原日志/trace；本轮只审核公开投影及摘要声明，未将“未取得”改成“无异常”。A历史原件已实际提供受控入口，但其同次内核/拒绝栈仍缺，根因未闭环。

## 建议

- B开机后将同次原件附精确源码/原生命令、SHA及进程创建时间交付受控目录；优先按export请求ID串联浏览器、API和代理响应，而非仅从download事件超时推断归因。
- 后续Playwright运行前独立封存旧失败trace；避免测试输出目录清理后丢失唯一现场。保持原断言、重试及资源边界。

## 已核验内容

- 已fetch并读取PR95@a264cf1及7db精确产品修复。7db只改`apps/web/src/features/workbench/use-workbench-task.ts`及其单测：确认取消终态后立即attach补读、旧订阅代次回调失效；未新增取消/创建请求，未改变服务端权限/预算/模型状态真值。
- A隔离只读候选工作树`.local-data/d28-a/peer-7db-review`执行锁定offline install0，原工作台文件14/14原生0；输入SHA及HEAD保持一致，无Docker工作负载或模型调用。具体命令/日志SHA见`peer-7db-unit.json`。
- GET精确A191和B7db各六项completed/success，本轮新交接HEAD另看其自身CI；见`previous-ci.json`。本轮未宣称独立复跑B完整四阶段或私人trace。
- 新增B修复范围内未见公共契约/依赖/权限放宽或删除原失败断言。此为所列diff及公开材料范围内核验，不扩展为全仓或秘密不存在的绝对保证。

结论HOLD，未批准、未发线上review/comment、未合并或修改B/main。A新原件和下一次取证方式见`D28-JOINT-DIAGNOSIS.md`。
