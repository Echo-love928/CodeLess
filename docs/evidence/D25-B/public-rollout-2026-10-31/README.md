# B直接公网复核与VPS只读cover上线（2026-10-31）

用户本轮明确要求解决“B直接公网DNS缺口及VPS未部署”。**B的独立公网复核现已完成；VPS已实际部署PR86固定交付54f347f7da3c39311003f682022c955a6769b76e（实现45650b16981b04b6d65742befea8793b21f7a229）的API、runner源码及UI，并启用owner只读cover GET。** API/preview/原受限worker三个服务active，公网前端六份新资产与Linux构建摘要一致。

**自动捕获worker仍关闭，并非完整自动封面链路已上线。** 这是保留用户此前“不直接启动新捕获”的约束，也避免把本机直接Node配置错误套到VPS既有IPC角色。生产旧Node入口是`/opt/codeless/ops/worker-client.py`，其固定白名单尚不支持capture；托管私有回执为worker所有0600。没有放宽这些权限、让API取得Docker、改写旧队列或启动新捕获。完整捕获执行仍需单独接通受限IPC/角色；已部署读取服务与未启用捕获分别登记。

整体继续HOLD：原九需求6/9、当前候选生成REAL NOT_EVALUATED、TASK-01原cover FAILED/两次/无图/根因UNKNOWN、自然FAILED未观察不变。本轮不把实际部署或公开页面访问记为模型生成成功。A原机61997/61998、原DB及六项成果均未操作。

## B直接公网证据

- B系统默认DNS及向1.1.1.1发起的普通DNS查询仍被本机fake-IP层截获，返回198.18.*。本轮没有改系统DNS、hosts、代理设置或TLS策略；不能宣称系统fake-IP已修好。
- B直接连接Cloudflare `1.1.1.1`（SNI cloudflare-dns.com）和Google `8.8.8.8`（SNI dns.google）执行HTTPS DNS，正常系统CA/主机名证书验证。两个独立服务对三个真实发布域名返回一致公网地址23.136.172.128；AAAA也独立核对。不是SSH/getent转述，不用旧缓存或手写IP冒充解析。
- 仅在两个真实答复一致且全部通过publicAddress后固定该地址，向原域名发起正常SNI/TLS的HTTPS请求。保持3秒资产限制、200状态、不可变清单字节数/SHA、禁止重定向/未知资源、浏览器非转发代理和内网隔离。Chromium只接收此时实际下载且已校验的字节，不使用本地fixture替代公网。
- 原SHOW-01/EDIT-05、SHOW-02/EDIT-04、TASK-01/EDIT-06的**新B观察为3/3行为与刷新通过，原生退出0**。TASK-01精确入口/tasks。初次/刷新共18份HTML/JS/CSS响应逐项核对原不可变回执，TLS授权全部true、远端IP全部23.136.172.128。见 `public-direct.json`、六张行为/刷新PNG。
- 这证明同一原版本此刻可从B直接读取；A原公网2/3及先前SHOW-02超时不被覆盖。更不代表TASK-01原封面job成功。B第三轮索引PUBLIC-PAGE登记新观察并嵌入previousObservation保留原失败；六需求/六编辑分母和原样本不动，overallQuality仍HOLD。

公网取证器首轮曾把并发资源摘要归到“最后一个响应”；独立清单复查检出后，首轮报告留在B本地，排除为最终摘要证明。最终取证按各自HTTPS响应收集摘要，重新获取并逐项核验18份资产。见 `summary.json/retainedFailures`；不是修补公网内容、放宽断言或重跑模型。

## VPS实际部署及保护

