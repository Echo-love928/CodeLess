# D15-B 只读互审

## 2026-10-14 收尾实际复审（当前结论）

收尾发现[PR45](https://github.com/Echo-love928/CodeLess/pull/45)，精确候选
`a8a12bfe32da95849a3ad78468f9b7b90d8d77fc` / base572304e，作者Echo-love928。
已读39个文件diff清单、全部新增生产UI/publish/probe/hosting实现、测试及公开报告；独立detached工作树只读复测。
**结论：不批准，存在必需e2e失败和联合启用的契约/适配器阻塞。** 以下取代初查的“无候选”状态；初查证据保留。

### 阻塞问题

1. **B必需e2e真实失败。** `tests/e2e/deploy/hosting.acceptance.mjs:26`调用createBuildVerifier前没有准备受控镜像，
   `hosting.spec.ts:8`可在另一个runner测试准备镜像前启动。实际a8a12bf CI job115884831414/exit1，
   `No such image: codeless-vue-build:d05`，本卡托管T1–T3没有执行，整体51/52。
   最小复现是没有该镜像的干净CI执行`pnpm verify:e2e`；修正该fixture自身的受控准备步骤，不能依赖另一个并发测试先运行，
   不删断言/减弱隔离/重跑至绿。原job日志SHA256与摘要已保存`review-b-a8a12bf/ci-e2e-failure.json`。
2. **联合发布请求不兼容。** `apps/web/src/features/deploy/deploy-api.ts:47–54`只POST两个ID，未携带artifactDigest或Idempotency-Key。
   A的`PublicationController.java:publish`明确400；严格request.schema对B精确body的独立校验失败，missing artifactDigest。
   `request-gap.json`记录实际Schema结果（不是虚构真实HTTP联调）。从VERIFIED snapshot取得artifact摘要、显式点击生成并保留key，
   对齐 `contracts/deploy/openapi.patch.json`；相应unit/浏览器fixture也须对真实新请求断言。最终公共维护者登记共享契约后方可启用。
3. **联合工作器适配器缺失。** `services/runner/src/publish/publisher.mjs:26`要求进程内live browserTarget(handle)，
   同文件30–44要求原D08报告/PNG的物理证据；A的 `DeploymentGateway.Payload`是已核验冻结资产字节，
   Java与原Node child之间没有可传递的live WeakMap handle，原成功build进程已经结束。
   把A payload直接交给B会被`live worker-owned`拒绝；不能把序列化/伪造handle作为修复（B边界测试也明确拒绝）。
   最终接线PR必须建立受信冻结字节/验证绑定的私有桥接，核验同publication/version/artifact及实际probe，配套真实A/B验收。
   另A共30秒deadline与B publish30秒+DNS3秒+probe40秒+cleanup5秒不一致，桥接须明确共同截止及中断保留。
4. **联合面板最近成功发现尚未接线。** `DeployPanel.vue:47–64`只恢复sessionStorage里已知ID，
   没有读取A新`GET applications/{id}/publications.latestSuccessful`。已有成功发布、清空该会话存储后再次失败时，
   新面板不知道旧成功地址；B文档也诚实列出这一限制。同会话T4通过不能证明冷会话/跨设备的旧成功恢复。
   对齐A列表契约，并对冷会话、FAILED/未知attempt与既有成功的组合增加真实服务端数据验收。这是联合启用阻塞，非旧测试失败的掩盖。

### 建议

- B的12个公开artifact Git blob摘要全部匹配；Windows普通checkout的9个文本文件受CRLF转换，PNG未变。
  可加本卡证据`.gitattributes`固定字节，避免维护者按checkout误报摘要损坏；不把换行变体当篡改。
- `infra/hosting/README.md`与B交接仍说没有D15-A候选/契约，收尾已存在A PR44，更新对接链接和上述差异归属。
- 页面源码路径、组件catalog/map/私有receipt拒绝、独立域名LocalStorage隔离、redirect/DNS pinning/非root配额边界保持。

### 已核验内容

- 独立工作树 `.local-data/p15-b` / a8a12bf；offline/frozen按同锁安装331包、下载0，跟踪源码始终干净。
  第一次长路径checkout失败且Git清理了未完成目录；改短路径+单命令core.longpaths=true后成功，没有更改公共Git配置或B文件。
- `node tests/e2e/deploy/record-command.mjs unit` native0，8/8；boundary native0，2/2。
  `corepack pnpm --filter @codeless/web build` native0；browser native0，Chromium3/3；hosting native0，1/1。
  原命令/HEAD/exit/日志摘要在 `tests/deploy/evidence/2026-10-14/review-b-a8a12bf/independent-commands.json`。
- hosting独立复测真实Docker/Vue生产build0、D08 Chromium PASSED、Nginx HTTPS的确切公开字节、`/tasks`刷新及`/catalog`200、
  缺失JS/asset/source/catalog/metadata/API/目录文本404、非法URI400、错Host404、POST405。
  生产probe确切非零拒绝同一私网fixture；独立非root容器的test-CA probe成功，第二部署删JS后失败，首部署digest未变。
  `hosting-local.json`是本轮真实结果，**localTlsFixture=true/publicMilestoneReached=false**，不证明公网资源。
- 实际失败面板截图已视觉检查：FAILED及上次成功地址同时显示；本轮Chromium检查刷新恢复不多POST、未知响应阻断、移动端/键盘、迟到响应隔离。
  UI API为明确fixture，不代替A真实session/PG链。没有修改B assertions/超时/重试/隔离或自己的API以迎合B旧请求。
- 两处跨默认目录是WorkBench的最小挂载和tests/infra的真实runner发现入口，未见根锁/CI/迁移/秘密/开放shell或平台socket挂载变动。
  作者原API/默认并发e2e失败保持，没有将独立复测覆盖为全量success；原始报告12项Git blob摘要重新核验全部通过。

作者修复后只重查新增差异、上述受影响用例及精确HEAD必需检查。当前未正式批准、未写B代码、未合并或部署。

## 初查历史（保留）

2026-10-14，A基线572304e。已fetch origin并查询最新25个PR：最新为D14整合PR43，
没有D15-B候选、契约差异、测试报告或远端分支。此记录是前置缺失，不是代码审查通过；未批准任何A/B候选。

## 阻塞问题

- 无可核验的B候选。无法验证公开地址正确版本、刷新子路由、缺失JS404、源码与目录索引不泄露、失败面板保留旧成功。
  尚无实际公网托管适配器；A默认明确HOSTING_UNAVAILABLE。公网里程碑未达成。
- 公共 `contracts/openapi.v0.json` 的发布请求仍是旧两个ID。
  最终启用维护者需登记 `contracts/deploy/openapi.patch.json` 并对接必需 artifactDigest / Idempotency-Key；旧请求会400。

## 建议

- B注入 `DeploymentGateway`，实现独立不可变publication位置和有期限的真实访问/字节探测。
  不接受用户URL，拒绝重定向/private DNS解析；见接口JavaDoc与 `contracts/deploy/README.md`。
- UI一次点击生成key，重复网络请求保留key；显式重新部署生成新key。
  展示 `latestSuccessful`，不从最近失败attempt的null URL推导“无已发布版本”。

## 已核验内容

- 只读核对现有main、D11/D14交接、共享Publication schema、PG发布约束与模型工具注册表。
  这些不代替B托管/UI审查。A定向报告只证明锁定/状态/幂等/失败保留，fixture域名不是公开访问成功。
- B提供候选后按精确HEAD读取diff与测试报告，逐项实际访问 `/`、Vue子路由、缺失 `.js`、source/map/目录入口；
  将探测失败后UI显示与GET应用publications.latestSuccessful比较。作者修复后只重查变更及受影响范围。
