# B 同步 A acdc183 后的复核

测试候选ac96b91，A依赖acdc183，main413e5b8不变；最终文档/证据提交以PR34 HEAD为准。
commands.json记录每条实际命令的HEAD、测试dirty状态、时间、原生exit/signal及私有原日志SHA256。
复用了A固定记录器；私有run目录名含d11-a不表示测试在A工作树，metadata.repository为当前B仓库。

受影响前端24/24、存储/前置守卫9/9、契约3/3 native0；完整门禁native1，API175项30failure/1error/0skip。
static65/65、runner44/44、E2E41/41成功。显式真实面板1failure/0error/0skip、native1，原生成前置失败。
两份prerequisite JSON是本轮真实API gate投影：真实VERIFY/AGENT_BUILD_EXIT/build exit1/EIO、无artifact，
后续安全验收明确未执行，不将其当权限测试通过。没有删/跳过安全断言或放宽隔离。

本机旧失败与另一机器B8640035面板1/1保持分开；EIO根因UNKNOWN，不继承旧HEAD的远端success。
公共OpenAPI与历史来源映射由用户指定另交维护者，本轮没有改公共文件、迁移或后端业务。
没有新增付费模型调用，mock及开发token量UNKNOWN。main未改，PR保持草稿、需最新候选独立复审。
