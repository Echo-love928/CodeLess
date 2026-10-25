# D21-B 需求行为与组件编辑评测

## 2026-10-25：真实编辑记录接入

`evals/edit/collect.mjs`只采集**已经存在且已终结**的组件编辑任务，不创建任务、不调用模型、不轮询重试。
它读取服务端 `tasks/{id}/edit`、前后版本/snapshot/文件内容、基版本 component-mapping 和管理员 model-calls。
所有输出是原始响应对象，附记录摘要；随后由独立重放判断，采集成功本身不表示验收成功。

准备任务索引（六项中的可用项；未提供的项仍未执行）：

```json
{"batchId":"A批次ID","mode":"REAL","tasks":[{"sampleId":"EDIT-01","taskId":"实际组件编辑任务UUID","versionId":"该任务产生的版本UUID"}]}
```

失败任务没有产生版本时，`versionId`必须显式为`null`。索引不能用生成任务冒充编辑任务。
平台 API 必须仍可读取这些不可变版本；A 已销毁的临时数据库不能通过重建源码伪装成原在线任务。
需要 A/最后启用 PR 保留可采集会话，或交付同格式的真实编辑记录；本轮不越过组件选择限制创建替代版本。

会话通过本地环境变量提供，禁止写入索引、提交或命令行参数：
`CODELESS_EVAL_API_URL`（以`/api/v0/`结尾，HTTPS或本机HTTP）、`CODELESS_EVAL_SESSION_COOKIE`（所属用户）。
管理员调用账本可使用单独的`CODELESS_EVAL_AUDIT_SESSION_COOKIE`，未提供时使用同一会话。
跨来源和重定向被拒绝，响应有大小和时间上限；凭据不写入采集结果，不传给生成页面。

```powershell
node evals/edit/collect.mjs <A批次目录> <任务索引.json> <不存在的新输出目录>
node evals/browser/record-command.mjs batch <A批次目录> --edit-records <采集输出目录>
```

每项检查服务端COMPONENT来源、固定编辑prompt、任务/应用/版本/源码关联、前后完整文件摘要、原验证成功，
以及与A相同provider/model的逐任务调用账本；缺少或篡改证据不会记作REAL成功。未知/部分usage保留原字段，精确总量为null。
服务端映射还必须等于B受限构建从原不可变源码重建的映射，客户端自报路径不授权编辑。

平台仅允许当前版本被编辑，因此支持沿已验证编辑记录连续前进：后项可以使用此前编辑的真实版本，
但必须能逐步追溯到对应的A冻结需求；缺失祖先记录、跨需求/应用、重复任务、旧摘要及错误生成任务均拒绝。
重建后分别验证实际基版本与编辑版本、目标文本/CSS、所有共享实例、保留的作品标题或任务功能，
并比较完整文件清单，只有目标组件可以变化；统一内边距同时检查四边。目标组件标识丢失也不能通过。

缺记录时细分：`BASE_RECORD_MISSING`、`BASE_GENERATION_FAILED`、`BASE_REPLAY_FAILED`、
`COMPONENT_MAPPING_UNAVAILABLE`（另列MISSING_COMPONENT_ID等原因）、`EDIT_TASK_RECORD_REQUIRED`。
这些项仍是`NOT_EXECUTED / passed:null`；有真实失败编辑任务则为`EDIT_TASK_FAILED / passed:false`。
记录无效为UNKNOWN/INVALID_EVIDENCE，不能计入已验证的真实编辑成功数。
整批命令必须同时满足九项需求、六项编辑，未执行编辑不能使整体PASSED。

测试使用明确标记的MOCK平台响应，真实Docker/Vue/Chromium重建和前后判定；不证明真实模型编辑质量。
真实成绩仍需A新批次及实际编辑记录，历史2/9和六项NOT_EXECUTED不被改写。

另修复可复现的首次挂载误判：document load不代表SPA已挂载，使用既有4秒动作截止进行一次有界可见内容等待，
永久空白仍为WHITE_SCREEN；没有重试或扩大配置截止。原CI一次fixture5/6没有保留具体阶段/产物，
旧实现60次编辑阶段检查未复现该失败，不能证明它与此挂载竞态同因；原失败继续UNATTRIBUTED。

固定输入来自 D21-A PR63 的 `D21-generation-requirements-v1`，SHA256
`ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a`。
B 不修改 A 的 prompt、原始记录、报告或失败样本。更换需求集必须更新套件版本及断言，不能给旧断言换输入。

## 可执行动作

