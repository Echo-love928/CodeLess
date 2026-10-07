# D10-B real-model smoke payload

Status: BLOCKED_BY_APPROVAL_REVIEW; no provider request has started in D10-B.
Destination: https://api.deepseek.com/chat/completions; model deepseek-flash.
Entry: services/api/mvnw.cmd -f services/api/pom.xml -Dtest=RealPreviewPlatformAcceptanceIT test.

The exact synthetic request (existing main fixture):

> 生成 Ada Lovelace 个人展示页，静态数据展示姓名、简短介绍及两件作品：Analytical Engine 和 Note G。恰好两个文件：src/pages/HomePage.vue、src/components/ProfileCard.vue。先读取依赖源码，保持组件接口和页面数据类型一致。不要外部图片或请求。

PLAN sends this request, STATIC data mode, the existing planning policy and schema. GENERATE sends the same request, returned plan, public generation policy and file-tool schemas; subsequent observations contain test call UUIDs, file operation status/error codes, relative file paths, generated Vue source on files.read, hashes and byte counts. ControlledWorkspace.View contains files/totalBytes/sourceDigest; it does not contain an absolute workspace path. The generated source belongs to this new isolated synthetic task.

No repository enumeration or customer data is included in model messages. The API key is used only for the provider Authorization header. Browser/runner subprocesses explicitly remove the model key/name. The repository is PUBLIC (verified via gh); runtime policies, schema, registry and this test request are already published on main adb79b86f221862a970733a406d09fd96e92250e.

One explicit new task, no automatic outer retry. Existing limits remain 12 model calls, 20 tools, 50,000 runtime tokens, 12 minutes per task. Success/failure, task ID and measured usage will be reported independently of fixture checks. D10-A repair integration cannot be accepted until its implementation is available.

Automatic approval review rejected the initial invocation because exporting the specific test payload to DeepSeek had not been explicitly authorized. Await a user response before the paid invocation; silence is not approval.
