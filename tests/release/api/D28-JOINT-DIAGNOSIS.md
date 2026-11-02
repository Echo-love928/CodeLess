# D28-A/B 联合定位与后继候选交接（2026-11-03）

当前结论 **HOLD**。B电脑已关闭，用户要求先完成其余部分；B原始API中断、D19清理超时和7db重下载失败材料尚不能补传。没有用新绿测关闭旧失败，没有启动付费模型、Docker工作负载或生产切换。

## 已完成及可直接取得的A原件

受控主机仍为既有VPS，B使用自己的既有授权SSH身份。

```sh
scp root@23.136.172.128:/srv/codeless-handoff/d28/20261103-a-diagnosis/a-original-failures.tar .
```

原件包 **2416640字节**，SHA256 **56a0f6bbe1ee4135c066dea0699848993eaf0f50c32aee5513a6ca6ab693f571**。目录0700、包0440；没有公开HTTP入口。A本机与服务器均逐成员复算55项成功。`MANIFEST.json`将每项平铺成员名映射到原来源、组别、长度和SHA；B不需要A的F盘。原始日志/JUnit可能含私有测试上下文，只留受控目录，不上传GitHub。

包包括46份原EPERM JUnit/场景/journal、原CLEANUP_FAILED CI API日志、原ENOTEMPTY完整gate日志及命令回执、留存D22报告、原EPERM完整gate日志和来源摘要。D22报告本次才计算独立SHA，明确标记 `digestAnchoredInPriorReceipt=false`；不伪造成原先已封存摘要。Windows成功运行的ETW摘要独立分组，不能充当原失败的ETW。

## 已知事实和仍缺的同次证据

| 事件 | 已知原件/事实 | 未知及下一步 |
| --- | --- | --- |
| A EPERM / 2be | 完整API原生1、427/428；第二次build0后跨卷复制的`.build-*`目录提升rename失败，原46文件及gate日志匹配既有SHA | 原runner只保存message，不保存stack；同次OS句柄/拒绝栈未记录，不能事后恢复。成功428运行的底层拒绝后rename成功不证明历史占用者 |
| A ENOTEMPTY / 268 | runner原生1、284/285；队列终态腾位的rm最终向外抛ENOTEMPTY；原gate完整日志、D22报告可取得 | 原临时根已移除，报告queue=null且最终ownedRootRemoved=true。没有原同次写入者/句柄轨迹，不将底层rmdir正常遍历或受控迟写模型当成此故障复现 |
| CI CLEANUP_FAILED / 94ab | 原676107字节API日志SHA匹配；428项1失败、原生1 | 原断言先于报告落盘，同次runner/JUnit/清理具体来源缺失；现GET artifacts=0不能证明历史上从未存在 |
| B API中断 | 公开交接保留原native=null及已完成JUnit；A未取得同次私有原件 | B开机后提供原启动/终止回执、日志/JUnit、进程创建时间及管道/退出/close事件，不能把两批报告拼成完整成功 |
| B预览502 / c7 | 公开证据捕获366组API生命周期均完成，最长72ms；失败Nginx记录CONNECT超时及504,502，无连接/响应头计时 | 仅缩小到入口/宿主转发调查。需同次完整request ID、上游地址、监听端口及PID创建时间/连接状态，不能由没有API日志推断API从未收到 |
| B D19清理超时 | 公开交接保留CLEANUP_TIMEOUT、browserClosed=false、processTreeTerminated=false | B同次worker/父子进程创建时间、kill/exit/close顺序、浏览器/管道句柄及deadline原件待传，单独11项通过不关闭历史 |
| B 7db失败后重下载 | 原双用户链路原生1，原10秒download事件期限失败，初次ZIP/trace/API日志B已私存 | 需同次浏览器trace、该次export请求起止/状态/响应头/字节、鉴权与版本绑定、API/代理对应request ID。仅超时不能判定服务端还是客户端根因 |

B恢复后请将上述原件放入同一受控交接父目录的独立新目录，附原来源、精确源码、命令/原生退出（未知保留null）、时区和原SHA。先复核字节及同次关系，再决定一次定向复现的范围；当前不重复全套筛绿、不延长deadline、不绕过TLS或放宽隔离。PID必须配创建时间，跨进程用UTC及偏差，单进程用单调时间；不能只按PID或邻近时间归因。

## 下一次定向捕获已准备

`d28_fs_observer.mjs`仅用于可信宿主的手动Node诊断，记录promise文件操作的调用栈、原错误栈、开始/结束、单调时间、PID/PPID及本进程经观察器打开/关闭的句柄。不读取文件内容，不增加重试；保留同一Error和参数。每进程4MiB，截断/写入错误明确记录。观察会扰动时序，不能证明未观察进程/内核/Java/Docker无句柄。

在工具所在仓库的 `tests/release/api/.private/<本轮新目录>/` 创建配置，`roots`为本轮实际绝对路径，`output`为已有私有新日志目录。拒绝链接和宽泛宿主根；允许任务私有根、`.local-data`子根、明确的`Temp/codeless-*`直属目录。示例结构：

