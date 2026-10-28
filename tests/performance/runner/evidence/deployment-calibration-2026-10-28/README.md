# A+B 候选：部署机容量校准

用户明确允许上传候选源码并在指定部署机校准，也明确允许提交本目录的匿名报告。**最终批准及是否合并由用户决定**；A可继续只读核验，不代替用户批准。没有自动批准、合并或切换线上部署。

`anonymous-report.json`是匿名派生报告，保留数值样本、真实压力屏障观察和来源提交/摘要，不冒称逐字原始报告。去掉了主机地址、主机名、SSH用户和部署目录。原始归档62份文件的SHA256已逐一核对，完整归档仅本地私有保存；归档摘要和关键原报告摘要供后续核验。`manifest.json`绑定公开报告的实际UTF-8/LF字节，目录Git属性保留字节。

| 已执行阶段 | 原生结果 | 核验范围 |
| --- | --- | --- |
| A容量专项 | 0；10/10，无失败/错误/跳过 | 默认32排队、16用户活动、8应用活动；第33个明确拒绝；并发入队、容量锁、每进程2个模型槽位、取消/失败释放；真实PG/HTTP/SSE，慢模型为明确Mock |
| B构建/资源 | 0；4/4 | A→A→B→A四次真实构建、浏览器/截图、缓存/版本绑定、资源限制、超时/OOM/日志洪泛、进程和磁盘清理 |
| API资源干扰 | 0；80/80 HTTP200 | 各10个CPU屏障后、OOM确认后请求；压力前负向对照和每个故障清理后请求；独立审计通过 |
| A+B完整产品链路 | 0；browser0 | 两用户生成、编辑、发布、导出；4个真实成功构建、1个真实失败构建；2个PUBLISHED；失败后旧版本保留；清理无错误 |
| SQL/账本屏障 | 0；8/8 | 真实事务提交与afterCommit之间的UNKNOWN，释放后成功/失败各自收敛，失败码保留 |

机器为2个逻辑CPU、4,106,088,448字节RAM，无swap；具体CPU、Node、Linux、Docker和cgroup见报告。校准控制/API/浏览器进程组限定1 CPU、1.5GiB；Docker构建/故障容器另受原有独立限制，此处不把进程组预算当成全机总内存上限。

默认队列深度32时100次**repository/service查询**p95=0.719355ms；慢Mock未返回时30次真实HTTP查询p95=40.578166ms，10次SSE续接p95=74.380322ms。两种查询路径分开记录。四次固定模板构建约6.80–7.42秒；首容器仍使用已准备镜像，没有清宿主缓存。样本少，不据此宣称显著提速、最大用户数、持续RPS或SLA。

校准途中保留了失败：首包缺A录制器、JAVA_HOME不符，均未进入容量测试；随后瞬时CPU进程查询在Running之后过早执行，API隔离原生1且只有10个基线GET，不计T2通过。独立诊断确认Running可早于子进程，修正为在原5秒启动预算内观察实际忙循环，然后核对真实cpu.stat增长，才发GET。没有延长资源/业务截止或放宽压力断言；只继续受影响和尚未执行的阶段。首次诊断引用的镜像已清理，没有进入运行态，其结果也不作压力证据。

本轮使用deterministic-mock、真实模型请求0。完成的是实际部署硬件上的单API进程候选校准；**真实模型吞吐/质量、多实例总容量及线上切换后公网验收没有完成**。当前线上JAR与部署记录匹配、服务保持active，测试容器全部回收。Java仍未启用B可选trial；公共429/503契约同步仍单独待完成。

## 复现

在新的独立工作区组合报告所列B来源与A生产补丁，并从同一A提交取得`services/api/src/test/java/dev/codeless/api/performance/`及`tests/performance/api/record.mjs`。A的9c5cf47到最新f1c9be7生产源码diff为空。Linux源文件执行前保留明确的CRLF→LF转换和逐文件摘要，使用锁定Node/pnpm、真实Java21、独立PG和既有浏览器依赖；不能复用线上数据库或配置中的秘密。

```sh
node tests/performance/api/record.mjs acceptance
node tests/performance/runner/record-command.mjs measure
node tests/performance/runner/record-command.mjs api
node tests/e2e/full/record-command.mjs full
services/api/mvnw -f services/api/pom.xml -Dtest=PublicationIntegrationTest test
node --test tests/performance/runner/api-evidence.test.mjs tests/performance/runner/evidence.test.mjs tests/infra/deployment-terminal.test.mjs
```

组合报告始终canonical=false；临时Git快照只用于工具记录，不能冒充A+B已合并提交。`sources`给出A/B生产来源、最新复审提交、发布验收修正提交和CPU测量覆盖摘要；新提交的精确CI另查，不继承旧HEAD状态。

CI历史另外保留在`ci-history.json`：32267bf的75项浏览器冒烟有74通过、1未运行，触及原120秒suite/teardown截止，job失败。该运行未进入后接的完整产品命令，不能用部署机独立通过去改写它。未重跑该旧job、修改CI/前端、增加预算或放宽断言；本目录证据提交产生的新HEAD检查单独读取。
