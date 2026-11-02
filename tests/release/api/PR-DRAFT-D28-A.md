D28-A｜封存统一候选00fd并补齐迁移/真实历史恢复（HOLD）

B已将A a16ac25与B80205692合为00fd43333f35c5cb0cce425721fdce9cd1d0f956。本轮从该提交独立封存API、client及带00fd revision标签的镜像，明确源码/JAR/worker/镜像清单，替代分别引用不同候选的验收安排；当前未部署新候选。00fd精确六项CI全部success：[run41424603409](https://github.com/Echo-love928/CodeLess/actions/runs/41424603409)。后续交接HEAD自身检查另看PR，不继承旧SHA。

- 同源完整性：258个API源文件逐字节核对Git blob、JAR五迁移一致；API/client113共享文件相同。统一包275成员逐项复算，SHA52e49be4...；原包现已传入受保护VPS SSH目录，路径与取回方式见下方当前交付。
- 新00fd JAR：真实空库/合成V4迁移与独立restore40项退出0；原D23真实生成备份按原manifest/dump摘要只读恢复，在新PG核验原版本/源码/导出22项退出0，原备份不变、cleanupErrors=[]。保留原模型mock及生产预览未验边界。
- 新明确镜像ID配封存源码：真实Docker/Vue/Chromium正常和歧义目标两路径按预期通过，build0、浏览器失败分支worker1/ACTION_FAILED，清理成功，断言前回执保留；不冒称旧CLEANUP_FAILED复现或关闭。
- A范围内工具增加显式候选/新输出与只读新部署比较；原默认、断言、预算、隔离不变。原8项控制及路径/覆盖负对照通过，旧报告不覆盖。仅新增两份自有注册表按原字节保存。
- 原47份失败材料摘要全部匹配，私有取证包未上传；旧EPERM无拒绝栈，旧CI失败缺同次runner/JUnit/句柄，rootCause仍null。一次128MiB带栈追踪启动遭Windows UAC取消，两个定向API用例未执行、Maven exit=null；未重新触发UAC。没有猜测性产品修复或加重试。
- SSH只读比较现部署与00fd退出1：部署记录、清单、镜像仍61；相同JAR/worker/源码不能替代新候选部署证明。真实模型已有凭据，本轮已获用户最多2元授权、CNY足额核验通过，但原TLS前置11/12有预期证书、末次无证书链，命令1；付费批次未启动、模型请求/支出0，不放宽门禁或重跑求绿。旧fb79财务sidecar授权不沿用；生产cover未执行。

范围：本轮仅docs/acceptance/backend.md、docs/handoffs/D28-A.md、tests/release/api/**；此前D08调度修复为唯一apps/web/playwright.config.ts范围扩展。无产品运行代码、公共契约、锁、CI或迁移修改；未修改B文件或main，未批准/合并。新候选完整证据与剩余阻塞见evidence/d28-followup/summary.json及两份文档顶部。开发token未知；本轮付费模型请求0，合成累计用量未知、分账。


当前原包/预算交付：

- 主机23.136.172.128，B使用既有授权SSH身份；目录 `/srv/codeless-handoff/d28/20261102-cny2`，root0700，未开公共下载端口。
- 原包 `unified-00fd-kit.tar`，167813120字节，完整SHA `52e49be4fca54ca6b09ca77846bfd5453ef68c84026ccd484e6017ecf216c206`；服务器原字节核验0，未重打包。
- `ACCESS.json`/`README.md`给出B端实际解包路径和校验命令，不需要A的F盘路径。
- 同目录 `budget-ledger.sqlite3` 为唯一权威预算，`budget-ledger.json`是快照。查询：`ssh root@23.136.172.128 python3 /srv/codeless-handoff/d28/20261102-cny2/d28_shared_budget.py status`。
- 累计上限2元、已知A支出0，A已冻结付费启动、交由B执行；B旧用量UNKNOWN，先用自己的机器证据claim-b，再逐任务预约。不是A/B各2元，也不把未知填0。Windows/VPS金融控制fixture各6项通过，无模型调用。
- 上传中断和后续成功校验分别保留，原包和机密凭据没有上传GitHub；详见D28-B-CONTROLLED-HANDOFF.md与evidence/d28-transfer/。发布验收HOLD不变。

- A额外下载回读600秒超时，59146240字节前缀验证一致；没有将其记为完整回读。原包服务端完整SHA已核验，B可SFTP reget继续下载并核验完整SHA，见远端DOWNLOAD-NOTE.md。
