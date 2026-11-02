# D28-A 对 B 侧只读互审

## 2026-11-02 当前增量（替代下面的“材料缺失”当前判断）

已只读审查PR95@80205692；23处公开引用逐Git blob SHA匹配，产品/契约/锁/CI无变动。原文件缺失项关闭；A direct日志与B direct严格相同，B的gh旧声明按原gh命令精确重现证据已审，不把不同获取格式当未解释字节篡改。A未独立运行gh，未将B私有专项冒称A重跑。详见 `../d28-fix/peer95-review.json`。

当前阻塞：A当前438的E2E/ci-gate失败及Windows产物EPERM根因；B原完整门禁失败/中断仍保留；真实质量/cover及新候选最终检查未闭环。当前部署61身份现已独立只读9项证明，不再以“没有访问”阻塞旧部署身份，不能冒称新候选已部署。建议B同步本次D08项目名/trace路径变化；原断言/案例/120秒截止不变。已核验B全链源/报告边界清晰、合成模型与公网历史样例分账。结论仍HOLD，未批准、未发review/comment。

## 以下为当时查询快照（不继续列为当前缺件）

结论：**D28-B NOT_REVIEWED / HOLD，未批准。** 已完成 D27-B 前置产物及当前组合来源复核；不能把 D27 的成功改名为 D28-B 独立验收。

本次A独立全量API另有新阻塞：2be为427/428、native1；RoundFive BARE在build0后artifact rename EPERM，详见 `api-failure.json`。具体Windows占用/权限原因UNKNOWN，不能据同源61的Linux CI成功抹去；这不是已证明B引入的缺陷。用户确认“若B还没完成就先继续”，因此继续A侧，不等待B材料，不将缺材料改成已审。

审查基线 `2be793dc3318c2308d18a7fd45afb201342206a7`；D27-B PR92 最终 HEAD `5299e69a0b3ba92c45a9440a7d50a1dab81c1784`，实际产物源 `61df15eba456422762a667aaed7734b7d13b48e7`。GitHub 只读查询时 PR92/93 均 closed、mergedAt=null，不根据标题/旧交接推定合并方式；main 实际新组合已另行核验。审查没有修改 B 文件，没有发消息、评论或 APPROVED。

## 阻塞问题

1. **B28-MATERIAL / 同日互审缺材料**。`docs/handoffs/D28-B.md` 及 D28-B PR、契约差异、候选关键 E2E 报告在本地 main/公开查询均未发现；第一次查询 open PR=[]，branches 中含28=[]（完整性标记在审计结果）。复现：`d28_audit.py --network` 的 openPRs/branches，以及固定 main 的目录清单。四个同日重点均不能作 D28-B 通过结论。需要 B 提供精确 HEAD/PR 和报告；已向用户请求该信息，同时继续独立工作。
2. **B28-PROVENANCE / 日志摘要不一致与包缺件**。初次审计时 `ci.json` 所列 B 机路径在本机不存在；后续使用既有 GitHub 凭据助手只读取回61的四份原始 job log，详见 `peer-ci-originals.json`。static/E2E 与 B 声明摘要完全相同；API实取 `128cc71a378ea01fcc93fe0caf53f2571fe46b812bd6e874bf70a0846047c091`，B声明 `4bab30affa21d37036f9c91bad9835cde7db9531f3a51420865c105e48154397`；runner实取 `95c7784ddf904d0aefb77ee76ca7f064016778a9840158665fb06014019d26a2`，B声明 `d6be099adefda914245a0a6fd947c71f58aefca4ea6a485b67bc19a0abd49caf`。**差异原因 UNKNOWN**；可能的获取/展示序列化差异未证实，未归一化或改写B摘要。取回日志真实包含428/428、285/285、skip0等成功信息，但不能据此宣称已复现B同摘要文件。B应交同摘要原文件及原获取命令/格式说明。`selected.json` 的成组 tar/镜像 tar 本机也未收到，仍需受保护渠道同摘要实物或只读访问；不要求将秘密/整库/原日志公开入Git。阻塞完整T4/候选集合复核，不据此指控B伪造。凭据未输出，下载重定向仅HTTPS受信日志域且不传Authorization。
3. **B28-LIVE / 当前受保护部署身份未重核**。`current-status.json:25` 保留原 ENOTEMPTY/CLEANUP_FAILED 和 D23 缺口；A 只独立 GET 了公开静态字节、匿名401/内部404，未登录服务器、未持有真实评审会话。`server.json` 的公网真实登录/预览/UI ZIP/隔离及新 SQL ID 绑定已与源码/清单交叉复核，但 A 没有执行该受保护链，不能记为 A 的当前真实复验。2be 新候选没有部署；T3 完整一致性仍阻塞。
4. **B28-OPEN / 严重发布阻塞未归零**。`docs/handoffs/D27-B.md` 当前顶部、`docs/release-blockers.md` 与 `final-61df15e/current-status.json` 仍保留原失败根因 UNKNOWN、真实模型质量/生产 cover HOLD。新 285/285 或 428/428 不关闭历史失败，也不证明真实模型效果。需要原事故现场/对应维护者根因和新候选受影响重测，不手改绿色状态。

