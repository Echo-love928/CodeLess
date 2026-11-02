# D28 受控交付：原包与唯一共享预算

主机：23.136.172.128；使用B在D27已获授权的SSH身份。
受保护目录：/srv/codeless-handoff/d28/20261102-cny2
该目录仅SSH/SFTP可读写，不在平台web或生成容器挂载目录；没有开HTTP端口。

## 原包
unified-00fd-kit.tar，167813120字节。
SHA256：52e49be4fca54ca6b09ca77846bfd5453ef68c84026ccd484e6017ecf216c206
候选：00fd43333f35c5cb0cce425721fdce9cd1d0f956
必须下载后先核对SHA；本次是原包字节复制，没有重建或重新打包。

B在自己的主机执行（使用自己的既有SSH配置/密钥，不使用A的F盘路径）：

    scp root@23.136.172.128:/srv/codeless-handoff/d28/20261102-cny2/unified-00fd-kit.tar ./unified-00fd-kit.tar
    scp root@23.136.172.128:/srv/codeless-handoff/d28/20261102-cny2/d28_shared_budget.py ./d28_shared_budget.py

Windows校验：Get-FileHash -Algorithm SHA256 ./unified-00fd-kit.tar
Linux校验：sha256sum ./unified-00fd-kit.tar
如果B使用的不是D27已有root运维身份，不要传递A私钥或扩权；应先提供B已有受控SSH用户名，以便保持相同授权边界交付。

## 预算：唯一权威账本在VPS

budget-ledger.sqlite3 是权威数据库；budget-ledger.json只是带revision的只读快照。
每次付费前必须查询/预约，不得仅下载一份JSON后本地各算各的。
唯一执行方为B；A已冻结本轮后续付费启动。上限累计2元，不是A/B各2元。

    ssh root@23.136.172.128 python3 /srv/codeless-handoff/d28/20261102-cny2/d28_shared_budget.py status

初始记录A已确认支出0、无已启动模型请求。B先前用量没有由A猜成0，状态为UNKNOWN，接管前spendable=0；remainingAfterKnownExposure=2仅表示扣除已知占用后的上界。
B核对自己的本轮付费调用/活跃任务后，上传机器证据及对账回执，再claim-b。它不是再次向用户要预算批准。
若B已存在调用或无法确认，保持冻结并对账，不得填0、重建数据库或另开2元账本。

对账回执格式（仅在B实际核实字段时填写，不能照抄示例冒充取证）：

    {"candidate":"00fd43333f35c5cb0cce425721fdce9cd1d0f956",
     "artifactSha256":"52e49be4fca54ca6b09ca77846bfd5453ef68c84026ccd484e6017ecf216c206",
     "priorPaidRequests":0,"activePaidJobs":0,"priorSpentUpperCny":"0",
     "measurementSource":"B机器本轮付费启动记录/模型调用清单的实际命令与时间",
     "evidence":[{"path":"b-invocation-inventory.json","sha256":"实际文件的64位SHA256"}]}

把对账回执和引用的机器证据通过同一SFTP目录传入后：

    ssh root@23.136.172.128 python3 /srv/codeless-handoff/d28/20261102-cny2/d28_shared_budget.py claim-b --evidence /srv/codeless-handoff/d28/20261102-cny2/b-reconciliation.json

每个原冻结样本先预约，只有退出0且admitted=true并取得reservationId才能启动对应一次任务：

    ssh root@23.136.172.128 python3 /srv/codeless-handoff/d28/20261102-cny2/d28_shared_budget.py reserve --sample SHOW-01

每任务先保留0.4元上界（50000tokens全按峰值输出价），同时最多一个活跃任务。
超额返回3/admitted=false；错误或未知返回2；两种情况都不能启动。
已预约或已拒绝样本不重新启动，没有外层重试。平台3轮/12请求/20工具/50000tokens/12分钟限制不变。

结束后建议在B主机用已下载工具生成仅含财务字段的投影，不上传密钥、完整模型报文、账号余额或源码：

    python d28_shared_budget.py project-usage --record ./actual-record.json --output ./usage-projection.json

B的真实进程控制器另写native-receipt.json，字段如下：
 candidate、reservationId、sampleId；processEnded必须由真实退出证明为true；
 nativeExitCode保留真实值（失败也计费）；recordSha256为上传的usage-projection.json摘要。
没有原生终态证明时保持预约，不能把null补0或释放。

SFTP上传usage-projection.json和native-receipt.json后：

    ssh root@23.136.172.128 python3 /srv/codeless-handoff/d28/20261102-cny2/d28_shared_budget.py settle --reservation 实际ID --record /srv/codeless-handoff/d28/20261102-cny2/usage-projection.json --native /srv/codeless-handoff/d28/20261102-cny2/native-receipt.json

已知token按峰值输入2元/百万、输出8元/百万的保守上界结算，不冒称实际账单；失败调用同样计入。
未知/缺失用量保留完整0.4元，不填0。进程未确认结束时保持活跃且拒绝下一任务。
status校验SQLite中的追加事件哈希链；JSON快照缺失/更新失败时以status为准，不重试mutation。
预算程序没有模型调用、凭据读取、部署、重置或追加授权功能。

## 边界
本次交付只解决B取得原包和共同账本的阻塞，不关闭历史EPERM/CLEANUP_FAILED、TLS前置失败、新候选部署或生产cover。
原包核验可先执行；付费验证还必须通过同一候选的真实网络/运行时门禁并经共享账本预约。
初始用户2元授权及A未启动付费的证据为opening-admission.json。
