# D08-A 内部文件工具契约

`registry.json` 是工具注册表和参数 JSON Schema。API 打包时将它放入 `tools/registry.json`，Java registry 消费同一文件。无新 HTTP 入口、shell、任意命令、依赖安装或模型可配置工作区。

| 工具 | 封闭参数 | 实际行为 |
| --- | --- | --- |
| `files.list` | `{}` | 返回受控源码的路径、UTF-8 字节数、SHA-256 和整个源码 manifest 摘要。 |
| `files.read` | `path` | 返回实际 UTF-8 文本和哈希；不存在/非法 UTF-8 失败。 |
| `files.create` | `path, content` | 仅新建，已存在失败，允许空文本。 |
| `files.update` | `path, content, expectedDigest` | 只有磁盘旧哈希一致才能原子替换；过期哈希失败，无变化可成功但不生成修改快照。 |
| `files.delete` | `path, expectedDigest` | 只有磁盘旧哈希一致才能删除；不存在/过期哈希失败。 |

内部调用 `FileToolService.execute(taskId, originalClaimToken, toolName, argumentsJson)`。taskId/token 来自可信已鉴权队列 coordinator，不能从模型参数/日志获取；尤其不能按 taskId 重读新的 lease token。服务在独立事务中锁任务行，再以 `clock_timestamp()` 检查 GENERATE/REPAIR、RUNNING、原 token、lease 和 deadline；实际写入及事件再检查时间。外层已有事务时拒绝，避免调用方回滚一个已返回的成功。取消/失效/未知任务不读取或创建源目录。

只允许 `src/pages/[A-Za-z][A-Za-z0-9_-]*.vue`、`src/components/同类名称.vue`、`src/data/同类名称.ts`，最大路径 240 字符。要求已规范化正斜杠路径，不自动修正不安全输入；拒绝 `..`、绝对/盘符/UNC、反斜杠、重复分隔符、编码路径、ADS、Windows 设备名、大小写别名、目录或文件链接、配置/入口/路由/脚本。所有现存源码都重新扫描，不只校验请求目标；未知文件类型/目录失败。POSIX 额外拒绝多硬链接。Windows 不提供标准 Java nlink 属性，依赖平台私有卷和唯一写入者的 OS 权限边界；不得将可变 workspace 或 audit 挂给生成代码进程。

限制：40 文件、128 KiB/文件、**512 KiB 总源码 UTF-8 字节**。D05 `validateSource` 的 512 KiB 比 D07 中间 snapshot 的 1 MiB 更严格，采用可被两者构建的较小值，不扩大前置权限。每任务至多20次文件工具请求，非法参数/工具失败也计入持久 audit reservation；重建 service 不重置。其他模型/构建/浏览器工具仍由最后启用 coordinator 汇总20次全局预算，本卡没有启用运行时 repair loop。

`Result.status` 仅为真实 `SUCCEEDED/FAILED`，错误返回固定 errorCode，不带 OS cause/宿主绝对路径。read content 只在真实读取后返回。源文件哈希为 `sha256:<hex>`，整个 sourceDigest 与 D08-B 一致：按 ASCII path 排序的紧凑 JSON `[{"path":...,"bytes":...,"digest":...},...]` 的 UTF-8 SHA-256。失败后无法确认的 source/afterDigest 保持 null。

审计记录三个不可覆盖文件：`<callId>.request.json`、`.observed.json`、`.committed.json`。包括 task/stage/callId、输入 JSON 摘要、合法 path、content 字节数/哈希、单调钟耗时、实际 outcome/error、源 manifest 和前后文件哈希；不存原始输入/源码、lease、凭据或宿主路径。审计先写且 force 文件；请求审计失败阻止操作。只有实际操作成功才生成成功工具事件和文件变化 metadata；失败事件明确 FAILED。任务状态保持原阶段，工具不会宣告 READY/发布。

文件系统与 PostgreSQL 不构成跨资源原子事务：文件操作后事件事务失败会保留 REQUESTED/OBSERVED（可能含真实已修改字节），无 COMMITTED 成功回执，调用失败，DB 状态/事件/diagnostics 回滚。最终回执写失败亦为异常，不返回成功，已提交的文件观察事件仍真实。恢复者须对照实际文件哈希，不能自动重放 mutation 或把未知提交当成功。新迁移、全局恢复/留存与 browser evidence 关联留给登记维护者，未抢占迁移编号。

部署配置 `CODELESS_FILE_WORKSPACE_ROOT`（默认 `.local-data/file-workspaces`）和 `CODELESS_FILE_AUDIT_ROOT`（默认 `.local-data/file-tool-audit`）是平台可信私有持久卷，必须仅平台账号可写；扫描祖先拒绝 symlink/junction。同一数据库与 audit 卷供所有 API 实例使用，否则不得宣称跨实例预算协调。源目录固定为 `<workspaceRoot>/<task UUID>/source`，相同路径不会跨任务读取。

可信 coordinator 可调用 `snapshot(taskId, originalClaimToken)`，复制当前确切哈希字节到唯一内部目录，仅返回给 D07/D08-B；它不是第六个模型工具。后续 file tools 不修改该副本，runner 仍用只读私有快照。本卡没有替换 `TaskStageRunner`、开放模型 tools binding 或改变版本 VERIFIED/READY 条件。

复现（Java21、锁定 Node/pnpm、Docker 启动，PostgreSQL 为真实 Testcontainers）：

```powershell
$env:CODELESS_FILE_EVIDENCE_DIR = Join-Path (Get-Location) '.local-data/d08-a/evidence'
node --test tests/tools/registry.test.mjs
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=FileToolRegistryTest,FileToolsIntegrationTest' test
node --test tests/tools/fixed-project.test.mjs
pnpm ci:gate
```

第三条是明确的固定 fixture 验收 harness：真实 tools→Docker→浏览器三路由/LocalStorage/搜索及截图。真实工具测试由现有 API 门禁发现；Schema 和固定项目命令独立执行，没有修改公共门禁入口。跨 PR 的 `peer-workflow.test.mjs` 还要求 `CODELESS_D08_B_REVIEW_ROOT` 指向精确只读 B 候选；必须报告非零失败，不能用本卡 harness 代替 B 服务结果。B 互审见 `review-D08-B.md`。
