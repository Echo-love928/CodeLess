# D21-B 需求行为与组件编辑评测

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

`requestFor` 只接受匹配组件/文件/版本/摘要的 selectable、shared、SOURCE_FILE 选择响应，输出现有
`POST /api/v0/applications/{applicationId}/component-edits` 三字段 payload。
路径不进入 selection，也没有发布或执行命令字段。实际提交仍需 owner 会话、CSRF、独立幂等键及用户确认共享影响。

```sh
node evals/edit/requests.mjs EDIT-01 /absolute/private/selection.json
```

fixture 每项从同一不可变基线独立复制：先核验基线 DOM/CSS，修改指定文件后真实构建再核验目标 DOM/CSS，
用前后所有文件 SHA256 及完整路径集合检查只有目标发生变化。新增/删除/误改无关文件、无变化、缺失清单均失败。
颜色/间距/圆角遍历全部共享实例；文案保留作品，按钮保留报名行为，任务标题编辑后重跑增删/计数/持久化。
基线 CSS 是明确 fixture 的12px/4px/黑色值，不能直接当作其他真实版本的基线。

真实编辑需服务器认可的映射、实际编辑任务/版本和前后快照。A 的批次目前只有生成记录；
B 会读取重建后的可信 catalog，记录每项编辑的可选中性。
未发起的真实编辑保留 `passed:null / NOT_EXECUTED`，不把fixture的6/6转写为真实模型成绩。

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
