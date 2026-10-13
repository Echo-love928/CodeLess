# D12-B 只读互审

对象：[PR #36](https://github.com/Echo-love928/CodeLess/pull/36)。首次候选71c7a1f，收尾复查56e069c5cb563243cce5abc721195226f598580e。隔离detached工作树 `.local-data/d12-a/review-b-71c7a1f`，B跟踪文件无修改。71→56只改CI准备/相关单测/交接，映射运行时与Vite标识检测blob不变。

## 阻塞问题

**R1：调用处属性spread可绕过标识覆盖禁用，真实点击解析到错误文件。** `templates/vue/vite.config.ts:41–44` 的nestedMarker只检查静态标识或明确的bind参数，漏掉子组件上的无参数v-bind和动态参数。把fixture的第三次调用替换为：

```vue
<SharedCard label="丙" v-bind="{ 'data-ai-component': 'home-page' }" />
```

实际固定Docker/vue-tsc/Vite exit0、Chromium三个h2最近标识为shared-card、shared-card、home-page；manifest仍把HomePage.vue列为可选择，第三个SharedCard点击调用 `services/runner/src/mapping/manifest.mjs:87` 返回selectable=true/sourceFile=src/pages/HomePage.vue。合同承诺调用处覆盖标识应禁用；这里应拒绝不安全选择，而不是把SharedCard根解析为父页面文件。这是正确性/禁用边界缺陷，不是跨用户权限逃逸，DOM仍是不可信候选。

证据：`tests/edit/lifecycle/evidence/2026-10-12/B-nested-spread.json`，status=BUG_CONFIRMED（诊断脚本exit0不表示功能通过）。可复现命令：checkout上述detached候选，先在该工作树用固定 `docker build --file infra/build-image/Dockerfile --tag codeless-vue-build:d05 .`，回A根执行 `node tests/edit/lifecycle/review-B-nested-spread.mjs`；测试仅修改私有fixture副本，不改B源码。修复应让无参数/dynamic v-bind等可覆盖标识的组件调用进入UNSAFE_MARKER，补真实构建/浏览器回归；随后只重查检测器、变更测试及受影响范围。

**历史CI阻塞已关闭，不沿用旧failure。** 71c7a1f的runner失败位于 `tests/runner/mapping/acceptance.test.mjs:63`，锁定Chromium executable不存在；E2E在Install Chromium步骤3分钟超时，浏览器用例尚未启动。56e069c新增固定准备脚本，交接明确记录用户授权CI修复；已只读核查最小CI差异、官方Ubuntu源替换保留签名/安全源、固定Playwright实际launch/close、失败/unknown传播、无重试/跳过。受影响准备单测2/2、exit0，56精确HEAD六项远端checks全success。旧失败保留，不再当56的失败理由。R1仍未修复，因此不批准。

## 建议

- A已将自己范围内的结构与B对齐：客户端仅componentId/versionId/sourceDigest；sourceFile由可信冻结映射解析；结果身份投影componentId/sourceFile/versionId，ID为小写kebab-case1..64，修改SOURCE_FILE/shared:true。不能接受客户端路径或自报manifest。CHAT仍严格拒绝COMPONENT。
- 最后启用PR负责sidecar不可变持久化、身份/所有权/base锁、映射与实际D11文件/摘要匹配、跨源选择桥及真实平台对话修改联调。当前两卡独立专项不是该真实A/B启用验收。
- CI属于公共维护范围；56交接已记录用户明确修复授权及最小改动原因，后续由维护者保留该登记与复核；A没有改共享CI或B文件。

## 已核验内容

| 卡片要求 | 实查 / 复现 |
| --- | --- |
| 样例定位存在受限源码 | B acceptance T1真实构建exit0，readSnapshot实际文件SHA等于fileDigest；选shared-card定位src/components/SharedCard.vue。 |
| 重复实例共享范围 | T2实际Chromium三实例（含嵌套），共同sourceFile、SOURCE_FILE/shared:true；不是DOM实例编辑。上述新增R1覆盖测试另发现调用处spread漏洞。 |
| 旧版本映射拒绝新版本 | T3即使同sourceDigest，改versionId仍VERSION_MISMATCH；错误sourceDigest拒绝，伪造新manifest与trusted比较拒绝。 |
| 伪造路径/非法映射 | T4遍历绝对/../设备/别名/不存在/实际其他文件重映射、非法scope/ID/digest和多余字段；runtime与trusted深比较均拒绝。 |

B原专项6/6、契约2/2、native exit0，无skip。复审首轮因复用A旧镜像无catalog而exit1/BUILD_CATALOG_UNAVAILABLE；按B既有README前置重建固定镜像exit0后专项通过，首轮环境错误完整保留，没有重试掩盖。检查全部B文件diff、类型声明、固定catalog产出与artifact/source哈希复核、manifest/disabled集合、测试失败路径及报告；无新依赖/锁升级、秘密、开放命令、自动发布或失败改READY。解析器仅识别根，不做AST编辑。A私有复现与复查记录见 `B-review-commands.json`。

镜像tag复原时原imageId已不存在，按IDtag失败；随后从A根原固定Dockerfile/模板重建exit0，恢复A模板内容，imageId变化已记账。没有改任一分支模板或锁、没有删除B工作树/他人数据。修复后正式批准仍须另一人按最终HEAD、当前主分支和全必需checks复核。
# 2026-10-13 精确候选复审（覆盖旧结论）

PR36=a348f429e5b899f9229138c4d9f791867775363d；最终启用 PR37=72be44ca2805f05375430f54b30a7285f7c965de。
只读 B checkout，main 未改。已提交 [PR36 REQUEST_CHANGES](https://github.com/Echo-love928/CodeLess/pull/36#pullrequestreview-5498246948)
及 [PR37 REQUEST_CHANGES](https://github.com/Echo-love928/CodeLess/pull/37#pullrequestreview-5498247222)，未批准。

## 阻塞问题

- **[P2] 标识属性大小写别名仍能选错源码**：`templates/vue/vite.config.ts:37–43` 的比较区分大小写，
  而 Vue fallthrough 到 HTML 后属性名不区分大小写。受控 fixture 第三个调用改为
  `<SharedCard label="丙" DATA-AI-COMPONENT="home-page" />`，真实 Docker build exit0，Chromium
  标识 shared-card/shared-card/home-page；第三个 SharedCard 被解析为 selectable=true、
  sourceFile=src/pages/HomePage.vue。原生回归命令 `node tests/edit/lifecycle/review-B-marker-case.mjs`
  **exit1**，断言拒绝此错误结果。脚本使用精确 PR37 生产类和独立可信 imageId，fixture 全在私有目录。
  PR36/37 的 detector/runner manifest 字节相同，`git diff a348f429..72be44c -- templates/vue/vite.config.ts services/runner/src/mapping/manifest.mjs` 无差异。
  [完整证据](../../tests/edit/lifecycle/evidence/2026-10-13/B-marker-case.json)。影响：用户操作共享组件可能修改父页。
  复现前从仓库根执行（checkout已存在时只核对HEAD/干净源码，不重复创建）：
  `git worktree add --detach .local-data/d12-a/review-b-72be44c 72be44ca2805f05375430f54b30a7285f7c965de`，
  `docker build --file .local-data/d12-a/review-b-72be44c/infra/build-image/Dockerfile --tag codeless-d12-review:72be44c .local-data/d12-a/review-b-72be44c`。
  加载既有固定env后运行上述node回归；脚本使用独立tag的不可变imageId，不改变日常d05 tag。
- **PR37 必须整合 A 删除修复**：其 `AgentLoop.java:136,165–170` 仍是旧的最终计划/工具集合混用逻辑。
  PR35 本轮修复允许可信基版本 read/update/delete，create 仅限最终计划，最终快照仍严格相等。
  最终启用维护者整合时须保留 COMPONENT 的仅选中文件 update 边界，运行组件 scope 及删除生命周期。
  本次没有代写 B 分支，也不以 A 分支修复声称 PR37 已解决删除问题。

## 建议

按 HTML 属性语义处理静态属性/静态 bind 参数的大小写别名，覆盖原生根重复别名及组件调用处覆盖。
保留 unsafe namespace fail-closed。Windows 现场诊断保留原异常、剩余数量和 retries=0 是进展；
历史根因仍 UNKNOWN。OOM 补证仅接受同完整容器 ID 的宿主 Docker 事件并再 inspect，不将137自动视为OOM。

## 已核验内容

检查了 sidecar/reportDigest/冻结版本/源码/产物绑定、重启读取、所有权与CSRF、客户端拒绝 sourceFile、
应用锁内解析、GENERATE/REPAIR 组件范围、origin/iframe.source 点击桥、异步版本栅栏、共享范围提示、
409保留描述、不自动发布、闭合公共OpenAPI及可选componentMappingDigest。没有新增生产秘密或削弱测试。
原 spread/dynamic 参数检测与全命名空间禁用修复已建立回归，旧问题不能因新反例全部称未修复。

实查两候选六项 CI 全 success：PR36 [run38240377250](https://github.com/Echo-love928/CodeLess/actions/runs/38240377250)，
PR37 [run38247878707](https://github.com/Echo-love928/CodeLess/actions/runs/38247878707)。下载 PR37 原API/runner
job日志核对188/188（0failure/error/skip）及67/67。本地受影响UI10/10，mapping/公共/OOM契约8/8，均exit0。
独立镜像真实Docker/Chromium `review-B-marker-case.mjs spread-dynamic` exit0，全部选择UNSAFE_MARKER；
对应证据B-marker-spread-dynamic.json。大小写版本同命令不加参数exit1，两者均记录原生log/hash。
本机不重复B完整API/预览：按用户“作者修复后只重查变更和受影响范围”核验当前精确CI原job中的
组件lifecycle11/11及真实PreviewPlatformIntegrationTest1/1，再自行执行受影响源码反例和UI/契约。
初次用pnpm在依赖junction工作树启动UI测试被pnpm12的state路径保护拒绝exit1，私有log/exit保留；
改为固定Node运行原锁定Vitest CLI（同依赖/同B配置）实际10/10，未改pnpm版本或保护。
CI与已有测试成功不能覆盖本次大小写反例。测试及剩余真实联调记录见 D12-A 本轮交接。

---
