# D22 A+B 真实自动全链路与 runner 干扰联合验收

2026-10-28：真实批次仅执行一次，native exit 0 / signal null，独立报告审计通过。没有切换线上、批准或合并；最终决定由用户作出。

不可变来源：A `8a71eace5cb6d260981971d3c15b0b64ac0f8485`，B `34bf0d89bdcd2292cad29b67e20c9ecce176cd86`；合并树 `dffba6e76fee038941098875c548977208c23abb`，候选提交 `dd84150dc551ba21d409067688e7e219bd84a67e`。实际部署源码快照 `95b9c6ca16740695fbe6006bb99fc7e422057e1f`，1,106 个源码/运行时模板逐字节绑定。公开 evidence/docs/工作流元数据没有参与候选上传，导出所必需的 README 模板明确包含。候选 canonical 只表示该冻结部署快照保持不变，不代表当前 PR HEAD 已经合并或上线。

单 API 进程、生产自动任务 worker、生产 bounded deepseek provider（deepseek-flash，模型槽位2），没有手动 claim、改写模型回复、额外 worker 或模型自动重试。候选进程组1CPU/1.5GiB/swap0，独立 PostgreSQL0.5CPU/384MiB；runner原有限额和任务截止不变。

两用户自动 PLAN→GENERATE→VERIFY→READY，2次真实构建和浏览器验证通过；本批没有自然触发 REPAIR，记录 NOT_ENCOUNTERED，不声称完成真实模型修复分支验收。70/70 HTTP200，p50=3.771762ms、p95=17.773903ms、max=46.02646ms；其中20条查询分别在实际CPU增长屏障、Docker OOMKilled+cgroup oom_kill屏障之后，并完整落于实际provider调用包络内，且早于压力释放。压力前负向对照、清理后查询均单列；Java/Node单调钟通过10次包络校准。OOM结论仍限于确认后可响应，不扩大为分配器峰值覆盖。

SSE实际断开及非零游标续接；真实调用未结束时取消，返回后任务仍FAILED/CANCELLED；两次owner HTTP触发的隔离发布都在原30秒内达到SQL PUBLISHED及账本SUCCEEDED，并经Chromium读取真实内容。普通编辑在VERIFY边界明确注入一次宿主RUNNER_UNAVAILABLE，旧VERIFIED版本、成功发布、浏览器内容和源码下载仍可用。该负向用例是可信宿主基础设施故障，不冒充模型生成的编译错误。发布使用已有命名本地HTTPS探测夹具，属于HTTP驱动验收，不声称完整前端交互或线上公网验收。

本轮用户另行授权deepseek-flash及总上限¥2，并明确授权经SSH stdin向指定候选传递现有凭据。真实调用9次；全部已知input19838/output1224 tokens，按核验当日官网高峰缓存未命中2元/百万输入、8元/百万输出估算上界¥0.049468。持久化且不退款的保守预留¥0.45303，覆盖失败/取消/超时；实际扣费与不可变权重revision仍未知。临时凭据文件数0，生成代码容器不接收模型密钥。

证据：`tests/performance/joint/evidence/2026-10-28/` 的匿名REAL/MOCK逐项记录及manifest；全部724份私有原始文件SHA256独立匹配，私有归档SHA256 `508500073b01604f1fb36b80238c52ed92a565100515a118eded8f998ce506f4`，扫描未发现本轮密钥。完整原始材料保存在受保护位置，不公开主机、身份、部署路径、命令日志、prompt或模型文本。

免费失败全部保留：一次性Nginx配置/测试证书权限；root宿主被runner保护拒绝；测量器误用未实现builds端点；候选打包遗漏导出README。分别修正测试配置、临时单元身份、真实snapshot端点和源码打包；未弱化断言，未付费重跑。最终免费彩排native0和真实批次使用同一快照。所有临时容器/目录已清理，旁路采样native0，线上包摘要及三项服务active前后一致。

复核：`node --test tests/performance/joint/audit.test.mjs`。真实运行入口与边界见 `tests/performance/joint/README.md`；新批次必须另有费用授权，禁止借本报告自动重跑付费请求。新PR HEAD的CI需单独查询，不能沿用旧提交success。长期负载、多实例、线上公网及未触发的REPAIR分支仍不在本批结论内。
