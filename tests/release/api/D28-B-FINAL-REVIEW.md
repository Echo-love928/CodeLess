# D28-A 对 PR95 的最终增量复审

日期：2026-11-03（Asia/Tokyo）。审查候选 **1fe1389dee23efbb1b43c30f3ec1b8f546413087**；基线main **2be793d**，此前已审源码 **57d1acf**。A账号与PR作者不同。本记录属于A验收文档，不改变已部署候选。

结论：**技术复审通过；当前增量无阻塞发现。** A已提交并独立回读 [正式APPROVED审查](https://github.com/Echo-love928/CodeLess/pull/95#pullrequestreview-5753735658)，绑定下述候选；PR95仍为草稿、未合并。任何head/base变化须重新检查并批准。用户已在本聊天明确确认“历史事件留档不再阻塞”；EPERM/ENOTEMPTY/CLEANUP_FAILED不宣称根因已修复。

## 阻塞问题

在本轮worker权限修复、质量复评、同源部署与cover新增证据范围内，未发现新的技术阻塞。TASK-03仍失败并计入9项分母，未写成9/9；生产provider仍为deterministic-mock，线上发布/截图验收与REAL质量报告分账。当前范围不含启用线上付费生成。

## 建议（非阻塞）

- `.github/workflows/ci.yml:58` 仅自动运行旧 `public-worker.test.py`；新8项 `public-cover-permissions.test.py` 已由B及A在Linux独立通过，建议CI维护者后续登记，保留此次手工原件。A没有修改CI。
- `docs/handoffs/D28-B.md:1` 与 `tests/release/browser/PR-DRAFT-D28-B.md:1` 的旧“最新”仍指向0a7/M5 HOLD。建议补充当前索引并明确历史快照；本次最新事实由PR95正文、受控final-acceptance.json及本报告固定。任何后续commit/base更新须按规则重查影响并重新批准。

## 已核验内容

| 项目 | 命令/原生结果 | 证据及边界 |
| --- | --- | --- |
| 新增产品差异 | `git diff 57d1acf 1fe1389 -- infra/public/worker.py tests/infra/public-cover-permissions.test.py`，0 | worker218/306仅对成功publish的绑定回执赋予IPC组0640只读；固定UUID根、非链接、单硬链接、原owner/group、大小和版本/构建摘要/URL检查。body字节不改，构建/probe不变。 |
| 原件独立取回 | `d28_final_intake.py --root <私有取证根>`，0 | 四样本归档608文件；公网归档19成员/17普通文件；整包和验收JSON摘要全部匹配。原57 cover失败native1、新1fe成功native0均保留。 |
| 增量质量 | 原 `node scripts/eval/report.mjs <四样本原批次> --check`，0；`d28_final_quality_audit.py`，0 | 原冻结集三文件与旧14样本完全相同；逐条校验原record、4份原Maven日志实际各执行1项、native退出0、22个真实模型调用与计费。SHOW-02/03行为通过；TASK-03仍FAILED；FAULT-CODE-03真实注入、修复及原actions不变检查均通过。复用原6项通过，合计8/9；代码故障3/3、环境2/2（后者复用）。 |
| 预算独立复核 | 原10+新10金融控制，20/20，0；只读SQLite链复算，0 | 43条事件链接到A先前revision32摘要；原14记录规范字节不变，新增22调用对应0.292580元，累计上界1.547654元（含旧UNKNOWN0.4），余0.452346元，实际账单UNKNOWN。A复审新增付费0。 |
| Linux权限控制 | `CODELESS_WORKER_UNDER_TEST=/opt/codeless/ops/worker.py python3 -B <B受控tests.py>`，8/8，0 | 安装worker哈希e20186de…与Git完全一致；API可读不可写，preview不可读，回执mode0640，owner=codeless-worker/group=codeless-ipc。暂存new.py仅CRLF不同，不冒称暂存字节与Git相同；实际复测针对安装的Git LF版本。 |
| 包与源码 | 服务器只读tar/hash核验，0；Git blob复算，0 | 原包fd190759…，167874560字节/277成员全部匹配；258份源码与1fe Git blob匹配；API JAR与57包逐字节摘要相同，生成Java/runner/prompts/templates/eval源无变化，支持质量复用。 |
| 真实部署 | 已有 `d28_live_identity.py --candidate <本地路径投影> --api-manifest-path <实机路径> --client-manifest-path <实机路径>`，9/9，0 | 运行JAR描述符、源码、worker PID/字节、两份manifest、7个web文件、策略镜像ID/revision均指向1fe。原selection保留，另建本机路径投影，不修改原清单。 |
| 匿名公网 | 14次只读GET全部符合预期、curl原生0 | 本机代理DNS为198.18.*；公共DoH确认23.136.172.128后仅请求级映射并正常验证域名证书，不改hosts/CA。站点2文件与平台7文件逐字节匹配，私有回执404、匿名cover/导出401。未使用凭据。 |
| ZIP | 原 `tests/export/verify-export.mjs`，0 | 16个正规成员、CRC/路径/清单/源码/模板/内容摘要独立通过，版本bc53e8eb…、构建e9426ee6…一致。当前ZIP c4d09430…与原已验收ZIP完全相同；没有重跑已通过的构建套件。 |
| 生产cover | 活动API配置根的job/PNG只读核验，0 | 同一publication bb96bd04…/版本/源/构建摘要；SUCCEEDED/attempts1；实际PNG 1280×720、13505字节、47322803…，目录仅job.json/cover.png。原PNG和公开页均已目检，为实际Ada页面文字而非空白占位。 |
| 当前必需CI | GET run41633433960及精确check-runs，采集器0 | static/API/runner/E2E/infra/ci-gate六项全completed/success，全部head=1fe；API原日志437/0fail/0error/0skip。GitHub结论不伪填未知子进程退出码。没有重跑已通过工作流。 |

受控原件根：`/srv/codeless-handoff/d28/20261102-cny2/` 下 `b-retest-57d1acf-20261103`、`b-public-closeout-1fe1389-20261103`、`candidate-1fe1389`；B使用其已有SSH身份。公开只放派生回执/摘要，认证trace、模型报文和ZIP/PNG原件不公开。

## 可复现入口与数据布局

三份新增工具只读取原件、Git和已有账本快照，不发HTTP/模型/Docker或更改部署。取证根须在克隆仓库的 `tests/release/api/.private/`，不依赖A的盘符。把受控材料按以下角色复制：`retest/{evidence.tar,manifest.json,receipt.json}`、`closeout/{raw-private.tar,final-acceptance.json,receipt.json}`（receipt为原closeout-receipt）、`candidate/api/release.json`、原预算控制器 `budget-controller.py`（SHA f1852e14…）、权威状态 `live-budget.json`。`delta-batch/` 是原归档中对应 `evals/results/generation/runs/2026-11-03T11-08-05Z-real-d985e3ae/` 的原字节复制；旧14样本目录也保持原字节。

```text
python -B tests/release/api/d28_final_intake.py --root <私有取证根>
node scripts/eval/report.mjs <四样本原批次> --check
python -B tests/release/api/d28_final_quality_audit.py --root <私有取证根> --prior-batch <原14样本目录>
python -B tests/release/api/d28_final_source_budget_audit.py --root <私有取证根> --anchor tests/release/api/evidence/d28-final-review/prior-budget-anchor.json
node tests/export/verify-export.mjs <原source-current.zip> --version bc53e8eb-08c3-4e1c-b41c-9667b98ac0fe --source-digest sha256:2239f682cdf36d1fccd9adb61fe0c64736730a0d33191ec3364b09316179b9e9 --artifact-digest sha256:05dc193860ef0024013f76933f991b4603faa12d981d0b935877a9339d004393
```

源/预算工具另需私有 `server-group-and-chain-raw.json` 中 `ledger.row` 为只读SQLite `SELECT payload,head FROM ledger WHERE id=1`，`ledger.events` 为 `SELECT seq,payload,prior,digest FROM events ORDER BY seq`，同一只读事务采集。重算公式为SHA256(prior+payload)，末stateSha256绑定规范state；公开prior-budget-anchor固定原revision32和14条记录摘要。原manifest从封存tar取原字节，勿重写。

## 限制与失败保留

额外带认证HTTP复读被自动审批拒绝：私有trace会话材料用途未显式授权，命令未执行/native=null。A没有使用该Cookie；依用户复用要求，核对B已有owner/cross-user/错误摘要HTTP原件并独立验证ZIP、cover及实际角色权限，不声称新增owner请求成功。SCP小回执一次读取失败native1、原stderr未保存/原因UNKNOWN；固定清单SSH补取native0，所有原摘要匹配。首个质量投影读取不存在的toolSlots字段失败1，按原schema的tools字段修正并增加native/JUnit核验，未改原件、原断言或测试状态。

本轮A开发 input/output/total UNKNOWN，计量来源UNKNOWN。A新增平台付费调用0；B四样本复评22次调用与公共研发账本另列。未自批A的PR，未修改B源码、公共契约、锁、CI或迁移，未切换生产或合并main。