`evals/browser/cases.mjs` 的 `behavior` 是独立于模型 PLAN 的验收动作。
每项在新 Chromium context 中执行，LocalStorage 测试在同一 context 刷新；不借助新 context 假装持久化。

| ID | 判定 |
| --- | --- |
| SHOW-01 | Grace Hopper 姓名、完整简介、三个作品标题及非空说明、邮箱。 |
| SHOW-02 | 日期地点及三条时间/标题；点击报名才出现确认，确认位于按钮下方。 |
| SHOW-03 | 默认关于我；导航切换/隐藏旧区块；四张作品卡片的标题地点；邮箱；外部图片/网络拒绝。 |
| TASK-01 | 新建两项、计数增量、完成后计数减一；刷新后任务/完成状态保留；删除后再刷新仍不存在。 |
| TASK-02 | 三列、新建默认待开始、逐列推进；每次刷新后列位置保留；删除后刷新仍不存在。 |
| TASK-03 | 名称与数量、已购买、刷新恢复；清除已购买保留未购买项；删除后刷新验证。 |
| CAT-01 | 8 项；书名/作者实时搜索；三类筛选与恢复全部；详情完整；无结果集合为空。 |
| CAT-02 | 6 项；名称搜索、城区下拉；详情完整且在卡片下方；筛选恢复。 |
| CAT-03 | 9 项；类别与搜索同时生效，明确搜索不在该类的原始条目必须为空；无匹配文案、详情与恢复全部。 |

语义定位约定：作品/目录卡片为 `article`，卡片标题使用 heading，字段各自为非空 `p`；
任务行是 `li`/`article`，输入为 textbox/数量 spinbutton、完成/购买为 checkbox，列为含对应 heading 的 section；
目录搜索支持 textbox 或 searchbox。点击卡片内与名称精确匹配的最内层文本元素，兼容名称heading、heading内按钮/链接、整行按钮和整卡可点；不点击宽heading的空白中心。
字段可直接显示值，也可带作者/分类/类别/所在城区/城区/地区/评分/招牌饮品/推荐饮品/一句简介/简介/简短描述/描述/许可证/许可协议/开源许可证/开源许可前缀（中文或英文冒号）；
比对详情时去除这些显示标签，书籍搜索优先读取有“作者”标签的字段，否则排除冻结分类名后取首个字段。
分类组合查询的排除项从初始列表中选取不在实际筛选结果内的条目，不以整段文字等于分类名推断归属。
TASK-02 创建按钮接受运行前冻结的文案“添加 / 添加任务 / 新建 / 创建 / 新增 / 新建任务 / 创建任务 / 新增任务”，可带前导“+ / ＋”及其后空格；不接受临时生成的选择器。
详情为含“详情”heading 的 section/region。约定冻结在运行前。缺少可定位语义导致失败时保留 BEHAVIOR_ERROR，
由人工判断是产品行为缺陷还是定位兼容问题；不得运行后删除失败动作、生成 JS 或使用页面内容作为指令。
这九个小样本及定位约定不代表任意 UI 的通用智能判定。

## 六项编辑

`evals/edit/cases.mjs` 冻结六个 prompt：姓名文案、卡片正文颜色、24px 内边距、报名按钮文案、
三张共享卡片16px圆角、任务页标题。源码边界是选中的整个 SOURCE_FILE，所有共享实例同时修改；不承诺 AST/单实例精度。

B 先按标题、报名按钮及三个冻结作品标题所在卡片定位语义目标，读取最近组件根的候选 ID，
再用该版本源码重建出的可信 catalog 解析文件，并与服务端映射逐项核对。真实流程不使用固定 ID、文件名或初始样式；
`fixture`/`fixtureBefore` 仅供 MOCK 源码写入器使用。中文可访问名称允许 flex/block 子元素间的显示空白，完整标签与英文词边界仍严格匹配。

`requestFor` 对实际选择及可信映射核验后，只输出现有 component-edits 三字段 payload，不传 sourceFile。
共享目标必须归于同一个 SOURCE_FILE。目标已满足要求、定位不匹配、缺/禁用标识及缺任务记录分别报告，未执行保持 null。

```sh
node evals/edit/requests.mjs EDIT-01 /absolute/private/selection.json /absolute/private/rebuilt-mapping.json
```

前后版本均真实重建，观察实际基线并核验目标变化；卡片正文颜色遍历段落，内边距检查四边，共享圆角覆盖三个实例。
作品标题/说明、报名行为、任务增删/计数/持久化保留。完整源码路径集合与 SHA256 证明只有选中文件变化。
实际任务、不可变版本、完整账本及前后快照接入后才能认定真实编辑；MOCK 6/6 不计入 REAL。

