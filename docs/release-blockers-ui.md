# D26-B 体验阻塞与回归封口

2026-10-31（Asia/Tokyo）；任务分支 `codex/D26-B`，基线 `df6822e2330d82f0ed5cffaf033e4b54368e6e31`，产品冻结候选 `85155fd370d63e3694e43cceb7b9c6acce1e0c6c`。后续证据提交不改变候选的 UI、runner 或部署配置。

**整体发布仍 HOLD。** 本轮关闭下列三个可复现的 UI 键盘阻塞，不用确定性测试或旧批次成功给真实模型质量放行。D25 原九需求 6/9、自然 FAILED 编辑证据及生产自动封面执行缺口保留。当前未发现新增 P0，不等于已证明整个发布范围没有 P0；任何未解决 P0 都是延期信号。

## 已关闭体验问题

| ID / 原操作 | 根因 | 最小修复 / 回归证据 |
| --- | --- | --- |
| UI-26-01：仅键盘无法选中源码组件并发起修改 | 只有 iframe 指针 selection 消息能提供 candidate；平台没有可聚焦的源码组件选择入口 | `VisualComponentEditor.vue` 用冻结 mapping 展示原生 details/button；按钮仍调用原 component-selection 接口，只有服务器核对后显示确认表单。没有客户端 sourceFile 授权。取消清空选择/确认并返回 summary，描述保留。`keyboard-red.log` 首用例 exit 1；`keyboard-green.json` T1 通过。 |
| UI-26-02：键盘打开发布面板后 Esc 不关闭 | 面板 Esc 监听在 section，但焦点仍停在 section 外的发布按钮 | `DeployPanel.vue` 打开后聚焦关闭按钮；唯一 panel ID 与 aria-controls 关联；Esc/关闭返回原按钮，不引入模态焦点陷阱。red 第二用例失败，green 通过；375px 截图 `keyboard-publication-mobile.png` 可见焦点。 |
| UI-26-03：下载结束后 Enter 不能继续操作 | 下载按钮 loading 时 disabled，浏览器将焦点移到 body，重新启用不会自动恢复 | `SourceDownload.vue` 记录发起控件，结束并更新 DOM 后仅在焦点仍为 body 时恢复；用户已移动焦点、版本/用户已改变、已卸载时不抢回。`download-focus-red.log` 3/4、exit 1；green T3 与“不抢焦点”用例通过。 |

证据目录：`tests/regression/release-ui/evidence/`。红测报告与新增测试的首版绑定，不覆盖；最终 green 5/5、零跳过、零重试。UI fixture 中 API/model/build 为明确命名的替身，截图与生产 UI 由真实 Chromium 生成。fixture 的 `finish` 仅推进 HTTP 终态，不把它当真实模型或构建结果。

## 保留的发布阻塞 / 外部依赖

| ID | 状态 | 来源 / 解除条件 / 责任范围 |
| --- | --- | --- |
| REAL-QUALITY | HOLD，原需求 6/9 | `docs/handoffs/D25-B.md` 与 `docs/evidence/D25-B/issues.md` 的最新记录。原 TASK-02/CAT-01 JSON 拒绝及 TASK-03 入口冲突继续保留；不改冻结入口或分母提高成功率。由 A 在另行明确授权的真实复评范围内处理，本轮没有付费模型请求。 |
| REAL-FAILED-EDIT | NOT_COVERED | D25 六项真实编辑 6/6 是旧候选 fb79 的成功路径证据；自然 FAILED 编辑及先前发布保护仍未观察。本轮完整平台链只证明 deterministic-mock 受控构建失败保护，不能转换为自然故障覆盖。 |
| AUTO-COVER | HOLD | 最新 D25-B 公网/部署记录已证明 B 原三个公网页面 3/3、只读 cover GET 已部署，不能继续称“完全未部署”。但自动 capture worker=false，生产受限 IPC 尚无 capture 白名单；TASK-01 原 cover 两次 FAILED、无图、根因 UNKNOWN。保留读取/捕获两种状态，不重置队列、不启用 worker、不放宽角色。 |
| D26-A-REVIEW | NOT_AVAILABLE | 本轮只读查询打开的 PR 为 []，无 D26-A 分支/PR、契约差异或测试报告可审。需 A 提供精确候选后只读审查；本轮没有互批或自批。查询证据见 `peer-availability.json`。 |

