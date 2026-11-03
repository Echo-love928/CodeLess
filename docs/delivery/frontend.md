# D29-B 前端交付说明

日期：2026-11-04（Asia/Tokyo）。工作分支 `codex/d29-b`；远端 main 基线 `aefaca193af3019bcadbcf8fdf3f6424baee750c`。D29 只补材料，不新增功能、不启用生产配置。

用户当天最新调整：不需要真人彩排及完整录像。以下按调整后范围交付，取消项不作为阻塞，也不写成已完成真人操作或已制作录像。

交付入口：[用户手册](../user-guide.md)、[完整演示脚本](../demo/full-script.md)、[本卡交接](../handoffs/D29-B.md)。安装环境见[环境说明](../environment.md)，范围见[scope](../scope.md)，接口依据见[contracts](../../contracts/README.md)。

## 现有证据与适用边界

主线已包含[D28-A 最终复审](../handoffs/D28-A.md)及[最终索引](../../tests/release/api/evidence/d28-final-review/summary.json)，候选 `1fe1389dee23efbb1b43c30f3ec1b8f546413087` 技术验收通过。需求为[增量组合8/9](../../tests/release/api/evidence/d28-final-review/quality.json)、代码故障3/3、环境2/2复用；TASK-03仍失败计入分母，不能说成同一批次全量9/9。生产provider与独立REAL质量批次分账，不将mock称为真实模型效果。

最终复审已核对[部署9项身份](../../tests/release/api/evidence/d28-final-review/live-identity.json)、[导出实物](../../tests/release/api/evidence/d28-final-review/export-verification.json)及[生产封面](../../tests/release/api/evidence/d28-final-review/live-cover.json)：封面SUCCEEDED、1次尝试、PNG1280×720/13505字节；不是仍停留61版本或生产cover未交付。它们是D28对应候选的历史真实核验，D29未重复公网/认证操作，也不把它们写成今天的新现场结果。

[D28-B早期交接](../handoffs/D28-B.md)首节及[6/9状态](../../tests/release/browser/evidence/d28/release-20261103/status.json)保留原失败时间线，不能覆盖后续最终复审。历史根因UNKNOWN按用户决定留档不再阻塞，不写成已修复；实际账单仍UNKNOWN。历史Windows门禁、双用户及390px流程同样不冒充D29真人演示。

## D29 接纳状态

| 子项 / 用例 | 本轮结果与接手 |
| --- | --- |
| B01 / T1 操作脚本 | 原真人交换演示要求已取消；已提供七镜头步骤、观察点和失败分支。 |
| B02 七镜头 | 脚本已覆盖需求、计划、修复、选择修改、发布、封面、下载；不虚构实际完整现场执行。 |
| B03 / T2 展示标识 | 原完整录像要求已取消；现场/mock/历史模式、日期和版本标识规则已提供，未来录制规则保留为可选参考。 |
| B04 / T4 手册 | 按 main 源码核对操作、失败和范围，关键控件名自动检查及现有UI测试完成；未额外开展手工浏览器逐步走查。 |
| T3 链接 | 本卡相对文件链接运行自动检查；私有录像/现场地址尚未交付，无占位URL；外网与受控链接可达性未验证。 |

## 交接顺序

1. 接收已交付的D28最终候选与原件索引，保留早期失败、TASK-03和预算账本；不要求A重复已完成修复或部署。
2. 实际演示先记录当天运行身份。若运行版本变化或另行部署，再在既有授权范围内验证同源URL/ZIP/封面，不把历史核验直接套给新版本。
3. 按调整后 T1–T4核对脚本、模式标识、链接和手册；真人彩排和完整录像不再是前置。未来如自选录制，再使用脚本中的可选规则。
4. D29-A [PR98](https://github.com/Echo-love928/CodeLess/pull/98)需独立只读互审，结论见本卡交接；不代替同伴批准。精确HEAD必需检查、批准、最新main与讨论均满足前不合并。

本轮维护者接收：产品/文档 SHA、七镜头脚本、手册、文档检查及阶段门禁回执、原件获取定位和剩余限制。实际发布时仍需部署清单和PNG/ZIP同源证据，不能凭材料放行。私密日志和凭据不进入 Git；本轮不要求视频索引或真人记录。当前完整发布门禁仍 HOLD。
