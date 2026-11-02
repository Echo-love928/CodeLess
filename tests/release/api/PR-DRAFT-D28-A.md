D28-A｜修复候选验收调度并补齐独立取证（HOLD）

原PR94@438c0f5的D08原生验收约第78秒才开始，在120秒全局截止处造成79通过/1未运行及suite/teardown错误。将D08放入首项目排队，其余79项保持原Chromium配置；80个file/title身份逐项相同，原断言、120秒全局截止、零重试及隔离不变。修复提交4eb9595六项必需检查全部success：E2E80及完整平台browserExit0、API428/428、runner285/285、static64+212、infra/ci-gate。[运行41411371862](https://github.com/Echo-love928/CodeLess/actions/runs/41411371862)。后续证据提交自身检查另看PR，不继承旧SHA。

- 最小范围扩展仅apps/web/playwright.config.ts的调度，对B影响仅D08项目名/trace路径；无产品运行代码、公共契约、锁、CI或迁移变更。
- d28_record.py改为显式参数/标准环境发现Java21并拒绝错误版本，移除A机器路径依赖；4项新增可移植性控制及原4项证据接纳控制通过。补充只读精确HEAD CI记录器和私有ETW筛选器。
- 原Windows干净438提交完整corepack pnpm verify:api原生0，428/428、fail/error/skip0；90份新JUnit与日志摘要复算一致，源码/HEAD前后相同。首次Docker未运行导致的前置失败完整保留。授权128MiB管理员文件元数据追踪start0/stop0，ETL私存；本次BARE预期NO_PROGRESS。底层rename拒绝后另一rename成功，不等于复现原Node EPERM，不将同时出现的进程访问归因为历史占用者；无断言、应用重试或清理限制变更。
- 当前部署61经授权strict-host SSH只读取证9项通过：实际JAR fd、worker、镜像ID/revision、258源码、7web及agent/export根匹配选定清单。未部署新候选、重启或改生产数据。PR95@80205692已审，23处Git blob证据摘要匹配；原gh与direct日志获取差异已有证据，不再列为材料/未解释摘要缺件。

当前HOLD：历史EPERM/ENOTEMPTY/CLEANUP_FAILED根因、真实模型质量和生产cover未闭环，新候选未部署；新绿结果不关闭旧事故。API/runner维护者需取得同次失败的句柄生命周期/拒绝栈并给出最小修复及新候选受影响重测。证据见tests/release/api/evidence/d28-fix/和验收/交接文档顶部。付费模型请求0，合成累计用量与开发token UNKNOWN、分账记录。未批准、未发送review/comment、未合并。
