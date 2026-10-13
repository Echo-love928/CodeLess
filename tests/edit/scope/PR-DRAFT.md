# D13-A: 局部组件修改最小上下文与文件范围限制

组件修改此前把整份基源码传给模型，并允许读取其他文件。此改动只传选中文件和有界导入依赖摘要，
从可信基 plan 保留页面/文件集合；GENERATE、REPAIR 和底层工具都限制为选中文件 read/update。
范围扩大提案返回明确失败原因，新草稿冻结前复核所有非目标文件 SHA256，失败不覆盖可用版本。

共享源码修改影响信息随任务响应头返回。沿用已有闭合请求/body 契约，客户端仍不能传 sourceFile。
源码、日志、页面和模型解释均按不可信数据处理，无公共契约、根锁、CI、迁移或前端/runner修改。

最终完整API203/203、本卡8+3全部通过；远端精确源码六项CI success（含static/runner69/E2E42）。
首轮本地gate因作者并发Maven污染exit1、停止的专项native0但INCOMPLETE，原日志和失败保留；
已增加排他锁/完成标记并串行复核API，不把旧失败改为成功。验证证据与最终阶段结果见 docs/handoffs/D13-A.md 和 tests/edit/scope/evidence/2026-10-13/commands.json。
专项采用明确命名 deterministic-mock 提案，数据库、构建、浏览器真实执行；不证明真实模型质量。
REPAIR 范围专项用显式 VERIFY fixture，不冒充真实修复闭环。

限制：旧版本原任务持久 journal 必须可读；摘要仅是 import 元数据，超范围需求需人工重新确认任务。
D13-B 尚无可获取候选，nonce/UI互审与同日真实联调待最后启用PR；不得自批或未经必需门禁合并。