```json
{"roots":["<本轮实际artifact或queue绝对根>"],"output":"<工具仓库>/tests/release/api/.private/<新目录>/fs"}
```

仅在该次可信宿主命令配置 `CODELESS_D28_FS_OBSERVER=<配置绝对路径>`，用 `node --import <d28_fs_observer.mjs的file URL> <原固定诊断入口及原参数>`，结束后恢复该进程环境。不要改全局NODE_OPTIONS或产品环境白名单。**LocalBuildGateway会清空NODE_OPTIONS及自定义环境，本观察器不自动覆盖Maven启动的API子进程**；真实API同次OS句柄及拒绝栈仍需原本卡已授权的独立128MiB管理员ETW窗口。不要为接入观察器削弱该边界。B是指定runner，窗口和工作负载需协调后执行；本轮未启动新UAC/追踪/重跑。

本机实际控制：观察器3/3、原件保护2/2、财务10/10均原生0、无skip。VPS原件保护2/2、财务10/10原生0。B修复7db的工作台原14项在A隔离工作树原生0、源码/HEAD保持一致；只验证取消补读及旧回调隔离，不替代完整E2E/下载验收。

## 最终候选与预算：已实现工具，尚未执行绑定

现用唯一账本仍 `/srv/codeless-handoff/d28/20261102-cny2/budget-ledger.sqlite3`，ledgerId `e5762985-8989-410e-9d15-b58a83d7451e`。本轮只读核验 **revision2**、B已核实历史支出0、entries=[]、active=null、可花2元、事件链通过；A继续冻结付费执行。它仍绑定00fd/原52e包，不能用于把7db或未来候选冒充已准入。

新版本预算工具只放在 `/srv/codeless-handoff/d28/20261103-a-diagnosis/next-tools/`，没有替换现用控制器。它用同一canonical目录执行 `status` 成功且SQLite字节未变。新增 `rebind-candidate --evidence <受控对账文件>` 具有以下约束：

- 必须没有活跃进程预约；ledgerId、expectedRevision、expectedEventHead、fromCandidate、fromArtifactSha256全部精确匹配，否则整笔回滚。
- selection、archive、groupVerification、checks均为canonical目录内受控文件引用 `{path,sha256}`；拒绝越界/链接/摘要不符。
- selection使用原注册表结构，sourceCommit为新SHA、镜像sourceRevision相同、共享源码无差异。实际tar必须与archive摘要相同，独立groupVerification为原生0、无missing/mismatches、成员数匹配。
- 实际tar中的selection、API/client清单、JAR、worker及镜像归档逐项匹配新selection摘要；旧tar换新标签会拒绝。checks文件为精确新SHA的六项completed/success列表，禁止skip/neutral或重复名。
- 追加事件和bindingHistory，保留原ledgerId、2元授权、旧entries、UNKNOWN预留、已拒绝样本及所有事件；不重置额度、不允许同样本重试。新预约记录自己的candidate/artifact，旧候选终态证明不能结算新预约。该操作不批准部署。

对账文件结构（只有真实最终包及检查到位后才能填写）：

```json
{"ledgerId":"<实时ID>","expectedRevision":2,"expectedEventHead":"<实时事件头>",
 "fromCandidate":"<实时旧候选>","fromArtifactSha256":"<实时旧包SHA>",
 "selection":{"path":"<新清单相对路径>","sha256":"<实际SHA>"},
 "archive":{"path":"<新tar相对路径>","sha256":"<实际SHA>"},
 "groupVerification":{"path":"<同包校验回执>","sha256":"<实际SHA>"},
 "checks":{"path":"<精确SHA六项检查列表>","sha256":"<实际SHA>"}}
```

上面revision2为本次只读快照，实际执行前必须重新读取实时revision和事件头。先双方冻结最终源码并复审/成组封存API、client、worker、镜像，B独立核验新字节；再保留现用v1工具原字节与SHA，将已审新工具切入同一canonical目录、按实时CAS追加绑定。没有最终包时不改常量/数据库、不新建账本或重置对账历史。付费执行还须B对新候选原网络/运行时准入，累计2元不足停止。

历史根因、Windows完整门禁/重下载等阻塞关闭后才协调部署维护者成组切换、保留回退。A随后用 `d28_live_identity.py --candidate <最终注册表> --api-manifest-path <实际安装清单> --client-manifest-path <实际安装清单>` 独立读取真实JAR fd、worker进程、源码/文件及镜像身份。旧61部署与旧00fd封存均保留，不能改标签替代。**当前最终候选未确定，未重封新包、未绑定新候选、未部署。**

对应证据：`evidence/d28-diagnosis/`。开发input/output/total和实测计量来源UNKNOWN；本轮平台付费请求0、支出0，财务/文件fixture没有模型调用。无自批、合并或main修改。
