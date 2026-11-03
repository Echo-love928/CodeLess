D28-A｜原失败现场交付与候选预算审计（HOLD）

最新B原件复核：已独立取回5批280文件、28844335字节，全部摘要匹配。原API中断退出UNKNOWN保留；73/90/2份JUnit分别重算，认证trace只留受控渠道。解析器Windows/VPS各5/5，规范分析报告逐字节一致。重下载原10秒中约7.1秒在等按钮，export后仅观察约2.9秒且无完整响应，不能据此归因服务端；D19和同一日志中稍后的E2E清理超时按原阶段隔离。没有移动计时点、延长deadline或做猜测性产品修复。

B原件取得缺口关闭，根因缺口未关闭；未采集代理日志/拒绝栈等不补造，下一次须同次定向捕获。新交接HEAD自身CI另核，不继承已六success的7b4a88b。完整结论见 `tests/release/api/D28-B-ORIGINALS-REVIEW.md` 与 `evidence/d28-b-originals/`。以下为此前本PR交付范围，当前整体仍HOLD。

本PR记录候选服务端独立验收，并保留失败、未知及部署身份差异。本轮解决A原失败现场仅存在本地路径、B不能联合复核的问题：55成员原件包已交付既有受控SSH目录，服务端逐项校验0。历史EPERM只留message、CLEANUP_FAILED断言前未落runner回执，缺失的同次拒绝栈/OS句柄仍未恢复，不宣称修复或严重缺陷归零。

主要变化：
- 提供原件校验/封存器及下一次宿主Node文件操作取证工具；不加重试、不改原错误/断言/截止/隔离，不将观察器接入模型或产品权限。
- 同一2元预算账本增加CAS候选重绑定：核对实际包/组件及精确SHA六项success，追加历史，旧支出、UNKNOWN占用、样本和事件不重置。新工具仅旁置验证，现用控制器和数据库未改。
- 只读审查B的7db取消补读修复；在A隔离工作树独立执行工作台14/14。旧00fd原包保留，不能替代含前端修复的后继候选。

验证：观察器本机3/3；预算本机/VPS各10/10；原件保护本机/VPS各2/2；55原件成员本机及VPS均匹配。全部列出实际命令、原生退出、日志/回执SHA，均无付费模型调用。新交接HEAD的四阶段/ci-gate看当前PR精确检查，不能继承旧SHA。

受控原件：`23.136.172.128:/srv/codeless-handoff/d28/20261103-a-diagnosis/a-original-failures.tar`，2416640字节，SHA256 `56a0f6bbe1ee4135c066dea0699848993eaf0f50c32aee5513a6ca6ab693f571`。使用B既有授权SSH身份，原件不上传GitHub。原00fd包及其下载/275成员核验仍保留在原受控目录，B已确认实际取得。

共享预算当前只读观测：原唯一账本revision2、B已对账零历史用量、无活动/预约、可花2元；A冻结付费，仍绑定00fd。最终候选尚未确定，因此未重封新包、未重绑定、未部署。未来须保留现用工具原字节，再将已审新版本用于同一数据库，按实时revision/eventHead追加绑定，不新建额度。

剩余阻塞：原EPERM/ENOTEMPTY/CLEANUP_FAILED未确定根因；B五批原件已取得并独立核验，但原未采集的代理日志、拒绝栈/句柄等仍缺。Windows完整门禁、真实质量、最终候选公网/ZIP身份及生产cover仍HOLD。已为联合时间线和定向捕获列出同次证据要求，不无计划重复全套测试。

范围仅A允许的docs/acceptance/backend.md、docs/handoffs/D28-A.md和tests/release/api/**；本轮无产品、契约、锁、CI、迁移或B文件变更。此前D08调度扩展及旧快照详见backend.md，不重写历史失败。未自批、合并或改main。开发token UNKNOWN；平台付费请求0/支出0，fixture与真实效果分账。

交接及可复现命令：`tests/release/api/D28-JOINT-DIAGNOSIS.md`；本轮证据：`tests/release/api/evidence/d28-diagnosis/`；完整验收记录：`docs/acceptance/backend.md`。