| 步骤 | 结果与原生退出码 | 证据 |
| --- | --- | --- |
| Git冻结 | 固定54f347f，Git blob清单3831文件；显式LF归档SHA256=943fb8b02bf7a460d881eeb552e422d98d1254baabc30ede693cbfcefb9fe075 | `package-result.json`；完整清单留VPS release/source-manifest.json |
| Linux暂存 | 非root codeless-worker、1.5GiB/512 tasks；pnpm12.6.0冻结安装、Java21.0.13/Node24.22.1构建 | `linux-stage.json`，各原命令exit0 |
| 受影响检查 | Java入口/Store/网关11/11、Node/契约15/15、UI15/15、vue-tsc/Vite构建通过；未重跑全部419/278/75，不冒称全量门禁 | `linux-stage.log`、`linux-stage.json` |
| 部署前停机条件 | 原VPS无QUEUED/RUNNING任务、无REQUESTED发布；停服务后再次确认数据库指纹未漂移 | `deployment.json/dbBefore`，activeTasks=0、pendingPublications=0 |
| 备份与切换 | VPS保留原JAR、源码/依赖、UI、环境、部署marker及pg_dump自定义格式备份；未恢复/导入任何旧DB。安装源文件3831逐字节复核，API/UI实际换新 | `deployment.json`，phase PASSED、脚本native0；备份仅留服务器 |
| 新JAR | 18e8d0c3e12c4a608f05c87ba9ddbe578b5779f04e57ce3fa03e1a6236311b5f；运行服务指向/srv/codeless/api.jar，冷启动/正常HTTPS登录成功 | `deployment.json/record/jarSha256`；服务器再次sha256sum一致 |
| 只读cover | 显式enabled=true、workerEnabled=false；原owner通过真实HTTPS正常登录，两个既有发布的元数据/图片GET进入新CoverController并返回404/NOT_FOUND（尚无cover job）；匿名均401、no-store；不冒称已读到图片 | `deployment.json/coverHttpProbes`，coverQueueJobs=0 |
| 原数据保护 | VPS自身模型账本29→29；完整模型行、latestReady指针、版本行和发布行前后摘要一致；原版本目录及全部托管文件字节一致。A原机26行账本是另一实例，不合并计数 | `deployment.json/dbBefore/dbAfter`、originalVersionsPreserved/originalPublicFilesPreserved=true |
| 外部平台复查 | B经双HTTPS DNS+真实TLS读新平台HTML/CSS/JS等六文件，全部长度/SHA匹配新部署marker；CSRF200、两个匿名cover GET401。响应token/cookie不保存 | `platform-public.json`，原生0，六资产＋三API检查 |
| 回执字节 | 本机下载的stage log/status和rollout JSON均与服务器sha256sum一致 | `server-receipt-sha256.txt` |

旧Windows归档被Linux源文件摘要核验拒绝（native1）；线上未变，原失败归档/暂存目录保留。后续Linux构建又因历史OpenJDK JAVA_HOME目录已移除而退出1；保留原日志后改用服务器现有BellSoft Java21真实路径，从失败阶段继续，未重跑已通过的依赖安装。最终全部阶段0。没有重复直到变绿来抹掉旧失败，见 `summary.json/retainedFailures`。

服务器当前部署指纹：`/srv/codeless/deployed-release.json`。root受保护回滚包：`/srv/codeless/deployment-patches/cover-54f347f-20261031/`；该目录含数据库/环境，**不上传Git或转交B本机**。本公开目录只有无秘密回执及备份摘要，无SQL、cookie、口令、模型/SSH密钥或私密连接文件。

回滚由保留的旧源码/JAR/UI/env恢复代码和配置，不自动恢复数据库以免覆盖后续合法写入；具体操作前先确认任务为空、停止服务、核对源/目标路径及备份指纹，保留被撤下的新运行包。当前部署成功，未触发回滚。不要将旧package恢复动作施加到A原机的六项新成果。

## 命令、复现与后续边界

`operator-source-snapshots/`为本轮实际执行脚本字节快照，其SHA及原路径见 `summary.json/sources`。Python部署脚本会修改VPS，**不是要求再次运行的验收命令**；已经完成的备份/release目录存在即拒绝覆盖。JS取证脚本按原B仓库`.local-data/d25-vps-rollout/`位置解析相对依赖，不能直接在本公开快照目录原样运行。全部源固定Git54f347f；旧fb79生成物版本通过A不可变回执另外绑定，没有移植成绩。

只读复核可在B主机执行原取证器（使用新输出目录，保留旧报告），或在VPS运行：

```text
systemctl is-active codeless-api codeless-preview codeless-worker
sha256sum /srv/codeless/api.jar
sudo cat /srv/codeless/deployed-release.json
# 上面是无秘密marker；禁止输出/etc/codeless/api.env或数据库dump。
```

本轮完成的是“B独立公网验证”和“VPS代码/UI及只读GET上线”。**自动捕获生产执行器未接入、未启用**：后续应在独立实现中显式扩展既有受限IPC或提供隔离cover执行器，维持peer UID白名单、独立队列所有权、45秒含清理、12秒/两次/3秒资产上限、未知状态隔离、FAILED不重跑和0600回执权限。不能直接把CODELESS_NODE_EXECUTABLE换成真实Node破坏既有发布/生成IPC，也不能放宽托管回执给API读取。任何新捕获/付费复评/进一步启用均不由本次读取部署推定授权。

因此“VPS完全未部署”现已不适用，但“自动cover生产链路已全通”仍不能成立；TASK-01原失败、原6/9和自然FAILED观察缺口继续HOLD。未批准或合并PR，main未改。
