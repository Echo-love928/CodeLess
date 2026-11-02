# D28-B 独立用户流程验收

基线 `2be793dc3318c2308d18a7fd45afb201342206a7`。生产模块、契约、锁文件和既有必需测试只读。

```powershell
$env:JAVA_HOME='C:/Program Files/Java/jdk-21.0.12.1'
# Windows Testcontainers 不读取 Docker CLI 的当前 context，显式传入本机实际 endpoint。
$env:DOCKER_HOST=(docker context inspect --format '{{.Endpoints.docker.Host}}')
corepack pnpm install --frozen-lockfile
$nodeRealPath=node -p "require('node:fs').realpathSync(process.execPath)"
& $nodeRealPath tests/release/browser/d28-record.mjs flow
& $nodeRealPath tests/release/browser/d28-record.mjs public
```

使用仓库锁定 Node 24.22.1、pnpm 12.6.0、Java 21、Playwright 1.60.0；不升级依赖。
Node须使用真实路径；本机 `E:/nodejs` 是NVM符号链接，生产路径门禁会拒绝它。使用同版本 `E:/nvm/v24.22.1/node.exe` 的原 `NodeCoverGatewayTest` 3/3通过；不关闭链接检查，也不改断言。

`d28-flow.mjs` 和 `d28-user-flow.spec.ts` 从基线 D20 完整业务验收复制基础设施与原断言，仅在本卡允许目录独立扩展，未替换原门禁。`D28FixtureApplication.java` 只在测试 classpath 编译，不进入生产 JAR，也没有生产 profile/HTTP 开关。明确的 deterministic-mock 首次提供缺组件导入；真实 Docker 构建失败，生产 REPAIR 用可信源码摘要更新导入，再真实构建和 Chromium 验证。两个全新普通用户分别完成登录、生成、修复、共享组件编辑、显式发布、下载和 ZIP 独立核验。每个用户还验证桌面/390px 移动端三路由、刷新和横向溢出。

本卡mock每次调用声明100输入/100输出/200合计的**合成预算fixture值**，标记 `DECLARED_SYNTHETIC_NOT_MEASURED`，不能充当模型实测用量。首轮继承unknown usage时，第5次REPAIR调用被真实保守预算拒绝，`AGENT_MODEL_BUDGET_EXCEEDED`；原失败回执保留。改为显式合成账本用于测试后续流程，生产预算、未知记账、模型凭据与既有断言不变。

保留原跨用户404、过期编辑409、错误摘要拒绝、真实离线恢复、错误版本下载拦截与历史源码核验。新增用例启用修复，因此末尾明确语法错误后的 bare done 应以 `AGENT_REPAIR_NO_PROGRESS` 终止；它必须保留旧预览、发布和源码。SQL断言实际失败构建3个、成功构建4个，不能用模型声明代替结果。新用例独立截止480秒/总500秒、零重试；仅新增双构建的初始修复任务观察上限120秒，其他任务60秒，原必需用例的超时/断言/重试不变。

第二轮修复构建与浏览器已实际执行，但继承的单构建60秒观察先到期，SQL任务仍VERIFY、failureCode=null，未作READY结论。该轮native1/trace继续保留；新修复用例单独明确双构建观察窗口，不能用它覆盖原门禁的任何超时失败，也不放宽构建/浏览器工作进程截止或生产12分钟任务预算。

第三轮两个用户已完成全部成功链、两份ZIP独立核验和双向权限矩阵；末尾开始失败保护检查前，第一个用户的预览凭据因真实空闲而过期，界面正确移除了iframe/组件选择。该轮native1和截图/trace保留。新用例通过真实“刷新预览”按钮恢复同一版本后才继续；不延长生产凭据寿命、不注入凭据。新独立总窗口按两条已实测约335秒成功链，加显式过期恢复和真实失败保护/历史下载阶段，固定480秒，不覆盖原门禁失败。

该本地链使用显式 loopback DNS/自签 TLS/托管 probe fixture，生产公网探测限制不变。它不证明公网部署或真实模型效果。Tasks/Catalog 是受控模板占位页；路由检查不宣称已生成任务 CRUD/目录筛选功能。

`d28-public.mjs` 对固定平台和 D27 已知示例执行匿名只读 GET 与浏览器操作，使用正常 DNS/TLS、不注入响应。当前资源逐字节核对历史清单，桌面/移动截图和全程 trace 保留；它不证明当前 API/worker/image 身份，也不将历史示例当成本次新发布。

`d28-record.mjs` 的 flow/public/api/e2e/gate 模式记录原生命令、退出/信号、HEAD、输入字节摘要和私有日志摘要，不重试。gate仅在父进程复用已有被动 stage-observer，记录原 ci-gate 各阶段退出；不注入子进程。原门禁生成的历史 evidence 文件先私存新字节再恢复旧字节，避免覆盖历史证据。

全部新运行在 `.local-data/d28-b/`；认证 trace、ZIP、原日志只保留本机，公开证据提供其长度/摘要/定位。匿名 trace 经请求头检查后方可公开。最终结果以 `evidence/d28/`、`docs/acceptance/frontend.md` 与 `docs/handoffs/D28-B.md` 为准。缺凭据/部署证明及同伴失败必须保留 BLOCKED/HOLD，不能由局部绿测推导 M5。
