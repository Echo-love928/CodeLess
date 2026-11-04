# CodeLess 最终交付索引（D30-B）

核验日期：2026-11-04，Asia/Tokyo。材料基线 main `6998a42395004d3e358d1cb127261e815456b05e`，分支 `codex/D30-B`。本轮仅交付材料及核验工具，部署身份不能用文档提交号代替。

真人彩排和完整录像已按用户要求取消，不计未完成或阻塞，不提供虚构视频或真人记录。

## 接收入口与身份

| 交付物 | 入口 | 当前证据与访问条件 |
| --- | --- | --- |
| 平台 | [登录页](https://app.codeless-platform.top/login) | 本轮匿名 GET 200；受控试用账号由维护者私下交接，不在文档中提供密码。当前运行 provider 的历史核验为 deterministic-mock，不能当作 REAL 效果。 |
| 公开示例 | [首页](https://dbb96bd04435f85609839d336c0d87aff.sites.codeless-publish.top/)、[任务路由](https://dbb96bd04435f85609839d336c0d87aff.sites.codeless-publish.top/tasks)、[目录路由](https://dbb96bd04435f85609839d336c0d87aff.sites.codeless-publish.top/catalog) | 本轮三个 GET 200，只证明可达，不证明每个路由具备任务/目录业务。该样例导出中两个路由为 TEMPLATE_DEFAULT。 |
| 生产封面 | [所有者封面接口](https://app.codeless-platform.top/api/v0/publications/bb96bd04-435f-8560-9839-d336c0d87aff/cover) | 本轮匿名 401 为预期；所有者在平台“刷新封面”后查看。历史生产PNG 1280×720、13505字节，任务SUCCEEDED/attempts1，绑定见下表。 |
| 生成源码包 | [所有者下载接口](https://app.codeless-platform.top/api/v0/versions/bc53e8eb-08c3-4e1c-b41c-9667b98ac0fe/export) | 本轮匿名 401 为预期；所有者选择版本后“下载源码”。不是公开免登录下载。原 ZIP 21087 字节/16成员，按包内说明运行，见[最终客户端说明](final-client.md)。 |
| 仓库与历史 | [GitHub](https://github.com/Echo-love928/CodeLess) | 本轮匿名 API 确认 public；[D29历史与PR溯源](../../tests/delivery/backend/evidence/history.json)。 |

以上新观测：[匿名HTTP回执](../../tests/delivery/client/evidence/public-first.json)。它不包含新的所有者登录，也不重新证明当前服务器的源码身份；新候选切换后必须重验。

| 绑定项 | 精确值 / 证据 |
| --- | --- |
| D28 已核验运行源码 | `1fe1389dee23efbb1b43c30f3ec1b8f546413087`；[9项部署身份](../../tests/release/api/evidence/d28-final-review/live-identity.json)。 |
| 示例 application/version/deployment | `8a90ae7a-3139-45de-81e4-c6cb6a56531b` / `bc53e8eb-08c3-4e1c-b41c-9667b98ac0fe` / `bb96bd04-435f-8560-9839-d336c0d87aff`。 |
| sourceDigest | `sha256:2239f682cdf36d1fccd9adb61fe0c64736730a0d33191ec3364b09316179b9e9`。 |
| artifactDigest | `sha256:05dc193860ef0024013f76933f991b4603faa12d981d0b935877a9339d004393`。 |
| ZIP SHA256 | `c4d094306dad2914acd577750df68e2b2050d692fc72335addf7583f077775c9`；[独立成员/清单核验](../../tests/release/api/evidence/d28-final-review/export-verification.json)。 |
| PNG SHA256 | `473228039b33e71acdc389e703d0e3456747996361a5cd0ec495bfe2de0a2af6`；[生产封面账本与字节](../../tests/release/api/evidence/d28-final-review/live-cover.json)。 |

## 操作、安装和演示材料

- [用户手册](../user-guide.md)：登录、新建、生成修复、组件编辑、发布、封面、下载、失败恢复。
- [安装](../install.md)、[排障](../troubleshooting.md)、[环境](../environment.md)、[后台](../admin-usage.md)、[恢复](../recovery.md)。
- [七镜头脚本](../demo/full-script.md)、[前端交付](frontend.md)、[后端交付](backend.md)、[后端讲解](../demo/backend-script.md)。现场REAL、现场mock与历史证据须标明，不要求录像。
- [scope](../scope.md)、[architecture](../architecture.md)、[契约入口](../../contracts/README.md)、[导出契约](../../contracts/export/README.md)、[封面契约](../../contracts/cover/README.md)。

## 验收和测试索引

| 材料 | 已验收范围及限制 |
| --- | --- |
| [D28 最终复审](../../tests/release/api/evidence/d28-final-review/summary.json) | 技术验收通过；需求为增量组合8/9，代码故障3/3、环境2/2复用。TASK-03仍失败；没有同批全量9/9。 |
| [质量与原始记录定位](../../tests/release/api/evidence/d28-final-review/quality.json) | 独立REAL批次与生产mock分账；实际账单UNKNOWN。历史失败保留，不因整理文档改写。 |
| [前端独立流程验收](../acceptance/frontend.md)及[D28-B交接](../handoffs/D28-B.md) | 含两个独立用户、权限拒绝、失败保留版本、桌面/390px真实浏览器；早期HOLD为历史，当前取D28-A最终复审。 |
| [D29-B回执](../../tests/release/d29-evidence/summary.json)及[交接](../handoffs/D29-B.md) | UI213/213、static/API补验通过；本机原runner/E2E/聚合失败保留。取消真人/录像不取消门禁。 |
| [本轮门禁](../../tests/delivery/client/evidence/configured-20261104/gates.json) | 按命令逐项查看 nativeExitCode/signal；日志原件在当前克隆的 .local-data/d30-b，公开只列摘要，不把历史绿灯当本轮通过。 |
| 本轮符合性与60任务机器账本：`tests/delivery/client/evidence/offline-final.json` | 核验本索引本地文件目标、D28历史摘要、仓库五项证据。与[本卡交接](../handoffs/D30-B.md)一起接收。 |

## 截图所列仓库五项要求

| 要求 | 对应证据与可复现核验 |
| --- | --- |
| GitHub/Gitee公开或提供评审访问 | 本轮 public-first.json 匿名200、repositoryPublic=true；不冒称已验证某个私有评审账号。 |
| 结构清晰、注释和主流规范 | README目录、architecture、apps/web/eslint.config.js；runner构建边界注释见 services/runner/src/template/build.mjs；本轮 verify:static 包含lint/typecheck及真实测试构建。 |
| README项目介绍、架构、安装运行、团队 | [README](../../README.md)五段及[安装指南](../install.md)，offline-final.json记录文件摘要/必需段落；D29安装材料回归保留。 |
| 完整真实Git历史 | offline-final.json保留基线提交数、8条主线和作者计数；D29 history.json记录真实PR/审查/来源。集成主线不等于两名真人贡献计量，不补造提交。 |
| 环境模板与依赖清单完整 | [.env.example](../../.env.example)、[环境](../environment.md)、[根锁文件](../../pnpm-lock.yaml)、[模板锁文件](../../templates/vue/pnpm-lock.yaml)、[构建镜像](../../infra/build-image/Dockerfile)；offline-final.json记录原文件摘要。 |

复现：`python tests/delivery/client/audit.py offline --out tests/delivery/client/evidence/recheck-unique.json`。输出路径必须全新。文件存在/摘要一致不等于完整产品验收通过。

## 30天成员任务账本

以下按60个任务ID登记交接；“已交接”只说明原报告存在，不将原报告中的失败/未知改为完成。每卡子项、原命令和实际验收以链接中的报告为准。没有统一可信的60卡验收计数，整体完成率保持UNKNOWN。D28以最终复审覆盖早期状态，D29按取消要求交付材料。D30-A未交付时不列完成。

所有卡的开发 input_tokens / output_tokens / 合计及计量来源在本轮汇总均为 **UNKNOWN / UNKNOWN / UNKNOWN / UNKNOWN**；原卡若有实测局部值，仍以原报告为准，缺跨批累计不相加伪造总量。每天60,000预算不是实际消耗。机器账本逐行保留null；本卡运行时付费请求0、mock累计UNKNOWN，独立REAL预算及UNKNOWN占用见D28质量账本，不混入开发token。

| 任务日 | 成员A | 成员B | 验收登记 |
| --- | --- | --- | --- |
| D01 | [D01-A](../handoffs/D01-A.md) | [D01-B](../handoffs/D01-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D02 | [D02-A](../handoffs/D02-A.md) | [D02-B](../handoffs/D02-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D03 | [D03-A](../handoffs/D03-A.md) | [D03-B](../handoffs/D03-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D04 | [D04-A](../handoffs/D04-A.md) | [D04-B](../handoffs/D04-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D05 | [D05-A](../handoffs/D05-A.md) | [D05-B](../handoffs/D05-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D06 | [D06-A](../handoffs/D06-A.md) | [D06-B](../handoffs/D06-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D07 | [D07-A](../handoffs/D07-A.md) | [D07-B](../handoffs/D07-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D08 | [D08-A](../handoffs/D08-A.md) | [D08-B](../handoffs/D08-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D09 | [D09-A](../handoffs/D09-A.md) | [D09-B](../handoffs/D09-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D10 | [D10-A](../handoffs/D10-A.md) | [D10-B](../handoffs/D10-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D11 | [D11-A](../handoffs/D11-A.md) | [D11-B](../handoffs/D11-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D12 | [D12-A](../handoffs/D12-A.md) | [D12-B](../handoffs/D12-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D13 | [D13-A](../handoffs/D13-A.md) | [D13-B](../handoffs/D13-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D14 | [D14-A](../handoffs/D14-A.md) | [D14-B](../handoffs/D14-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D15 | [D15-A](../handoffs/D15-A.md) | [D15-B](../handoffs/D15-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D16 | [D16-A](../handoffs/D16-A.md) | [D16-B](../handoffs/D16-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D17 | [D17-A](../handoffs/D17-A.md) | [D17-B](../handoffs/D17-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D18 | [D18-A](../handoffs/D18-A.md) | [D18-B](../handoffs/D18-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D19 | [D19-A](../handoffs/D19-A.md) | [D19-B](../handoffs/D19-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D20 | [D20-A](../handoffs/D20-A.md) | [D20-B](../handoffs/D20-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D21 | [D21-A](../handoffs/D21-A.md) | [D21-B](../handoffs/D21-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D22 | [D22-A](../handoffs/D22-A.md) | [D22-B](../handoffs/D22-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D23 | [D23-A](../handoffs/D23-A.md) | [D23-B](../handoffs/D23-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D24 | [D24-A](../handoffs/D24-A.md) | [D24-B](../handoffs/D24-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D25 | [D25-A](../handoffs/D25-A.md) | [D25-B](../handoffs/D25-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D26 | [D26-A](../handoffs/D26-A.md) | [D26-B](../handoffs/D26-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D27 | [D27-A](../handoffs/D27-A.md) | [D27-B](../handoffs/D27-B.md) | 已交接；子项通过/失败/未知见各原报告，本轮不重新验收 |
| D28 | [D28-A](../handoffs/D28-A.md) | [D28-B](../handoffs/D28-B.md) | 最终技术验收通过；以D28-A最终复审为准，TASK-03保留失败 |
| D29 | [D29-A](../handoffs/D29-A.md) | [D29-B](../handoffs/D29-B.md) | 调整后材料已交付；本机历史门禁失败保留，不含真人/录像要求 |
| D30 | D30-A 未交付 | [D30-B](../handoffs/D30-B.md) | A待交付/互审；B本卡验收见交接，未声称M6整体完成 |

## 后续优先级

1. P0：收齐D30-A最终版本归档、恢复/权限/质量原件交接并独立互审；本PR精确HEAD所有必需CI真实success、同伴批准及讨论解决前不合并。
2. P1：按本轮门禁的实际失败定位环境或产品问题，跨模块修复另由维护者处理；不得靠重试删除首轮失败。
3. P1：TASK-03真实模型失败与精确账单UNKNOWN继续登记；本轮没有付费复评授权，不重跑历史批次。
4. P2：新部署发生变化时成组验证身份、用户授权下载、封面和公开资源；本轮已有可达性不等于新部署验收。