## 建议

- `docs/release-client.md:33` 仍写目标环境导入未演练；`:74` 又写 `/srv/codeless/repository` 尚未安装/公网尚未启用，与顶部当前61已部署结论冲突。建议将旧状态明确移为历史并统一当前操作说明，避免后续操作员重做激活。此项文档建议不推翻顶部已声明的证据优先级，A 未越界修改 B 文档。
- `tests/release/browser/public.mjs:12` 仍固定读 D15 历史样例，该脚本明确 canary 边界是正确的。D28-B 应把新版本的 authenticated-download/server proof 与关键用户流程作为主证据，继续禁止使用历史页面或合成 Cookie 冒充新候选真实会话。

## 已核验内容

- B 当前完整报告/构建/公开与受保护 evaluator 源码、candidate/selected/API/client/CI/server/live-deployment/operator-harnesses 已只读检查；旧 46e/2d/6d/51 身份及撤回被明确保留，没有把旧成功覆盖新失败。旧 D27-A 审查的“桥缺件”和“未有组合包”不再作为当前代码缺陷。
- 两份 manifest 的 **Git 原始字节 SHA256** 严格等于外部 selected 摘要；API 258 项源文件的 Git blob/SHA256 与61、2be均逐一相同。worker 源摘要、客户端锁/构建器/config、7份web、部署记录/新发布app/version绑定互相一致。没有换行归一化或口头放行。审计 `28` 项通过、mismatches=[]，**整体退出1/BLOCKED**。
- 重新读取 GitHub `61df15e` 的6项 completed/success，无 neutral/skip 代替。原始 child exit 不由 GitHub success 推成0。2be/最终任务提交各自需要自己的当前检查。
- 四份原始GitHub日志已独立下载并私存；static/E2E摘要精确复现，API/runner摘要差异单列阻塞。下载命令退出0仅表示取回成功，不表示两份摘要差异通过。当前2be远端六项success也另查 `remote-final.json`，没有继承61状态。
- A 独立匿名 GET：平台7文件、新 D27 示例2文件与报告摘要一致；auth/me及版本导出401、内部路由404。首轮 URLError仍保留；一次诊断后仅重跑受影响公开检查，正常系统TLS，无 hosts/TLS例外、mock请求、Cookie或登录。报告中的系统 DNS 是本机解析结果，不声称独立未代理公网环境。
- B 原 `node --test tests/release/browser/package.test.mjs`：首次沙盒权限 EPERM，3/4、native1；操作员权限同原命令4/4、native0、skip0，未改原断言。真实 canonical runner.tar 展开后调用固定桥得到预期拒绝码2，且无 MODULE_NOT_FOUND；这证明归档布局/桥装载，不冒称该专项执行了完整构建/浏览器。两次独立回执 `peer-unit/` 与 `peer-unit-operator/` 均保留。
- API 发布完整性专项原17项 native0；覆盖篡改、缺件、多件、可信摘要缺失、路径/硬链接/目录链接、POSIX排序与拒绝覆盖。前端响应流取消和worker UUID scratch修复没有被本卡修改；其真实组合回归由原门禁/既有报告分别证明。
- 检查范围内公开源码未见真实密码/token/私钥；evaluator凭据走匿名stdin，同机真实会话不导出。未改变秘密挂载、Docker socket、网络/路径隔离、预算、取消或发布鉴权。该结论限本次审查范围，不声称全仓绝对无秘密。

作者新增 D28-B 或修复后，仅复核变化和受影响范围，再按仓库规则独立批准；当前没有待批准的 D28-B PR，A 不代替作者补成功状态。
