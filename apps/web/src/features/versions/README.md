# D11-B 版本面板与只读源码

2026-10-12：已同步 D11-A PR33 的已独立批准候选 `acdc183cf4a250df024f7109d53e5628efc79e54`。
A 的原始提交通过merge保留在 B 独立分支；main 未改。历史建议 `/source` 已撤去。
A复审工作树对B8640035的真实面板验收1/1通过；本机旧Docker EIO失败仍保留，根因UNKNOWN。
依赖同步后的本机复测与精确HEAD检查以本卡交接最新节为准，不用旧候选结果替代。

## 读取契约

沿用 `contracts/versions/README.md` 和 `response.schema.json`：

- GET `/api/v0/applications/{applicationId}/versions?page=0&size=20`：原 v0 item、倒序分页。
- GET `/api/v0/versions/{versionId}/files`：不可变清单 `{versionId,sourceDigest,files:[{path,bytes,digest}]}`。
- GET `/api/v0/versions/{versionId}/files/content?path=...`：同版本单文件 `{versionId,sourceDigest,path,bytes,digest,content}`。
- GET `/api/v0/versions/{versionId}/snapshot`：失败版本的冻结 report；错误码、构建状态/退出码、浏览器验证状态作为摘要。未知结果保持未知，读取失败明确提示。

源码按 A 限制最多40文件、128KiB/文件、512KiB总量，只接受受控 src/pages、components、data 路径。
清单 SHA256 使用按 path 排序、精确键序 `{path,bytes,digest}` 的 UTF-8 JSON；
每份源码再核对实际 UTF-8 bytes 和 SHA256。任何 versionId/sourceDigest/path/bytes/fileDigest
错配都不显示整份快照；不截断冒充原文。限定顺序读取，最多512KiB，不引入IDE或执行源码。
Web Crypto 需要安全上下文（生产HTTPS、本地localhost），既有部署符合该要求。
401回登录；404表示文件缺失/不属当前用户；409表示暂无快照；空清单与未冻结壳版本区别处理。

A列表没有来源taskId。当前工作台 diagnostics 的真实 build.versionId 与条目匹配时，
可展示该 diagnostics 所属任务链接；其他历史版本显示“未提供来源任务”，不从当前task猜测。
全量历史来源映射需要 A/契约维护者补正式字段；没有扩充公共 schema 或偷偷新增后端路径。

## UI与安全边界

VersionWorkspace复用未修改的D09 PreviewPanel；只有VERIFIED+buildId切换预览。
默认取latestReadyVersionId；查看DRAFT/FAILED源码或列表错误、分页均保留可用iframe。
选中源码与预览分别标版本ID；切换已验证版本时两者一致。加载清空旧源码，
AbortController+序号阻止旧应用/版本/刷新结果覆盖当前选择。
Vue文本插值到pre/code，无v-html/eval/IDE。冻结错误摘要也按文本显示。

必要跨范围接线：WorkbenchPage额外传当前任务及其真实build版本IDs；
旧任务状态机和凭据安全不变。公共OpenAPI增量仍由维护者同步。
测试跨范围：既有platform.acceptance.mjs仅加显式opt-in D11 hook，位于全部原断言后，
没有删除/弱化原检查；新增相关Java IT复用原自有进程、DB、TLS与清理harness。

## 验收

    pnpm verify:static
    pnpm --filter @codeless/web exec playwright test --config playwright.config.ts versions/flow.spec.ts
    services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=D11VersionPanelAcceptanceIT' test
    pnpm ci:gate

专项8条 fixture使用A路径/清单/单文件/失败快照格式和真实哈希。生产UI/Chromium真实，
API/auth/预览内容是明确fixture，不能证明持久化或模型效果。
真实IT使用 `d11-version-panel-fixture`，模型提案是明确mock；session/PG/文件工具/
冻结/真实Docker/Chromium/TLS/nginx/签名iframe不是fixture。验证两已通过版本切换、
草稿缺快照409、失败保留最新预览和脚本文本。它不在默认Surefire发现中，必须显式运行；
此前本机在原平台生成前置处EIO失败，新增D11断言尚未到达；A复审机器的1/1通过另有实测报告，
不能把另一机器成功解释为原EIO根因修复。

证据：`tests/e2e/versions/evidence/2026-10-12/`；原失败历史保留于2026-10-11目录。
状态与下一步见 `docs/handoffs/D11-B.md` 最新节；草稿PR34保持未合并。
