# D12 最终启用集成（B 接手）

2026-10-12，用户明确要求 B 修复审查阻塞并解决 sidecar/API/UI、公共契约和 Windows 定位。
独立分支 `codex/d12-component-integration`，基线 main=f67a7d1135448c102cf150816c0a1afb4ce26535。
集成 B 修复 a348f42 和 A 候选 e727e929e1a2d5f8023207cc6bc83725261285a4，未改原 A/B 分支或 main。
本 PR 为最终启用 PR，公共 OpenAPI 在该分支由 B 串行维护；无锁、依赖、迁移、CI变动。

## 六步执行范围

1. 实查同伴审查，补真实 R1 回归并独立修复 PR36。
2. 从精确 A+B 候选建立最终启用分支，检查既有版本/任务/预览边界。
3. 冻结 sidecar，与源码和产物匹配；接入所有权、基版本锁、组件选择和任务范围。
4. 接入真实跨源预览点击、共享提示、冲突保留和公共 OpenAPI。
5. 运行真实 SQL/Docker/浏览器联调和四阶段门禁；捕获 Windows 原生清理失败现场。
6. 记录精确候选/真实证据，创建草稿 PR 供同伴重新审查；不自批、不合并、不推 main。

## 行为与边界

- 映射在 LocalVolumeSnapshotStore.freezeOutcome 内与验证结果同一待冻结目录写入；摘要加入
  report，并由既有 reportDigest 保护。不向已冻结的 artifact 追加文件，不改变原 artifactDigest。
  Java 宿主按 runner 相同规则从可信 catalog 和实际源码清单绑定；读取时检查源码、结果、完整
  artifact、sidecar 哈希及重建映射一致性。重启可读取，旧版本缺 sidecar 返回 MAPPING_UNAVAILABLE；
  不从当前模板/工作目录回填。
- GET versions/{id}/component-mapping 和 POST component-selection 均检查所有权、VERIFIED
  和冻结摘要。POST applications/{id}/component-edits 在 A 的同一应用锁内再次解析路径，复用
  幂等、并发、过期基版本、取消和 READY 原子提交约束。客户端不提交 sourceFile。
- COMPONENT 元数据中的 sourceFile 是服务端解析结果；首次事件持久化仍为 A 的机制，事件
  长度受限，非模型/提示授权。GENERATE/REPAIR 只能 files.update 选中文件；create/delete/另一
  文件更新在调用文件工具前失败。PLAN仍列完整结果文件集合，不承诺 AST 或某个 DOM 实例。
- 预览 gateway 在服务端注入版本/源码摘要绑定的点击桥；只接受平台 origin+parent 的模式设置。
  平台只接受当前 credential origin+iframe source 的点击候选，并由 API 再解析。版本切换/异步
  迟到结果不能恢复旧选择。UI 明示全部实例共享；冲突保留描述、不自动重基或重试。
- CHAT原接口仍只接受CHAT。公共 GET task/edit 支持CHAT与COMPONENT结果的oneOf，组件
  修改有独立闭合接口。公共OpenAPI只追加5个路由；保留旧内容格式和鉴权/CSRF/error边界。
  `contracts/mapping/integrate-openapi.mjs` 幂等且拒绝覆盖不同的已存在 D12 路由。
- deterministic-mock样例补稳定根标识，真实模型缺/非法标识仍按禁用协议处理，不宣称模型质量。
  无自动发布、环境/命令/依赖参数或新秘密权限。

## 已实测与失败历史

- R1独立真实回归先失败6/7、修复后7/7；契约3/3。a348f42的PR36六项Checks实查success，
  run38240377250。同伴原REQUEST_CHANGES未被作者改成批准。
- A+B API 独立真实联调 native exit0、10/10，0skip，记录：
  `.local-data/d12-a/runs/2026-10-12T11-17-41.954Z-acceptance-82953558-6965-4699-b5a3-d39515853d0c`。
  包含sidecar重启、所有权/CSRF、错摘要/旧版本、客户端伪造路径、新草稿/旧源码保留、篡改503
  且任务数不增加。之后补模型越界scope和Windows诊断用例，须在完整门禁实际执行。
- UI首轮预览 exit1：组件POST实际500，UI提示服务不可用。代码检查发现 requestJson 不会
  自动加入JSON Content-Type，组件client漏加；补齐后同一真实平台链 exit0、1/1（111.2s），
  所有原预览断言保留。记录：`.local-data/d12-b/runs/2026-10-12T11-28-59.939Z-preview-53f13fee-7757-4f8f-a4f0-34257e945252`
  与 `2026-10-12T11-32-27.172Z-preview-ee31c8cf-f635-48e9-a929-77b2c37c8968`。
  前者不能称HTTP415实测；实际状态500，缺Content-Type为修复前后实验确认的原因。
- UI69/69、vue-tsc/生产构建通过，记录 integration-web-fixed.log/.exit；首次误选本机全局
  Node24.19/pnpm11.25导致engine失败，后按既有固定PATH使用Node24.16/pnpm12.6，未升级。
  中间单测ApiError类型写错导致TS失败已修正；所有失败日志保留。
- 公共OpenAPI已实测lint及原static通过；追加集成契约2/2通过。最终完整门禁与精确候选
  Checks需在下节据实补齐，不能沿用上述较早工作树结果。

## Windows定位

历史 A DirectoryNotEmptyException 及 B 首次预览凭据校验失败不能用本轮成功抹去。
清理器已保证目录枚举句柄关闭、所有权/链接保护、没有重试。本轮新增在原异常上附加即时
EMPTY_AT_FAILURE/ENTRIES_AT_FAILURE/ALREADY_ABSENT 等状态、相对路径和剩余数量。
确定性竞争写入回归证明 DirectoryNotEmpty 原异常及剩余1项保留，而非吞异常或重试删除。
历史故障确切根因仍 UNKNOWN；本轮原生Windows完整门禁若再现，应使用该现场定位，不能
将测试构造的竞争写入当历史根因。原凭据校验故障亦未在最新真实预览中再现，仍未归因。

开发agent输入/输出/合计 UNKNOWN，无任务级实测接口。独立映射模型请求0。
平台联调为deterministic-mock，token UNKNOWN、付费外呼0；SQL实测账单另列，不代表模型质量。

## 最终门禁 / PR / 同伴审查

待运行最终完整门禁；待创建最终启用草稿PR并读取精确HEAD Checks。
同伴批准必须由独立审查者针对最终候选给出，作者不能替代；仍禁止合并/推main。
