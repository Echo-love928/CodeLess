# PR #21 独立自动复审与增量修复

基线 f80ee105；固定候选 f83895c5；其后本次增量源码的归一化 SHA-256 见 commands.json。三个独立子代理分别审查安全/公共契约、测试/生命周期与攻击路径；固定候选使用 git show 读取，不受主代理工作树编辑影响。发现问题后的增量只复查受影响源码与调用路径。本报告是自动独立审查，不冒充另一 GitHub 账号的正式批准。

## 阻塞问题

- 固定候选发现 P2 nginx 日志泄漏，已修复并复核：infra/preview/nginx.conf.template 的 preview server 原先只有 access_log off，上游拒连时默认 error_log 含完整 request/upstream URI，从而记录120秒 bearer。现 preview server 设置 error_log /dev/null。真实平台测试停止网关，实际 nginx TLS 请求唯一合成 marker，返回502，读取 docker compose logs 断言不含 marker，再重启同端口继续原链。ingress-log-rejection.json 为实测结果；未使用真实凭据做故障探针。
- 新增付费入口的两处 P2 已修复并独立复核：目标内容使用 innerText 验证可见文本；prepare-runtime 与 browser/runner 测试子进程均移除模型 key/name。生产 LocalBuildGateway 的环境白名单本就不含模型密钥。
- 完整真实模型仍无成功证据。旧 TS2322 和 MODEL_NETWORK 未覆盖；本次等待用户确认 deepseek-flash 凭据安全配置，没有新计费请求。无凭据Java21 HTTPS GET收到401，只证明当前连接可达。
- PR #21 正式同伴批准待另一 GitHub 账号完成，禁止作者自批。保持Draft，无合并或发布。

## 建议

- LocalBuildGateway.java finally 才枚举后代；现有四项测试覆盖父进程仍活时的中断/超时。可再覆盖父进程提前退出而后代保留管道。未证明生产可触发，不冒充已复现阻塞。
- TaskQueueIntegrationTest 已有双消费者与租约等待锁测试，可进一步强制 stale SELECT snapshot 的精确交错；现有并发断言未弱化。
- catalogue1000条为已明示上限；第1001个合格版本导致全局503并清空mapping，README已明确，应通过宿主归档/失效策略控制容量。没有改动安全上限或fail-closed行为。
- 外部强杀后的Docker孤儿回收、公网DNS/TLS和正式部署仍由宿主部署策略负责。

## 已核验内容

- A502edfb 的Agent实现/提示词/测试/fixture与f83895c逐字相同；中断清理先终止父子进程后取消读取，保留中断标志。
- SQL catalogue只接受ACTIVE/VERIFIED/确切READY FINISHED task+成功exit0 build；ownership、session/CSRF、app/version/build/source/artifact和120秒nonce绑定真实签发。
- 私有journal/source/receipt/artifact/browser report/PNG一致后打开live D08 handle；不提供HTTP注册；移除、失联、陈旧、撤销、容量和重启边界保持。
- 网关路径歧义拒绝，逐资源验证expiry、exact version Host、mapping与活句柄；平台Cookie/Authorization不进入artifact服务；nginx拒绝公开internal。
- 模型只是提案；实际工具、原lease、字节证据、runner结果复核后原子提交READY。伪报工具成功/错误hash、真实构建失败、确切version/build完成事件测试保留。
- 新 RealPreviewPlatformAcceptanceIT 为显式 paid 入口，默认Surefire不发现 *IT；默认平台测试固定deterministic-mock。成功需真实Bean+SQL provider/name、所有成功非空usage、真实READY及UI目标内容、Docker/browser/签发/nginx/隔离/重启/撤销全部通过。范围只是一条静态Ada展示页需求，不能概括整体模型质量。
- 本轮完整 ci-gate 退出0；受影响mock整链含真实nginx日志失败路径通过，报告modelQualityAccepted=false，platformApiFixture/signingFixture=false。截图实际查看并按字节数/摘要核验后导出。

## 原日志泄漏的可复现探针

镜像 nginx:1.27.5-alpine。一次性容器无工作树挂载、无网络、只读root，使用合成marker；退出后自动删除。前两次探针启动方式失败不作为证据，以下方式实际命中。

```sh
docker run --rm --read-only --network none \
  --tmpfs /tmp:rw,mode=1777 --cap-drop ALL \
  --security-opt no-new-privileges --user 101:101 \
  --entrypoint sh nginx:1.27.5-alpine -c '
printf "%s" "pid /tmp/nginx.pid; events {} http {
client_body_temp_path /tmp/body; proxy_temp_path /tmp/proxy;
fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi;
scgi_temp_path /tmp/scgi; access_log off;
server { listen 8080; location / {
proxy_pass http://127.0.0.1:9;
} } }" >/tmp/probe.conf
nginx -p /tmp/ -c /tmp/probe.conf &&
wget -O /dev/null "http://127.0.0.1:8080/__preview/start?credential=CODELESS_SYNTHETIC_LOG_PROBE"
kill "$(cat /tmp/nginx.pid)"
'
```

错误日志包含 request: GET /__preview/start?credential=CODELESS_SYNTHETIC_LOG_PROBE 及相同upstream URI。修复后的实际deployment测试在相同故障条件下确认marker未入日志。
