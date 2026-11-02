D28-B｜候选版本用户流程独立验收，**HOLD**。

此前缺少B侧绑定固定源码的独立用户流程验收、实际证据和同日互审。基于最新远端main `2be793dc3318c2308d18a7fd45afb201342206a7` 建立独立工作树；用户流程固定测试源码 `c707bb8a334358632c362d45fa8ad9fd51338c45`，后续提交添加记录和采集工具。原main及已有改动保留。

- 范围仅 `docs/acceptance/frontend.md`、`tests/release/browser/**`、`docs/handoffs/D28-B.md`；无产品、公共契约、依赖锁、CI、迁移或生产配置变更。
- 独立专项原生0/浏览器1项通过：两个普通用户真实登录、生成→真实编译失败→REPAIR→编辑→显式发布→实际ZIP下载；桌面/移动三路由、双向权限、真实离线和预览过期恢复、无进展失败保留旧预览/发布/历史ZIP、错误版本下载拦截。PG/Docker/Vue/Chromium实际执行，源文件/HEAD未变、canonical=true、cleanupErrors=[]。明确mock和声明合成预算，不当作真实模型质量或公网安装。
- 原四阶段ci-gate原生1保留：static Node64/UI212日志通过（未单独捕获父进程native）；runner282/285、fail1/cancel2；关键E2E77通过/2失败/1未运行、原120秒截止。未改原断言、截止、重试、隔离或testMatch，新专项不替换原门禁。
- 正确配置API原命令在重启恢复阶段中断，最终native未知；封存73类/316计数/22失败/error0/skip0，包含CLEANUP_TIMEOUT和前置不可用的连锁失败。仅补验未完成17类，78用例原生0；观察合计90类/394计数/22失败，不能声称428个case body全部通过或完整API原生0。原始失败不重跑求绿。
- 恢复后重新只读公网检查原生0，正常DNS/TLS、1440/390px三路由刷新、资源字节、匿名保护及源码/元数据拒绝；匿名trace49条网络记录无凭据头。示例是D27历史站点，当前受保护API/worker/image身份仍UNKNOWN，未将本地ZIP与另一公网版本拼接为同源结论。
- D27原件六项SHA、259/11文件、258源码blob与JAR已独立核验；gh原日志获取方式精确重现声明摘要，直接job接口产生另一组字节，未归一化放行。A的PR94@438c0f5当前E2E/ci-gate失败，独立审查记录三类结论；未批准或发送review/comment。
- 公开JSON在D28自有证据目录以 `-text` 保存原采集字节，避免Git换行转换改变SHA。旧ec212的12处发布字节差异单列；23处公开引用直接校验Git blob/索引。原日志、产物和测试结果未改，HOLD不变。

[验收记录](https://github.com/Echo-love928/CodeLess/blob/codex/d28-b-candidate-acceptance/docs/acceptance/frontend.md)、[交接](https://github.com/Echo-love928/CodeLess/blob/codex/d28-b-candidate-acceptance/docs/handoffs/D28-B.md)、[逐项证据汇总](https://github.com/Echo-love928/CodeLess/blob/codex/d28-b-candidate-acceptance/tests/release/browser/evidence/d28/summary.json)。原日志、认证trace、ZIP、备份和二进制保持私有；公开路径/长度/SHA及限定匿名截图/trace。

开发token与全量实际模型用量UNKNOWN；最终专项17次mock、合成1700/1700，另账不冒充实测。新付费模型请求0。生产身份、原故障根因、真实模型/cover与规范备份独立核验仍未闭环。PR保持草稿；最新main、精确最终HEAD全部必需success、无未解决讨论及另一成员批准前不得合并，旧SHA检查不继承。
