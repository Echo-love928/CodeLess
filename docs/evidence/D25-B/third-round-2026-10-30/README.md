# D25-B 第三轮独立验收：公开部分完成，真实交接继续 HOLD

交付 cf80bed8dc180a1df3517d0ed1e15799b819737b；生产候选 fb79c402de6b66bc849e87b6880bf955488f8032；原批次 2026-10-30T08-15-32Z-real-29ffed9b。B 冻结评测器执行提交 6ecf3f5050c47e24ffe211a32e60460a2a6c033d。A交付中的生产 API/runner/prompts/templates 与固定候选 Git 内容无差异；B仅离线重建，其runner/templates/构建配置与fb79相同，不运行B早期API/提示。B的evals/browser与该交付一致；具体范围见candidate-source-link.json。B 原命令 canonical=true、changedSources=[]，先执行原评测再补本报告，不把后续报告提交冒称执行 SHA。

## 阻塞问题

1. 原九需求经真实 Docker/Vue/Chromium 独立复测，**冻结评测器5/9，native exit1**。通过 SHOW-01/02/03、TASK-01、CAT-02；TASK-02/CAT-01 平台失败；TASK-03 在 /tasks 为受控模板占位页，购物实现写在 HomePage.vue，textbox 等待超时。见 behavior-report.json、TASK-03.png 及 verification.json 中原记录诊断。未重跑付费生成，分母保持9。
2. **CAT-03 是评测器结构误拒，需要单列。** 原 ToolCard.vue 把类别与许可证放同一 p，用全角空格分隔；冻结探针按 p/dd 段数要求≥3，数到2而失败。这不是许可证或类别缺失的证明；详情也采用卡片内联段落，不应预设必须有独立详情 heading/region。原5/9不覆盖、原失败不删除。B新增 case-specific 语义复核已完成九条实际字段、逐项展开/收起详情、全部类别、关键词/类别交集、清空搜索仍保留类别、无结果文本、后续列表和 STATIC 刷新默认状态，全部通过。故障注入到一次性 DOM 的“错许可证”“错简介”两对照都被检出。语义结果见 cat03-semantic.json 与 CAT-03-actual.png；两个 negative 截图是人工 DOM 反例，不能演示成原应用缺陷。补充观察可描述为5个原通过＋CAT-03语义通过（6/9），**不是重写冻结评测器得分或完成新的严格定稿**；两种视图均未达8/9。
3. 原代码故障1/3、环境0/2保持。CODE-02在PLAN 503，尚未注入；CODE-03已注入、REPAIR遭503；ENV-01在PLAN 503，未到受控构建故障路径。诊断来自原journal，仅记录原始类别/阶段，不把HTTP503猜成模型语法错误或源码根因。TASK-02/CAT-01的原SYNTAX仍拒绝，不改解析或重试。
4. 用户已答复**密文和密钥尚未交接**。B未解密、未校验893文件、未恢复SQL/原应用/版本、未登录、未执行六项真实编辑/权限/历史保护，也未执行公网页面/封面/下载/录屏验收。A的6/6只读预检不是B终态，不复用A回环或会话。B另付费编辑未获授权，不启动；A的2元只属于A。

## ENV-02 独立接受结论

**接受单列补验作为 ENV-02 首次实际 JVM 的补充验收证据。** 原spec字节相同、候选fb79相同、原拒绝/缺record保持；补验的JVM native0/无超时、无harness error、真实拒绝代理、FAILED/MODEL_NETWORK/MODEL_INTERFACE、仅一次UNKNOWN调用、0工具、0修复均核对，共11/11。原批次全部文件与补验前originalDigests相同，spec及记录身份吻合，辅助诊断复算 native0。

这不改变原批次 **13/14、不完整、177/178、native1**，不覆盖A的acceptedByB=null或旧报告；B的接受结论只写在本目录。原环境成功率仍0/2，补验另列PASSED，不自动合并成功率，不授权再次运行补验。原严格定稿因缺ENV-02拒绝仍应保留。

## 独立费用/用量

直接逐条相加原 modelCalls，加上单列补验：51条、47已知/4未知；input下界147910、output下界24323、合计下界172233；精确总量UNKNOWN。含未知调用的原3个任务各完整持有0.4元，不填零。

