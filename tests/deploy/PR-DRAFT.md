已鉴权owner现在可以显式请求发布指定VERIFIED不可变版本。以前只有Publication契约和PG约束，缺少HTTP业务入口、幂等与部署过程记录。

请求固定versionId和artifactDigest，复核真实成功build及冻结PASSED报告；owner/key由PG锁去重，工作器读取冻结manifest字节。
新增PREPARING/PUBLISHING/PROBING/成功失败持久账本，只有一致的访问探测才提交PUBLISHED；失败或中断保留所有旧成功行及地址，模型工具无法调用发布。

验证：d6dab94定向API真实PG/Docker/Chromium9/9通过，T1–T4和权限/严格输入/中断/篡改/私有卷路径均有证据，native exit0；部署契约Schema2/2及私有组合OpenAPI lint退出0。
本地768e749完整gate退出1（API219项、0failure/5error/0skip，共享DB连接耗尽；本卡9/9，runner70/70，Chromium48/48）。
768e749远端API另发现发布suite误领取共享队列遗留task和共享DB连接耗尽；d6dab94将发布suite隔离到独立真实PG并关闭上下文，未删除断言或改测试顺序。
所有历史失败保留；d6dab94完整远端API219/219、0failure/error/skip、本卡9/9，六项checks（含ci-gate）全部SUCCESS。
最终结果见docs/handoffs/D15-A.md与tests/deploy/evidence/2026-10-14/commands.json；后续证据/交接HEAD需读取自身checks，不继承旧HEAD检查。

限制：托管/probe为明确fixture，默认生产适配器HOSTING_UNAVAILABLE，没有真实公开成功地址。
D15-B候选缺失，尚未完成互审或联调；最终启用PR须注入安全托管适配器、实现面板、登记contracts/deploy/openapi.patch.json并完成公网验收。
卷与PG不构成原子事务；共享私有卷和中断人工核对要求详见契约。未改迁移编号、锁文件、CI、前端或runner；未升级兼容版本。
草稿待独立审查、精确HEAD必需检查成功与base同步；作者不自批、不合并。
