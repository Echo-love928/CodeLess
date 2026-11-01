# D27-B 最终候选验收

产品来源：`61df15eba456422762a667aaed7734b7d13b48e7`。状态：**已授权部署候选、公网验收通过、PR draft/HOLD**；未自批/合并main。当前指针 `tests/release/browser/candidate.json`。

## 已修复

- runner缺受信桥/README：6c01dd7；跨API/B Git归档字节不一致：3351690。
- Windows/Linux Path排序造成同259文件清单校验失败：51e415e，固定POSIX排序，RED1→GREEN0/17项与Linux真实包内verify0。
- Java `work/<taskId>` 被worker固定base-only契约拒绝：b4a43da；仅允许固定base或规范UUID子目录，不放任任意路径，链接/穿越/别名仍拒绝。
- 匿名401响应未释放导致原浏览器networkidle超时：61df15e；取消未用错误流后保留HTTP错误，RED5失败→GREEN6项，完整web212项/lint/typecheck/build0，原外部入口不改时限/不注入情况下0。

## 最终产物

API manifest `e488c594cd32ac3bcf7b76faffba7810bc400a7f9c8bd8daa19340ae76a7246c`；client manifest `676635224f6e6dc28e0d8794daf34c87da6e3773b265cc0ee93485e38dee943b`。完整清单见api-manifest.json/client-manifest.json；成组tar与镜像sha见selected.json/image.json。API/client/镜像均61同源，113共享文件严格相同，第二空目录client manifest逐字节一致。

## 命令与原生结果

| 命令/入口 | 原生退出 | 证据 |
| --- | --- | --- |
| `record.mjs image/combined/build/compare/ingress`，参数61完整SHA | 0 | commands.json、combined.json、image.json、reproducibility.json、ingress-fixture.json |
| `python -B tests/release/api/test_release.py` | 0，17项 | regressions.json（日志摘要） |
| Linux `python3 -B <same-commit fixture>/tests/infra/public-worker.test.py` | 0，10/10，skip0 | server.json.boundary |
| 非root隔离Unix socket→task scratch→桥→Docker→Chromium | 0，VERIFIED | server.json.ipc；与正式API peer配置不同，明确fixture边界 |
| 同服务器真实D25备份→独立PG→新JAR登录/版本/源码ZIP | 0，10项 | server.json.realBackupCompatibility；不是D23规范数据集 |
| 原 `run-acceptance.py --run-id d27-61df15e-20261101-1 --commit-sha <61SHA>` | 0，11组真实公网链 | server.json.publicAcceptance |
| 同服务器evaluator实际UI源码ZIP/预览/真实会话隔离 | 0，5组 | server.json.authenticatedDownload；首轮CDP harness1保留 |
| B机原 `record.mjs public <61SHA> <bundle> <fresh-output>` | 0，原30秒截止 | public-anonymous-original-entry.json、commands.json；历史样例/合成Cookie部分不计新候选 |
| B机 `node infra/public/check-external.mjs <new-proof> <fresh-output>` | 0，正常DNS/TLS与新站点 | external-new-site.json |
| 原 `check-final.py --run-id <new-ID> --commit-sha <61SHA>` | 0，SQL/角色/挂载/资产/清理 | server.json.serverFinal |

精确61的CI41297904093六项success：static Node64/UI212，API428/428、0failure/error/skip，runner285/285、Linux10/10，E2E80/80及full-product browserExitCode=0。GitHub未提供阶段原生码的字段保持null，不由success伪造0。ci.json提供job URL、原始解码日志sha与计数。gh日志并行缓存曾导致static/e2e下载1，改用同job直接只读API取回0，未重试测试。

## 实际部署

固定API/agent有效根 `/srv/codeless/repository`，export未单独配置时回退同根。OPS worker `/opt/codeless/ops/worker.py` SHA311ed218... 与同源文件一致。当前新任务实际使用image `sha256:e3d4431bcf42d644b8e89fe703af596c51b848d7c4ea9e68bcc983514cfbb850`，build exit0/browser exit0/cleanup均确认；不是仅凭tag推断。三个ingress原字节一致，platform原CRLF差异已先备份、安装候选字节、nginx -t/reload并核验容器内SHA0。线上7个当前web文件与清单一致；保留旧hashed静态缓存供已打开页面使用，不把旧缓存当新产物。

新应用/任务/构建/版本/发布均由本次真实创建。新示例：https://d8acce2590cf08eb49e693b5140c7f0c1.sites.codeless-publish.top/ 。同mock可能输出与D15相同的静态字节，但本次deployed SHA、实际build ID/image与SQL新记录独立绑定；不复制历史成功。新app模型审计7次provider仅deterministic-mock，paid0；非真实模型质量证明。

真实UI ZIP为21081字节，SHA256 `17b5fcb49736808a357a521513d203e65e2e9a4226feb24ffbad5399101729a7`，选择的版本与响应、预览、发布绑定；真实平台session不进入新站点请求或cookie jar，回平台仍登录。所有密码/cookie/token/私钥仅在服务器内存/匿名管道消费，没有进入Git或导出。

## 保留的失败与限制

2d39852字节差异撤回；6d5d72d Linux清单失败撤回；51e415e公网IPC失败后确实恢复原JAR/repository/web/tag，保留失败app/task且不覆盖DB；b4独立Linux/IPC/CI通过但在激活前被HTTP修复版本替换。最终61切换与备份见activation.json/live-deployment.json。原始备份/日志/ZIP/截图不入Git。

**原A机ENOTEMPTY仍UNKNOWN，原284/285与ci-gate1不变；PR93@94ab4dd原CLEANUP_FAILED仍UNKNOWN，原427/428与gate1不变。** 新4/4、30轮无注入、285/285和428/428不关闭历史原因；生产queue未改、未加删除重试/吞错。需A机原失败日志/现场与写入/占用追踪。D23规范机密备份未提供，独立22项仍BLOCKED；D25真实库与合成V4不能替代。

combined.json中无主机/未公开标记是构建器固定占位，实际当前状态以current-status.json及server.json/live-deployment.json为准。public-anonymous报告中D15/synthetic部分不作为新D27真实会话证据。发布/真实质量/cover既有HOLD保留。