按执行回执固定上界单价输入2元/百万、输出8元/百万，不假设缓存/折扣：原13条上界1.63467元；已授权且强制第一条PLAN失败的单次补验，在总token≤50000、输出≤4096时上界为 `50000×2/1000000 + 4096×(8−2)/1000000 = 0.124576` 元；累计 **1.759246≤2元**。这是保守上界，不是实际账单；实际费用UNKNOWN。详见 metrics.json 与可重复运行的 recompute.mjs；不使用当前价替换历史回执。

## 命令、退出码与证据

从 B 根目录执行，`<A>` 是 cf80bed8 独立检出，`<batch>` 是其中原第三轮批次。完整原私有日志不公开会话/密钥；公开摘要及日志SHA在verification.json。

| 命令 | 原生结果 | 证据 |
| --- | --- | --- |
| `node scripts/eval/verify-batch.mjs <batch>`（A checkout） | 1；177/178 | original-integrity.log，原缺ENV-02继续失败 |
| `node scripts/eval/supplement-status.mjs <batch> <supplement> <A-behavior> <A-status> --check` | 0；HOLD/不完整/单列补验PASSED | verification.json；未调用任何付费启动脚本 |
| `node scripts/eval/final-metrics.mjs <batch> <A-behavior> <新定稿输出>` | 1；完整性断言拒绝、未创建定稿文件 | strict-finalization.log；不能用补验强行定稿原批次 |
| `node evals/edit-results/third-round/recompute.mjs <A> <新metrics输出>` | 0；11/11、原文件摘要、整数费用及UNKNOWN核对 | metrics.json |
| `node evals/browser/record-command.mjs batch <batch绝对路径>` | 1；REAL9行、5pass/4fail；六编辑NOT_EXECUTED | behavior-report.json、verification.json、7张样本PNG；原trace留私有run目录 |
| `node evals/edit-results/third-round/cat03-semantic.mjs <B-report> <batch> <新输出目录>` | 0；原产物的完整语义与2个DOM负对照通过 | cat03-semantic.json，源码摘要在verification.json |
| 四个费用/执行/加密/交接测试文件 `node --test …` | 正常权限0，24/24；沙箱首次1，23/24（junction清理ENOENT） | aux-normal.log；首次环境错误不抹除、不冒充通过 |

首次B批次构建器因Docker未运行在任何样本执行前失败，native1。启动本机既有Docker29.9.2后，新目录运行真正九样本；原失败命令及SHA仍在verification.json。没有修改原数据或通过重复模型调用碰运气。此处DOM补充检查使用已重建并校验摘要的同一CAT03产物，未重新生成或修改不可变源码。

## 建议与接手前提

- 将CAT03探针按字段语义及内联详情做独立维护修正，覆盖紧凑元数据正例、错误/缺字段及展开失效反例；不要为本轮绿灯删除字段、详情或筛选断言。本次不改冻结全套评测器/原5/9数据。
- TASK03应进入独立生产问题单：计划声明路由与实际承载页面一致；不能把测试/tasks改到/来凑分。JSON/503等原失败保留，任何新付费批次另行确定，不重跑本轮样本替换成绩。
- 用户私下分开交付密文/密钥后，先核对密文 `87b5073c292c7b604a5c32860cb00088241d7deb0fd6871dacbb46a326276d4b`（1555096字节），再用A脚本在新私有目录认证解密，核对manifest `4a3978260c376496311ae3b88e436328da6da9a0eea197ac43e2af86cf51aa23` 与全部893文件/13+1身份。这些当前只是A回执给出的预期值，**B未收到文件、未验证实际包**。
- 校验后才在fb79恢复原三个应用/任务/不可变版本并合法登录，重查会话与依赖版本；再准备具体六项请求，取得B单独付费执行范围后按01→02→03→05、04/06独立执行。预检不计编辑成绩。公网页面/封面/下载及录屏均需对应新终态证据。

## 已核验内容与限制

交付精确cf80bed8六项CI success已查询，不能解除以上HOLD。B仅执行无模型复算、辅助测试、真实构建和浏览器；新增付费调用0。原执行预算/解析/分母/失败均未改。新 `evals/edit-results/third-round/index.json` 对应fb79，六编辑与三公开链位置全为NOT_EXECUTED/null；历史a863或早期MOCK不替代。

开发agent input/output/total UNKNOWN；平台B新增付费请求0，A实际用量与费用另账如上。报告为可复现公开阶段交付，非整体D25-B完成/批准；main、A原批次及候选源码未改，未合并、未发布应用。
