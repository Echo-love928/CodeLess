# M1 真实模型验收 payload v2：生成完成后注入

状态：对应测试已修正，非付费隔离回归2/2、exit0；尚未运行v2的真实付费任务。
前两个v1任务及原payload保留在7ea187f和各task独立证据目录。第一次协议失败，第二次在GEN阶段提前修复了早期注入，并遇平台HTTP504；均不是M1成功。

目的地仍固定 `https://api.deepseek.com/chat/completions`，现有 `deepseek-flash` 与现有凭据。所有执行过的模型阶段使用真实provider，模型原始回复逐字节原样返回。
合成需求原文不变：

> 生成 Ada Lovelace 个人展示页，静态数据展示姓名、简短介绍及两件作品：Analytical Engine 和 Note G。恰好两个文件：src/pages/HomePage.vue、src/components/ProfileCard.vue。先读取依赖源码，保持组件接口和页面数据类型一致。不要外部图片或请求。

PLAN/GENERATE外发上述需求、公开已有策略/Schema/文件工具、计划与实际观察；REPAIR外发同需求、原actions、该隔离任务的Vue源码/摘要、相对文件路径、实际TS2307错误与文件工具观察。不外发客户数据、宿主绝对路径、凭据或私有仓库源码。
API key只用于provider Authorization header，浏览器和runner子进程剔除模型key/name，不输出或提交密钥。

v2唯一故障注入时点：收到真实GENERATE的done后、生产冻结源码之前，用生产文件工具读取HomePage，再按expectedDigest将一次ProfileCard import改为M1MissingCard。
这2次宿主文件操作也计入原20工具预算并写真实journal；不改模型done/actions或已冻结快照，GEN阶段再没有机会观察/提前修复该故障。
这是明确披露的宿主故障，不能称模型自发错误。实际构建必须先TS2307失败，再由真实REPAIR修复、冻结新版本、重建/浏览器、同task签名隔离预览均通过，才M1 PASSED。

同一任务上限仍12模型请求、20工具、50,000运行时tokens、12分钟、最多3轮修复；模型/网络失败立刻停止，不做外层重试。
如果另行授权，将只执行1个新任务、单独计费/计量。此前本轮12请求/38,336实测tokens与A原历史失败均保留，不覆盖、不合并到成功任务。
执行入口仍 `cd services/api; ./mvnw.cmd -Dtest=RealRepairPreviewPlatformAcceptanceIT test`，必须新增明确授权后才能设置CODELESS_M1_REAL_APPROVED=1。

最终决定（2026-10-07）：用户停止追加付费。本v2未获执行授权，未执行第三个任务；M1仍NOT_PASSED。