旧公网 2/3、74/75 本地 E2E、原 gate1、历史模型/预算拒绝均保留在 D25 证据。本轮新结果只属于本轮候选，不抹除旧失败。A 与 B 的原机/数据库不操作，main 本地未提交工作不带入本分支。

## 文档操作路径核对与复测交接

以下对应 `docs/demo/D25-B.md` 的全部 10 个镜头及准备路径；“覆盖”写清模式。当前口播应以该文档首段最新记录和本清单为准，后续旧段落仅为历史；没有录制新生成/编辑视频。

| 操作路径 | 本轮验证入口 / 覆盖边界 |
| --- | --- |
| 准备、登录、恢复、任务状态、日志、取消 | 四阶段 E2E 的 auth/apps/generation/events/recovery 既有用例和真实隔离 full-product；原真实样本的 owner 会话仍由 A 保留，不恢复旧导出或冒充原身份。 |
| 镜头 01 姓名 / 02 正文颜色 / 03 间距 / 04 报名 / 05 共享 / 06 待办 | 六项真实编辑的 D25 证据保持 fb79 候选绑定；本轮 visual-edit 既有回归验证文案、颜色、间距、所有实例、失败与冲突，release-ui 新测试验证键盘选择/取消/确认、只发送三字段 selection、未知锁定。未为新 UI 候选重跑付费样本；A 受影响复测需保留原 task/base/version/diff 和未改文件摘要。 |
| 镜头 07 显式发布 | DeployPanel 既有与新增测试要求用户确认、VERIFIED/报告摘要匹配；REQUESTED 不显示成功链接；未知不重发；失败保留旧成功。历史预览不暗中替换面板明确显示的待发布版本。 |
| 镜头 08 封面 | 新 T3 明确显示 CAPTURE_TIMEOUT 占位提示且分享链接保留；既有截图/隔离用例执行真实 Chromium，拒绝私网/重定向/超时。生产自动捕获仍未启用，不冒充公网 cover 全通。 |
| 镜头 09 下载 | 新 T3 锁定发布 POST versionId 与面板导出 URL/响应头相同，错误版本响应有可见错误且不触发下载；使用显式 PK 字节 transport fixture，不宣称它是合法源码 ZIP。真实 full-product 另核对实际 ZIP 清单、源码/产物/版本以及历史 ZIP 字节。历史源码下载仍按源码区的明确选定版本。 |
| 镜头 10 受控错误 | 新 T2 保留 409、输入、unknown 和旧预览；既有 visual-edit/full-product 验证失败退出码、日志转义、旧 latestReady/发布/ZIP 保留。所有受控错误标记 MOCK，不转作自然 FAILED。 |

## 冻结与重开条件

产品候选 85155fd 冻结 UI、runner 与部署配置；本卡没有 runner/infra/templates/API/contracts/根锁/CI/公共文件改动。`apps/web/playwright.config.ts` 保留全部原 E2E 并把 release-ui 纳入同一 smoke，不降低 timeout、断言或隔离；专项配置仅限制该套件单 worker、retries=0。测试期间完整源码指纹及 changedSources 见 `verification.json`/原生记录。

A 应只复测受影响的选择→确认→编辑→新版本预览、错误/未知保留、显式发布→同版本下载以及不受影响历史版本；受影响真实样本仍需原身份/只增证据。任何后续产品提交都需解冻登记、说明差异、重跑受影响门禁与隔离回归，不能沿用本轮 success。无 PR 审批、真实验收和最终 SHA 必需检查 success，不合并。

产品候选85155fd远端六项全部SUCCESS：static Node64/UI206、API419、runner285、E2E80及真实full-product、infra-preflight、ci-gate；专项本地隔离21/21、exit0、源码未变。相同候选远端全部成功后停止本地重复聚合，保留原生exit1/FAILED并标记CANCELLED_DUPLICATE，不声称本地API或总门禁成功。取消后仅余原buildx容器，原工作树干净。

验证命令、退出码、计数、指纹、清理及候选远端状态统一见 `tests/regression/release-ui/evidence/verification.json` 和 `docs/handoffs/D26-B.md`。最终文档/证据提交须等待其自身检查，不继承候选success。
