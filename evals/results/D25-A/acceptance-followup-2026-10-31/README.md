# D25-A｜对B 85b58c3的零付费补证，整体HOLD

基线A交付35a9ef3d3ba68519586e06592bce9dad2235a1e1；B审查85b58c37e5a2ff4663f4d0acc8e7ee938716b5d3。任务分支codex/d25-a-acceptance-followup。实际原编辑候选仍fb79c402de6b66bc849e87b6880bf955488f8032；另行E2E在PR84/380811d5270a72706fad0b1a74b7ffab8b97735a执行，源码不变。新费用/模型请求均0，没有重跑九需求、编辑或故障批次。

## 本轮实际完成

| 项目 | 原生结果 | 证据及限制 |
| --- | --- | --- |
| 原机恢复 | 原数据库容器仍在，因停机已停止约11小时；只启动原容器和原fb79 API，没有创建替代数据库、导入快照或改版本 | runtime-resume.json、runtime-check.json；任务调度/发布worker/恢复扫描关闭，模型密钥未传，provider为未使用的明确mock；历史REAL记录不变 |
| 原身份/版本 | 六项READY、六个VERIFIED版本、三个PUBLISHED，模型行数26→26，正常原账户登录通过 | runtime-check.json；会话仅私存，时效是当时观察，旧会话不视作长期有效 |
| 同版本公网补验 | 外层native0，三应用初次及刷新3/3；18次真实网络资产请求，TLS授权/证书/公有IP/长度及摘要核验，原三秒期限不变 | public/report.json、各result.json、截图；旧2/3及SHOW-02两次失败完整保留，不覆盖、不合并原统计 |
| 功能页面截图 | 同publication/version/source/artifact；SHOW-01/02为/，TASK-01为/tasks，均实际捕获并人工核看 | entry-binding.json；是operator功能页面补证，productionCoverRouteEnabled仍false，旧队列与FAILED终态完全不动 |
| 入口关联检查 | native0，4/4，0 skip；原native记录关联、错误版本/源码/artifact、MOCK、非法/歧义路径、失败浏览器/动作均覆盖 | entry-unit-final.json/log（entry-unit为注册前的原生结果，保留）；新脚本verified-entry-evidence.mjs及既有generation静态测试入口；不是生产鉴权或启用 |
| PR84完整E2E | pnpm verify:e2e native0，75/75，完整平台链PASSED/browserExitCode0 | e2e/result.json；02:26:24Z–02:30:33Z；源码/HEAD未变，测试改写9份历史PNG已恢复 |
| 清理观察 | 本轮150ms用例的实际taskkill /T /F native0、worker关闭；未修改断言/期限/清理决策 | e2e/cleanup-events.jsonl；原74/75与全gate1继续保留，未复现原根因，不称生产缺陷已修复；此次仅E2E复验，不称新完整ci-gate0 |

public中verifiedAssets为浏览器路由供给记录，可能包含同阶段原生reader缓存复用（TASK-01行为测试内多次reload）；http数组才是实际网络请求。本轮每应用initial/refresh各三次新网络读取，最终刷新明确新建reader。没有把缓存、本地fixture或SSH文件副本算成新HTTPS读取。系统fake-IP不作为公网目标；本轮在A用实时受控VPS DNS结果做公有地址校验并固定TLS连接。B本机直接公网复核仍待其独立完成，A不替B登记通过。

TASK-01功能PNG与原生VERIFY截图摘要相同，SHOW-01亦相同；SHOW-02初始PNG与原VERIFY末态不同，原VERIFY包含点击后的确认，本轮initial在点击前，行为/刷新后的确认由实际断言另核，不强求不同状态图片相同。图片不同不被改写成相同。

## 仍然阻塞及下一步

- 原九需求6/9、代码1/3、原环境0/2、原13/14不完整及单列ENV-02补验仍分别保留；PR84真实生成仍NOT_EVALUATED。没有新的付费授权，不能启动真实模型复评。
- 新功能页面补证不等于生产封面。现协议根路径限制与生产cover缺失的最小差异见COVER-CONTRACT-PROPOSAL.md；涉及API/runner/UI/公共契约的独立生产任务及维护者尚须明确，本轮没有生产改动或VPS启用。
- 自然FAILED编辑保护仍未观测。本轮未新增任务；CONTROLLED-FAILURE-PLAN.md给出隔离克隆库的零付费真实失败补验及证明边界，不冒称自然失败、不改原分母。
- 旧本地清理异常保留。当前完整E2E通过是新增观察，不能据单项或此次通过推断原异常根因已解决，交B增量复核。

## 可复现性、阶段门禁与互审

同版本公网脚本源码在operator-sources/supplement-public-2026-10-31.mjs，按原.local-data/d25-a位置解析相对导入；私密SSH配置和会话仅A持有。现有TLS/IP/资源限制未改，脚本没有重试环。公网补验每版本一次；不得覆盖本目录或重置原队列“直到成功”。

入口复算：node scripts/eval/verified-entry-evidence.mjs <原六项records/EDIT-06.json> <原execution/EDIT-06-journal.json>，native0、entryPath=/tasks；边界回归node --test tests/eval/generation/verified-entry-evidence.cases.mjs，native0/4项。PR84 E2E完整原命令、源码摘要、native0及日志SHA保留；完整私有日志不公开，观察器源码归档。原API401/runner268/static/ci-gate及远端检查均保留原日期，不当成本轮执行；本轮新增只读评测helper没有修改生产模块，受影响静态门禁另记真实结果，最终交付HEAD CI须独立产生。

互审B85b58c3：仅新增评测证据/报告及终态索引，接受原六项成功路径，不冒称总体放行；正确区分6/6与生成6/9、fake-IP未完成与功能失败、原生队列与功能封面、单项0与历史全gate1、离线mock证据与REAL。B本轮没有独立运行A私有wire，报告明确此限制。B最终HEAD CI状态以其PR81实时结果为准。

开发agent input/output/合计UNKNOWN，计量来源UNKNOWN；平台本轮新调用0，原14次KNOWN/65427token/0.171768元上界及实际费UNKNOWN独立保留。main、固定候选、原样本、日志、冻结动作、严格解析、运行时上限未改；保持HOLD，不自批、不合并。A保留原运行时及备份直到B确认。

本轮static native0：../commands/2026-10-31T02-39-22.640Z-static/command.json，62 Node、201前端及lint/typecheck/build通过；早先02-36静态58项仅证明旧显式清单，通过后发现新文件未自动纳入，已在report.test.mjs导入cases模块，未改根入口/CI。两个真实结果均保留，不把前一次58宣称62。
本轮没有新录WebM，原SHOW-01视频保持原样；public/report.json中的videoScope是复用脚本保留的范围说明，不是新视频交付。

用户现已明确选择“允许开始独立生产 cover PR，按方案协调公共契约”。下一阶段在独立生产分支实现，默认开关关闭、不部署VPS、不新增付费；本目录当前补证没有生产改动。自然失败受控方案仍未执行，真实生成复评仍无授权。
