# 生产功能封面：独立任务的最小契约差异（尚未启用）

现有截图target/network/worker只允许不可变发布域名的根`/`；TASK-01实际功能入口为`/tasks`。默认根路径PNG虽通过非空检查，却只是欢迎占位页。当前后端没有生产cover HTTP/OpenAPI及常驻协调器。不能修改既有终态队列、把普通截图改名或把私有adapter说成生产接口完成。

## 已做的无生产变更验证

`scripts/eval/verified-entry-evidence.mjs`把原REAL编辑、VERIFIED版本、D11源码快照、原生draft及runner结果、build/verification/source/artifact摘要、逐动作PASSED结果关联起来。仅当成功navigate只有一个不同的受控入口`/`、`/tasks`或`/catalog`时输出入口证据；不接受外部URL、参数、片段、路径穿越或多入口猜测。它是离线一致性检查，不提供鉴权，也不授权外部JSON驱动生产任务。

原EDIT-05/04导出`/`，EDIT-06导出`/tasks`；`entry-binding.json`与本轮真实HTTPS功能截图绑定。四项测试涵盖三份真实记录、MOCK/错版本/错源码/错artifact、非法/歧义路径、原生浏览器或动作失败。生产使用时必须从平台自己的不可变账本读取同类信息，不能接受请求中提交的record/journal。

## 拟拆独立生产PR的范围

1. 由公共契约登记维护者把现有D16-B拟议GET注册到OpenAPI及schema：
   - `GET /api/v0/publications/{id}/cover`
   - `GET /api/v0/publications/{id}/cover/image?digest=sha256:...`
   匿名401；非owner（含无所有权ADMIN）404；无任务/未成功图片404；证据损坏503。no-store/nosniff；PNG限制、版本/source/artifact/image摘要关联保持原约束。GET不入队、不发模型请求。
2. 私有job/record增加闭合枚举`entryPath`。根发布URL保持原值，实际导航URL只能由可信publicOrigin、不可变publicationId及该枚举构造。metadata、image读取及UI绑定同时包含入口；不能由客户端提供URL、主机或文件路径。
3. 后端从owner所属已PUBLISHED版本的原生VERIFIED/draft/runner账本解析入口，匹配同版本全部摘要和成功动作。缺少或歧义证据明确`ENTRY_PATH_UNAVAILABLE`，不默认把欢迎页当功能页，不改写旧版本或旧失败。
4. Node target/worker/network只增加这三个明确入口；HTTP实际请求入口，SPA响应必须与同一不可变index.html长度/摘要一致。TLS校验、真实DNS/公有IP约束、证书/SNI、跳转拒绝、非转发代理、WebSocket/内网/元数据阻断及资源清单限制全部保持。12秒、最多2次、6MiB PNG等原上限不变。
5. 独立常驻coordinator只处理原生PUBLISHED提交后的服务器事件，幂等、单所有者锁、最多100条记录；不在GET或模型工具中开放enqueue。旧FAILED终态不重置，不自动回收未知owner.lock，不覆盖最近可用发布。
6. 生产Java owner校验后向固定内部网关传递publication/version/digest/entryPath投影；不向浏览器或生成代码转交Cookie、平台密钥、DB凭据或Docker socket。使用已有UI cover适配器及组件，必要时仅补entryPath绑定。

预计涉及独立新增Java cover controller/service/gateway及测试，runner screenshot target/network/worker/queue/adapter及专项，现有UI cover类型/绑定测试，以及由维护者集成的OpenAPI/schema片段。无需根锁、依赖升级、迁移编号或跨文件生成写入协议变更。此范围超出当前D25-A评测文件维护范围，须先明确新任务边界和公共契约维护者；本轮没有修改上述生产文件、配置或服务器。

## 独立任务验收与上线边界

先做确定性拒绝/损坏/越权/歧义/旧版本测试，再用真实DB、构建、浏览器及受控HTTPS做同一版本的发布→功能封面→源码ZIP联调。至少覆盖SHOW-01/02根与TASK-01的/tasks、刷新、owner/第二USER/匿名、旧发布和终态失败保持、超时及清理。模型可用明确命名mock，不能据此宣布生成质量达标。

代码与契约审查通过不等于VPS生产启用授权；默认开关关闭。任何VPS部署、生产开关、新付费复评均单独明确范围。原fb79编辑候选、原六项记录、原九需求及3+2故障不改。当前仍HOLD。

用户现已明确选择“允许开始独立生产 cover PR，按方案协调公共契约”。下一阶段在独立生产分支实现，默认开关关闭、不部署VPS、不新增付费；本目录当前补证没有生产改动。自然失败受控方案仍未执行，真实生成复评仍无授权。
