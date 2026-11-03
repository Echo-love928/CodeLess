# D28-A：B五批原件接收与联合分析（2026-11-03）

**原件交付缺口已关闭；故障根因仍未闭环，M5 HOLD。** A独立取回B的五批280文件，共28844335字节，逐文件SHA/长度全部匹配MANIFEST；清单SHA `2df8adc52ba5bc35b45c1962151a8a411b4c4cb31873fa85033162a5a9fe2385` 匹配原服务器回执。原件仍在既有受控VPS：

`/srv/codeless-handoff/d28/20261102-cny2/b-failure-originals-20261103T101011JST/`

A本机仅保存私有副本；认证trace、原始日志/JUnit不上传GitHub。首次SCP严格文件名校验拒绝已保留；没有关闭检查，改用固定目录SSH只读流并校验全部字节。A创建的传输压缩包不是B原压缩包，不混用它们的整体SHA。

## 阻塞问题与原件能够支持的结论

| 原批次 | A独立重算/核验 | 仍不能下的结论 |
| --- | --- | --- |
| 01 c707中断API | 73份JUnit、316 tests、22 failures、0 errors/skip；原native仍null | 没有原JVM退出/执行会话或同次进程采样，不能补成0或把后续补验拼成原完整成功 |
| 02 00fd全量门禁 | 90份JUnit、428 tests、2 failures、0 errors/skip；native1。D19原runner记录为CLEANUP_TIMEOUT，worker275696原生1、browserClosed=false、processTreeTerminated=false | 11:07:53.8499376Z采样确有创建于11:07:46.214017Z的worker；没有同次taskkill退出/拒绝栈/句柄。后来采不到进程不能把当时清理改为成功；10:21的API线程栈不能代替11:07的D19栈 |
| 03 c7预览CONNECT 502 | 2份JUnit、7 tests、1 failure；原代理投影及supervisor回执已取得 | nginx.conf不是access/error原日志。原始完整代理日志及被拒绝连接的宿主监听/转发证明未采集，不能从366组API生命周期完整推定故障请求从未到API或认定根因 |
| 04 7db失败后重下载 | 原native1、原Playwright JSON/认证trace齐全；未输出JUnit明确为NOT_EMITTED | trace未记录完整export响应；不能假设已成功返回、由服务端超时或已超过10秒服务端耗时 |
| 05 7db完整观测E2E | 独立原native1，child-events/Playwright原件已取得；与04不是同一批 | 此批的进程事件不能补04下载现场；新增观察器扰动下的结果不能替代未观察基线或02的D19原生终止证据 |

### 下载时间线：原10秒失败保留，不能当成10秒服务端耗时

同一用户上下文 `0-trace.trace`，同一已验证版本的原始事件：

| 事件 | trace单调毫秒 |
| --- | ---: |
| 开始等待download，call@2330 | 306841.892 |
| 找到“下载源码 · v4”按钮，call@2333 | 313912.682 |
| 执行点击 | 313945.752 |
| 原export GET发起（13:48:20.978Z） | 313953.021 |
| download原10000ms期限失败 | 316840.521 |

监听到找到按钮 **7070.790ms**，监听到发出export **7111.129ms**；请求发出后只观察 **2887.500ms**。HAR中原status=-1/time=-1投影为null，`exportCompleted=false`，不是HTTP成功或已确认服务器收到。原请求、版本和上下文不能用另一用户的200/404或错误版本409替代。

同次trace还记录reload后的三次FAILED版本snapshot依次等待约2677/2392/2235ms，然后才出现目标版本按钮。与 `apps/web/src/features/versions/version-api.ts` 的逐条await诊断读取一致，说明版本就绪时间消耗了原监听窗口；这些观测没有识别请求变慢的宿主/服务器机制。**不因此延长原期限、移动计时点、减少失败快照或关闭完整链路阻塞。**

### 清理时间线必须按阶段隔离

02同一全量日志除D19 `feb4dc40...`（11:07:46.203Z–11:07:55.339Z，原日志4456行）外，还包含E2E `140e8582...`（11:16:11.698Z–11:16:45.139Z，4797行）的CLEANUP_TIMEOUT。用原 `stages.jsonl` 的verify:runner窗口挑选D19，另一失败单列保留，不能混成同一次退出或把两个错误任取一个。

## 建议：下一次只做有针对性的联合捕获

- 不再请求“补传未采集的历史原始代理日志/未输出JUnit”。CASES已明确它们不存在；需要同类新失败的取证时，单独建新批次，旧失败/未知保留。
- B专用runner的下一次窗口中，保持原代码候选、断言、deadline及隔离。D19复用既有可信child observer，在同一次定向CPU用例记录spawn/目标PID、taskkill原生exit/close、worker/browser创建时间和同次OS拒绝栈/句柄；不能借05的观察代替02。
- 下载现场同时记录按钮就绪、click、原export request/response/end/abort与API、代理request ID及宿主监听/转发身份。API诊断覆盖versions/snapshot/files/export；保留实际字节数与版本/摘要绑定。原流的fixture API日志没有这些请求的完整同次生命周期，当前不能靠补齐解析器推断根因。
- A继续负责Windows原EPERM/ENOTEMPTY及旧CI CLEANUP_FAILED的同次证据链与最小修复。只有可复现证据证明机制后才动产品；本轮没有未经证据的产品修复。

## 已核验内容与重现

只读解析器 `d28_b_failure_analysis.py` 在Windows、VPS分别5/5控制通过；两侧直接分析同一280原件的规范输出完全相同，10236字节、SHA256 `02b4c0fe573c328b052fb38002d74a4755ed9d673dc6e8a16d20e0ac25e10c13`。VPS工具与输出在：

`/srv/codeless-handoff/d28/20261103-a-diagnosis/b-original-review/v2/`

```sh
python3 -B /srv/codeless-handoff/d28/20261103-a-diagnosis/b-original-review/v2/d28_b_failure_analysis.py \
  --directory /srv/codeless-handoff/d28/20261102-cny2/b-failure-originals-20261103T101011JST \
  --output <新的已授权私有输出路径>
```

退出0只表示原件校验与解释控制完成，报告仍为HOLD。初次解析发现原命令日志含非UTF8字节；仅为定位ASCII JSON作带标记的文本投影，原字节不改。另一初始错误是未区分runner/E2E两个清理失败；改为使用原阶段窗口，且增加跨阶段拒绝测试。第一版派生JSON因Windows CRLF/Linux LF导致字节不同，原断言失败保留；只修改后续派生输出为固定UTF8/LF，原件没有归一化。错误及新旧报告均有独立SHA/退出记录。

A既有7b4a88b精确六项CI现均success，不再列为运行中；本轮后续提交必须看其自身检查。完整证据见 `evidence/d28-b-originals/`。未确定最终候选、未成组重封、未重绑定预算、未部署或启动付费模型；未批准、合并或修改main。开发token计量UNKNOWN；本轮付费请求/支出0。
