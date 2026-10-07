# M1 真实模型同任务验收：可审查 payload

候选：独立 codex/d10-m1-integration，包含 A7c460a1 和 B9f1a9ea；main adb79b8 不变。
状态：入口已准备，尚未开始付费请求。
目的：真实 PLAN / GENERATE / REPAIR → 同任务真实重建与浏览器 → 签名隔离预览。

## 外发内容与目的地

目的地固定 `https://api.deepseek.com/chat/completions`；现有模型 `deepseek-flash`。
API key仅作为生产provider Authorization header，绝不写入消息、日志、源码、浏览器/runner子进程或提交。

合成任务要求原文：

> 生成 Ada Lovelace 个人展示页，静态数据展示姓名、简短介绍及两件作品：Analytical Engine 和 Note G。恰好两个文件：src/pages/HomePage.vue、src/components/ProfileCard.vue。先读取依赖源码，保持组件接口和页面数据类型一致。不要外部图片或请求。

PLAN/GENERATE会发送上述需求、公开仓库已有策略/Schema/文件工具描述、模型返回的计划、工具观察。
REPAIR会发送同一需求、原验收actions、该任务生成的Vue源码或文件摘要、真实编译错误、相对文件路径及工具观察。
这些消息包含隔离任务UUID、文件大小/摘要/错误码；不包含宿主绝对路径、客户数据、凭据、私有项目源码或仓库枚举结果。

## 可复现故障与真实性边界

每次模型请求都由真实DeepSeek provider执行，没有mock模型、网络重试或fallback。
仅在首次真实GENERATE返回HomePage工具提案、且使用`../components/ProfileCard.vue`时，测试在源码冻结之前将该import一次替换成`../components/M1MissingCard.vue`。
这是明确披露的宿主测试故障注入，不能冒称模型自发生成了错误。原始provider回复、注入前后源码摘要和实际失败构建分别保留。
真实模型必须根据随后实际TS2307诊断修复，原验收动作保持逐项相等，真实重建和浏览器通过才能READY。
如果无法注入或没有实际REPAIR成功，验收失败，不改断言或改为成功。

## 次数、费用与停止条件

仅1个新隔离任务；任务总上限12次模型请求、20工具slots、50,000 runtime tokens、12分钟、最多3轮代码修复。
使用现有API账户，会产生模型调用费用；不增加余额、不修改账户设置。
出现网络/模型接口失败立即终止任务，不用外层重试覆盖；未知usage保留NULL和保守估算。
浏览器/数据库/容器真实运行，平台预览密钥为既有明确测试密钥；不发布生产应用或合并PR。
原两次MODEL_NETWORK、Windows cleanup、exit137/oomKilled=false失败证据保留原样。新调用用量、任务ID、日志和截图单独记录。

执行入口：`cd services/api; ./mvnw.cmd -Dtest=RealRepairPreviewPlatformAcceptanceIT test`。
必须显式设置`CODELESS_M1_REAL_APPROVED=1`才可执行，只有得到上述payload/付费调用的明确授权后才设置。

首个授权任务已执行：task57776370-dd0b-4ed7-9931-cf6ff55e9ec4，4请求/10101实测tokens，FAILED/AGENT_MODEL_PROTOCOL_INVALID。原有tool/done协议保持不变，未自动重试。下一个独立任务必须另有明确授权。
