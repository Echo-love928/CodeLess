# D12-B 组件标识与版本化源码映射

这是受控 Vue 构建的内部协议。公共 HTTP/OpenAPI、API 存储和平台 UI 未扩展。
协议、生成器及真实构建/浏览器验收由本卡交付；D12-A 并发修改任务与最终功能启用由对应维护者接线。

## 稳定标识

每个 `src/pages/*.vue` 或 `src/components/*.vue` 的单一原生根元素写一个静态
`data-ai-component="shared-card"`。ID 是小写 kebab-case，1..64 字符，应用范围唯一，
同一个源码组件跨版本应保留同一 ID。禁止随机 DOM 实例 ID、动态绑定、调用处覆盖标识、
在组件内部原生子元素伪造标识。真实子 Vue 组件在自己的文件中声明自己的根标识。

只有单一原生根支持选择。fragment、component/slot/template 根、根条件分支、根属性 spread/
动态绑定及原生子树中的标识会禁用该文件。根 `v-for` 及调用处 `v-for` 都是共享源码范围。
缺失/非法标识不会阻止其他合法组件构建，但该文件进入 `disabled`；源代码本身不能编译时，
保留真实 BUILD_FAILED，不生成可用映射。SFC 注释或 script 文本不作为标识解析。

## 构建与信任边界

固定 `templates/vue/vite.config.ts` 使用锁定的 `vue/compiler-sfc` 识别根节点，生产构建产出
`ai-component-catalog.json`，文件列含 `sourceFile/fileDigest/componentId/disabledReason`。
它属于原生产 artifact manifest，不包含绝对路径、源码或凭据。只读固定配置不在生成源码白名单内。
catalog 包含默认模板页；版本映射只保留存在于 D11 不可变源码清单的文件。
没有冻结在此版本中的默认模板页不具有可编辑映射。

可信宿主调用 `buildVersionMapping({sourceDirectory, versionId, sourceDigest, runBuild})`：

1. `sourceDirectory` 必须由平台解析到 D11 不可变快照，不能由页面、模型或用户传物理路径。
2. `runBuild` 是维护者预配置的 D07 `createBuildRunner`（固定 imageId、隔离与资源边界）。
3. 真实构建成功且清理确认后，逐字节复核完整 artifact digest、catalog 文件 digest、
   版本源码聚合 digest 和每个 Vue 文件 digest；构建前后源码变化时拒绝。
4. 返回 `{status:'MAPPED', build, manifest}`，不覆盖/追加 D07 已冻结的 artifact。
   `BUILD_FAILED` 原样保留 build 的 nullable exitCode，manifest=null。
5. API 维护者将返回的 manifest 作为该 `versionId` 的不可变 sidecar 存储并校验哈希，
   发布/READY 仍由原构建和真实浏览器证据决定；MAPPED 不意味着 READY。

`manifest.schema.json` 是形状契约，运行时另外检查总量40、路径/ID唯一性、大小写别名、
可选和禁用集合互斥等。Schema 或 `validateManifest(candidate)` 单独不证明来源。
只有可信构建返回/冻结卷读回并验证的 manifest 可传给 `resolveSelection`。
如收到客户端 manifest，必须 `validateManifest(candidate, trustedManifest)` 完整比较，
不能把结构合法的自报路径当作真值。首版推荐客户端只提交选择请求。

## 选择与 D12-A 对接

请求精确为 `{versionId, sourceDigest, componentId}`，不接受 `sourceFile`、DOM selector、
实例索引或额外字段。D12-A 服务端先检查身份/应用所有权和基版本锁，再按该基版本的可信映射
调用 `resolveSelection(manifest, request)`。成功结果含同一 `componentId/sourceFile/versionId`、
`sourceDigest/fileDigest`、`scope:'SOURCE_FILE'`、`shared:true` 和共享修改提示。
错误返回 `selectable:false` 和明确 `reason`，不得转换为成功或猜测源码。

浏览器可从点击位置取最近的 `[data-ai-component]` 作为候选 ID，嵌套组件优先最内层；
候选始终是不可信数据，缺失/非法/unknown 标识均不允许编辑。受控 UI 应展示 `disabled`
列表的文件与原因，并显式显示“修改此源码组件会影响全部实例”。DOM 可能自行篡改标识，
因此这不是 DOM 来源认证；任何合法选择只授权整份受限源码组件的修改建议。

同一文件的多个渲染实例共用一条映射，包括嵌套和多个调用点；父组件和子组件分别映射各自文件。
修改创建新草稿，重新构建/验证后产生新映射；即使源码 digest 不变，旧 versionId 也被拒绝。
首版修改整份组件源文件，不承诺 AST 精确编辑、单个元素或单个实例修改。

禁用原因：`MISSING_COMPONENT_ID` 缺失、`INVALID_COMPONENT_ID` 格式非法、
`DUPLICATE_COMPONENT_ID` 多文件冲突、`UNSUPPORTED_ROOT` 根结构不支持、
`UNSUPPORTED_TEMPLATE` 模板不支持、`UNSAFE_MARKER` 动态/嵌套/覆盖风险。
选择另有 `VERSION_MISMATCH`、`SOURCE_DIGEST_MISMATCH`、`UNKNOWN_COMPONENT_ID`、`INVALID_SELECTION`。

## 重现

```powershell
docker build --file infra/build-image/Dockerfile --tag codeless-vue-build:d05 .
node tests/runner/mapping/record-command.mjs acceptance
node --test tests/runner/mapping/contracts.test.mjs
pnpm verify:runner
node tests/runner/mapping/record-command.mjs gate
```

真实 Vue fixture：`templates/vue/fixtures/mapping`，一个父页面与三次渲染的共享子组件。
验收采用实际 Docker 编译、实际 Chromium；模型请求为零，失败 worker 仅在命名负向用例使用 fixture。
`tests/infra/mapping.test.mjs` 是本卡测试入口，自动纳入已有 runner 门禁，未改根脚本/锁/CI。
记录器保留 native exit/signal/log digest；缺结束状态必须解释为 UNKNOWN。
