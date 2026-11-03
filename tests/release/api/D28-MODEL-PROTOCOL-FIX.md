# D28-A：真实模型协议及 GENERATE 预算修复候选

状态：**HOLD**。基线为 B PR95 的 `87980106d63a0de65f9101baa6b9ff2b3541e887`，旧统一产物 `0a7e076` 未激活。本修复单独提交供 B 复审，不更改旧封存包或实际部署61。

## 原件与问题

A 已通过严格主机校验 SSH 下载 B 的原 `evidence.tar`，10936320 字节，SHA256 `852cb6ec411015c919ae7e7e4ea23f8a29dcf690b51efe3292d80dda32d37b39`；按原 manifest 独立核对1553成员，长度/摘要全部匹配。原始模型报文仅保留于受控交付和 Git 忽略目录，未提交公开仓库。原115个批次文件逐字节复制后执行原 `node scripts/eval/report.mjs <original-batch> --check`，原生0；前后文件摘要相同。该命令只证明报告可复算。

原模型批次 `2026-11-03T07-32-26Z-real-ef4add12` 的平台成功6/9；B的目录断言受影响复验后行为6/9，目标8/9未达到；代码故障2/3、环境故障2/2。原失败不改写：

- SHOW-02/03 原最后回复均含非法 `{"role","name":...}`，分别在解析列714/221拒绝。提示中的 `{role,name}` 是可消除的歧义；尚不能据此断言它是模型输出的唯一成因。
- TASK-03 原 REPAIR 回复根为 `{"type":"json_object","response":...}`；本轮仍不解包或执行其内部提案。
- FAULT-CODE-03 第七次请求前累计已计费27492 tokens，下一输入保守预约22157、仅余351输出；尚缺 `src/pages/CatalogPage.vue`，provider finish_reason=length，未到故障注入阶段。不能算代码恢复成功。

## 最小跨模块差异

产品修复按本卡允许的例外拆独立PR。只改三份 agent Java 与两份 runtime prompt，另加两份本卡测试及 A 的证据/说明：

1. `AgentLoop` 在 GENERATE 每次发出模型请求前调用无损投影。`GenerationContext` 仅去除模型不需要的调用ID；工具共享参数规则由现有 REPAIR 因子化逻辑提供。所有计划/字面需求/验收点/源码/摘要保持。首次请求即去重，可减少前期输入开销；旧原始请求和计量不修改。
2. `RepairContext` 将原有工具规则投影提取为共用方法；REPAIR 的原有行为不变。每个工具名、必填参数、类型、长度、路径正则和 closed 约束保留；未知 schema 保留原定义。可信 registry 与执行校验不变。
3. GENERATE 以完整合法 JSON 展示目标，REPAIR 明确回复本身为 tool/done 根对象、传输配置不属于提案。两份 prompt 均保留原大小门禁（5338/1763 字节内），原权限和运行时上限不变。

未修改 provider、严格 JSON parser、公共契约、锁文件、CI、迁移、runner、模板、原评测样本/断言/计分。没有新模型、容错解析、封装解包、重试、额度/超时扩张或自动成功。对 B 的影响仅新产品源码需要重新成组封存与受影响验证，原0a7包不能换标。

## 实测与边界

Java21 下原生 Maven 命令及 JUnit 摘要见 `evidence/d28-model-protocol/deterministic-tests.json`：8类42项全部通过，failure/error/skip均0。包括原 provider/repair/context/policy 控制、新4项 GENERATE 投影控制和显式私有原请求重放。Maven native0；外层记录器在结束后打印终端遇GBK编码错误，wrapper1与完整日志均保留，不重跑刷绿。

`D28RecordedGenerationBudgetIT` 使用原第七次请求：输入预约从22157降到19964，可用输出351→2544，完整原计划/源码/摘要不变。**没有声称该单次可获4096，也没有声称模型会输出完整页或新质量达标。** 完整调用链和新故障恢复还需真实验证。

常规控制复现（无需Docker、模型凭据）：

```powershell
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=GenerationInputCompactionTest,RepairInputCompactionTest,GenerationContextTest,D25QualityPolicyTest,RepairPolicyTest,RoundFiveContextTest,DeepSeekModelProviderTest' test
```

私有精确请求复现：使用已校验原归档中 `FAULT-CODE-03-wire/07-request.json`，保持原字节。

```powershell
services/api/mvnw.cmd -f services/api/pom.xml '-Dtest=D28RecordedGenerationBudgetIT' '-Dd28.request=<原请求绝对路径>' test
```

新修复 SHA 的四阶段/infra/ci-gate 须分别核验；本地没有启动与 B 争用的 Docker/Chromium。旧 c28 六项 success 已按精确SHA读取，仅属旧提交，不继承。

## 预算与 B 后续

唯一共享账本只读观察 revision32、链通过，仍绑定0a7；累计保守占用1.255074元（含未知0.4元），可预约余额0.744926元，actual bill UNKNOWN。A继续冻结付费，本轮新增请求0。旧快照不作为余额授权；实时status才是权威。

B审查最小修复与新SHA检查后，按同源新包和原账本规则安排受影响真实复评。剩余只能先保证预约一项0.4元，后续根据实际结算逐项重新准入，不能预先承诺四项覆盖；不足即停止，不另开账本或释放UNKNOWN。已有样本不得在原批次重试刷绿；如为新候选的独立回归，应先按既有维护规则明确追加批次/样本审计身份，保留旧记录，不能绕过控制器的重复样本拒绝。

未满足8/9与代码故障3/3前仍HOLD；生产切换、实际身份/URL/ZIP与cover验收均未执行。开发input/output/合计UNKNOWN，计量来源UNKNOWN；平台本轮付费调用0，与确定性测试分账。
