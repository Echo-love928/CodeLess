# D11-B 只读互审状态

2026-10-11（Asia/Tokyo）。核对本地/远端分支，以及 GitHub 最近25个PR（最新#32）；未找到 D11-B 分支、PR、契约差异或测试报告。已请求候选链接。**尚未进行作者代码审查、联调或正式批准。** 后续必须以B精确HEAD进行审查，不能将A已有预览回归当作B版本面板验收。

## 阻塞问题

- 缺少B候选及测试报告：无法核验版本切换后的页面/源码、空列表/读取失败、草稿状态显示和脚本文本显示。位置/复现当前为未知，不能虚构代码问题。真实D11-B联调和0.5点互审/交接验收仍待完成。
- 新增HTTP路径的公共OpenAPI同步由登记维护者/最后启用功能PR承担；A提供 `openapi.patch.json`，未抢改 `contracts/openapi.v0.json`。这限制接口的正式集成声明，不影响已实测的A独立API。

## 建议

- 按 `README.md` 的 `versionId` 读取源码并签发该版本预览；切换版本后丢弃旧请求的迟到响应。不要从 taskId 或可变草稿目录取当前源码。
- DRAFT/FAILED/VERIFIED 使用明确状态；只以 `latestReadyVersionId` 或用户选中的 VERIFIED 版本请求预览，禁止把草稿当已验证版本。
- 409 `SNAPSHOT_UNAVAILABLE` 区别于成功空数组；错误显示可重试信息，不将读取失败渲染成“无文件”。
- `content` 使用文本插值/代码文本节点；不得 `v-html`、eval、动态模块导入或插入可执行 script。复现fixture：`<script>alert(1)</script>` 应显示原文本，不能弹窗。

## 已核验内容

- A实际HTTP验收提供版本列表、三状态过滤、空列表、源码JSON文本、读取失败、权限隔离和禁止PUT的报告，见 `tests/versions/evidence/2026-10-11/`。这不是B UI测试。
- A保留既有预览 `versionId/buildId/sourceDigest/artifactDigest` 绑定与私有可信根检查，源码API从单独冻结的版本卷读。真实平台预览与源码一致性回归由A自己的API测试负责。
- 没有发现可供审查的B改动，因此尚不能声明B无越范围修改、秘密泄露、测试弱化或失败路径遗漏，也不提交APPROVED。
