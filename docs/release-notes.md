# CodeLess D27 候选版本说明

封存后的验证补记：唯一选定API源码为 `1f072dc361bd6e05b899390c7e84678711716f20`，包内本说明保留构建时Git快照，当前验证状态以本补记、candidate.json及D27-A交接为准，不回写不可变包。发布专项16/40/22项、四模块import、真实校验均通过；原四阶段中static/API退出0，runner284/285退出1，ci-gate仍1。两轮Root E2E环境失败保留；固定提交干净worktree原E2E80/80及完整平台退出0。不得据局部新绿测推导总门禁success。

现有D23规范演示库（原模型mock，原构建/浏览器真实）的新包V5兼容/原账号/版本/源码/原ZIP读取已补证；这不是生产数据库迁移或原绝对journal预览/公网启用。当前额外阻塞为runner队列腾位的ENOTEMPTY机制未知、B PR92的runner-only根缺后端固定桥映射、B公网平台/真实认证隔离和唯一组合提交未验收。B自身精确HEAD六项CI成功不关闭这些缺口。整体继续HOLD。

状态：**CANDIDATE / HOLD，不具备合并或上线条件**。候选API源码提交、产物集合和可信manifest摘要见 `tests/release/api/candidate.json`；后续交接提交不是新构建来源。API包与client包必须分目录，D27-B尚未提供的材料不能视为联调通过。配置/迁移/恢复见 `infra/release/api/README.md`。

当前实现支持受控 Vue 模板，生成数据限静态数据、显式 Mock 或 LocalStorage。平台采用 Vue+TypeScript、Java21/Spring Boot4.1.1/Spring AI2.0.1、PostgreSQL17.6，Node24.22.1、pnpm12.6.0、Maven3.9.11；不升级锁定版本。执行 PLAN→GENERATE→VERIFY→REPAIR/READY，状态由真实工具/构建/浏览器结果决定；失败保留最近可用版本。

已实现的接口能力：session+CSRF登录、owner隔离应用/任务/不可变版本、版本列表/源码读取、组件级可视化编辑并重新验证、用户显式发布已VERIFIED版本、源码ZIP导出、基础后台。预览/生成站点与平台会话隔离；发布不接受任意命令、路径或托管URL。配置/卷/worker缺失时失败或不可用，不能把这些接口的存在解释为当前候选已完成公网验收。

封面/截图执行与安全边界已有实现，但 **CODELESS_COVER_ENABLED=false** 默认不启用生产自动capture；**CODELESS_PUBLICATION_ENABLED=false** 默认不启用托管适配器，必须由受信操作员完成隔离配置及验收。provider默认 **deterministic-mock**，确定性模型结果不证明真实模型质量；真实模型需独立凭据/计量/评测。

已知限制与未完成：

- 仅受控试用，单机/共享私有卷部署约束；多副本/长期容量和SLA未验收。不得向生成容器挂平台密钥或Docker socket，浏览器/截图不得任意访问内网。
- D26的真实需求质量6/9、自然FAILED观察缺口、生产自动capture、公网/真实受影响样本复评，以及历史镜像失效/Maven故障精确机制未知仍保持原HOLD；本卡不会用新的绿测覆盖旧失败。
- 本卡真实PG迁移用显式合成历史演示fixture；实际运营演示库备份尚未提供。fixture中历史VERIFIED/build/publication为数据兼容性样本，不能证明这些历史构建/发布真的执行过。D23已有恢复后的预览/源码包/独立构建证据属于D23固定候选，不继承为D27通过。
- 生产Linux/systemd停写、异机UID/GID/ACL、加密异机备份和RTO需操作员实测。恢复必须保持原绝对数据路径；没有自动降级迁移或自动切流。
- D27-B全新浏览器、平台/示例站点、固定提交构建、会话隔离与公开材料无真实评审密码的互审，以及唯一组合候选和精确HEAD门禁仍需完成。
- 不支持 React、独立HTML策略、生成后端/数据库/支付、AST精确编辑、RAG、多Agent或开放shell，不接受任意依赖安装。截图/源码导出/编辑/发布能力均受现有鉴权及不可变版本契约约束。

数据库只沿用Flyway V1–V5，本卡无新增/修改迁移。首次安装、V4→V5前迁、已到V5的再次启动、checksum异常拒绝及数据/源码读取的本轮结果以D27-A交接和证据为准；未运行项保留NOT_RUN，失败保留非零。回退恢复源版本成组备份，不能直接换旧JAR连接前迁数据库。
