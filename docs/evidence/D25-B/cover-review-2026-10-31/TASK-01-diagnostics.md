# TASK-01最小只读诊断方案（未执行新捕获）

固定候选45650b16981b04b6d65742befea8793b21f7a229、发布5f5f5fdc-f6b7-89ec-a3a4-b69aaf993045、版本c7abe20b-f45d-4aef-baaf-071f09cbc34a、入口/tasks。原记录FAILED/CAPTURE_FAILED、attempts=2、图片null；原分母3、成功2不变。A正常登录采集，B只收去秘密证据。以下是给A的方案，本轮B未运行它。

1. **冻结现有失败。** 先只读复制原job.json、已有网关/协调器日志、两次attempt时间窗、cursor/inflight/quarantine的存在状态和摘要；读取现有owner元数据，记录请求ID、版本、entryPath及HTTP状态。若有原worker stdout/退出码/清理证明一并归档。不要删除锁、移动原队列、覆盖job或触发refresh之外的后台任务。没有采集的历史错误写NOT_RECORDED，不能补造。
2. **定位现有阶段证据。** 以已有journal和不可变发布回执核对source/artifact/report摘要、冻结动作中的/tasks及Java绑定。A已做两次target解析成功，无需为了增加成功数重复解析。该阶段校验本地回执和DNS，不证明HTTPS、browser或截图成功。
3. **必要时只做一次无浏览器资产探测。** 在新诊断输出目录中，按同发布回执逐项GET `/tasks`及其确切JS/CSS等允许资产；保持真实DNS、公网IP固定、TLS校验、每请求3秒和原摘要检查，记录开始/结束/阶段、原生退出码、HTTP码、TLS授权、远端IP、字节数/摘要及固定错误码。不向请求加入会话/模型/DB环境，不用旧缓存代替下载，不重试到绿。探测不调用capturePage/captureDeployment/runCoverGateway、不新建任何队列job，也不计原cover成功。
4. **根据证据停止推断。** 若复现TLS、超时、摘要或资源错误，优先将相同字节与错误响应做隔离确定性反例，另提最小修复。若所有只读探测通过，根因仍UNKNOWN；不能据此宣布原捕获已修复。当前 `worker.mjs` 将多个阶段压缩为CAPTURE_FAILED，`capture.mjs`不保留stderr；若原日志没有细节，历史原因为不可恢复的证据缺口。
5. **确需worker阶段诊断时另定范围。** 可以另提仅在隔离夹具里添加有限的phase、资源路径、耗时、固定错误类别、browserClosed/cleanup证明的方案；不记录HTML正文、cookie、凭据、SQL或完整环境。新代码应沿用原网络/3秒/12秒/2次/45秒上限，通过故障反例后再明确是否授权一次独立诊断捕获。本轮不启动此捕获，不将原FAILED重新排队，不用新队列结果覆盖旧2/3；更不包含付费复评或VPS部署授权。

交付最小包：候选/发布/版本/入口指纹、旧job前后摘要、已有两次attempt日志与退出/清理状态、单次只读资产表、诊断命令及原生退出码、没有新模型请求/新截图尝试/队列写入的核对。A保留原数据库与不可变目录，B不需要跨机SQL、密文、密钥或会话。