**实时交接、预检、逐项执行及销毁前采集方式见 [真实编辑交接协议](evaluation-edit-handoff.md)。**
B 已实现只读 `handoff.mjs`，原始批次 ID 不足以证明运行时仍可编辑；A 需要确认保留入口与窗口。

## A 批次自动采集

```sh
corepack pnpm install --frozen-lockfile
node evals/browser/record-command.mjs unit
node evals/browser/record-command.mjs fixture
node evals/browser/record-command.mjs batch /absolute/path/to/A-batch
node evals/browser/record-command.mjs gate
```

前置：锁定 Node24.22.1/pnpm12.6.0、Java21（门禁）、Docker、已准备的受控构建镜像及 Playwright1.60.0 Chromium。
镜像与浏览器沿用 `tests/agent/prepare-runtime.mjs` / 现有门禁准备入口，不安装生成代码自选依赖。
runner 门禁通过 `tests/infra/d21-evaluation.test.mjs` 自动执行单元测试、独立静态页面浏览器对照和完整 fixture，
没有更改公共脚本、CI、锁、生产模块或原 e2e 的120秒截止。

对尚未合并的 A，先获取其只读副本（不合并进 B）：

```powershell
New-Item -ItemType Directory -Force .local-data/d21-a-reference | Out-Null
git fetch origin codex/d21-a-real-eval
git archive --format=tar --output=.local-data/d21-a-reference.tar 6e707c0ffdd189e4c268d5bf405fb543c8e7ce54 evals/generation scripts/eval tests/eval/generation
tar -xf .local-data/d21-a-reference.tar -C .local-data/d21-a-reference
```

将 tar 解压到已创建的 `.local-data/d21-a-reference/`，批次目录是
`evals/generation/runs/2026-10-23T14-16-43Z-real-545bbebf`。
上述为首轮证据版本；A 的修复轮使用新的私有目录只读提取 `342b8b07b6a592c46898056f460fd13e6e6c6f2a`，不覆盖旧副本。

采集器从 `batch.json`/冻结副本和九份原始 `record.json` 自动取得任务、版本、来源、原浏览器验证，
校验固定分母、唯一任务、原始prompt、provider、原生 invocation 结果、版本/task/build/source 关联与所有源码摘要。
不会把最新指针、截图或 A 的汇总成功字段当作行为证据。
FAILED 样本仍在分母里；缺记录/未知 exitCode 不变成成功。

READY 样本交给生产 `createBuildRunner` 真实重建（无网络/只读/non-root/限制资源/不挂密钥和 Docker socket），
Chromium 只访问本轮 manifest-backed 回环服务器，所有外部 HTTP 和 WebSocket 请求被拦截。
浏览器进程只继承运行所需系统环境。每项截图、trace、错误、版本、源码摘要、原验证ID和新 artifactDigest 都写入报告。
这是**原始源码的行为重放**，不声称打开了 A 已销毁的数据库/预览会话，也不声称新构建产物等于原部署。

## 成败、分账与证据

最终需求成功 = 原任务 READY ∧ 原浏览器通过且关联一致 ∧ 新真实构建 exit0 ∧ 独立浏览器行为通过。
白屏=WHITE_SCREEN，业务不满足=BEHAVIOR_ERROR，异常=RUNTIME_ERROR，误改文件=EDIT_SCOPE；
这些都不是 MODEL_NETWORK/模型接口错误。原平台 failureCode 单独保留，未知不补0。

REAL/MOCK/UNKNOWN 分开固定分母统计。mock 在实际 Docker/Vue/Chromium 执行也只证明测试链路，
不证明模型质量。未执行编辑为 null；真实目标≥8/9和≥5/6只在有相应执行证据时判定。
任何行为失败使命令原生退出1。A 批次整体失败与采集器成功读完可以同时成立。

完整输出在 `.local-data/d21-b/runs/<time-UUID>/`，命令/源码哈希/原生退出码在 `commands/`。
每次新目录、零重试；不覆盖失败。记录器保存并恢复门禁重写的既有历史证据，原始输出另存本轮目录。
公开精简证据由 `export-evidence.mjs` 导出到 `evals/browser/evidence/`，原始 trace 和宿主路径留在私有输出。
首次实现的 fixture 格式错误、沙箱 EPERM 等开发失败也保留，不把修正后的通过倒填旧轮。

真实付费请求新增0，模型 token新增0（B仅重放源码）。A 已付费用量引用A账本，缺失usage保持未知，
个人开发agent用量 UNKNOWN 单列。真实编辑尚未执行及网络/映射阻塞见 `docs/handoffs/D21-B.md`。
