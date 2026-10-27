# D21-A 生成评测报告 2026-10-25T03-16-25Z-real-336c08c3

由 `scripts/eval/report.mjs#v2` 从本目录原始记录生成；`node scripts/eval/report.mjs <batchDir> --check` 可复算。

- 模式：**REAL**（REAL_MODEL）；真实模型证据：是
- Provider：deepseek / deepseek-flash；其他 provider 调用：0
- 平台提交：`911943fa5c07122046b0ca128cffddba9805ebcd`（IN_PLACE）
- 冻结集：requirements sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a，faults sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13，run-config sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- 完成度：计划 14，已启动 14，原始记录 14，批次完成 是，凭据出现次数 0

## 9 个需求（分母固定为冻结计划）

- 首轮成功（首次真实构建+浏览器即通过、0 次修复）：**6/9**（66.7%）
- 3 轮内最终成功（平台 READY）：**7/9**（77.8%）；目标 ≥8/9：未达到（基线目标，不是既有成绩）
- 需求级最终成功（叠加 D21-B 行为断言）：PENDING_D21_B，当前为未知，不计为成功
- 缺失记录：无；harness 错误：无；样本进程异常（不计成功）：无
- 修复：共 1 轮，1 个样本发生修复
- 实际 token：223645；输入 189619 / 输出 34026；已知下限 输入 189619 / 输出 34026；缓存命中（已含在输入中）126464
- 运行时预算计费（含保守估算，非实际用量）：223645，估算调用 0
- 模型请求 53，工具槽 59；耗时中位数 25.7 s，最大 57.3 s（已知 9，未知 0）
- 失败类型：BUDGET×2

| 需求 | 类别 | 任务 ID | 首次验证 | 最终 | 修复轮 | 失败类型 / 代码 | 模型请求 | 实际 token | 耗时 |
| --- | --- | --- | --- | --- | ---: | --- | ---: | --- | ---: |
| SHOW-01 | SHOWCASE | 587c766b-dd72-43a9-b170-58a36b0e2f13 | VERIFIED | READY | 0 | — | 5 | 17370 | 22.1 s |
| SHOW-02 | SHOWCASE | 5736e3a9-ee66-4d86-89fd-cb65c73401b9 | FAILED | READY | 1 | — | 11 | 40988 | 57.3 s |
| SHOW-03 | SHOWCASE | 2a89e4e6-4d76-4106-9c70-5d6acfc6f0c7 | VERIFIED | READY | 0 | — | 6 | 25005 | 26.3 s |
| TASK-01 | TASKS | 39c492e2-2f8a-429b-81ee-7e8471e1c37c | VERIFIED | READY | 0 | — | 6 | 24882 | 25.8 s |
| TASK-02 | TASKS | 389f2993-768e-4c34-94fc-0c133eb0ed8e | VERIFIED | READY | 0 | — | 5 | 22222 | 27.8 s |
| TASK-03 | TASKS | a8da18b0-9fb2-44ac-a8f4-845439c9eed0 | VERIFIED | READY | 0 | — | 5 | 21559 | 25.7 s |
| CAT-01 | CATALOG | d9a37b67-277a-4ec4-a23f-742dcceffaad | VERIFIED | READY | 0 | — | 4 | 17023 | 24.0 s |
| CAT-02 | CATALOG | 8c92edbb-4273-4bf3-a612-4673324eba1e | NONE | FAILED | 0 | BUDGET / AGENT_MODEL_BUDGET_EXCEEDED | 6 | 30088 | 21.6 s |
| CAT-03 | CATALOG | 939699fc-8c6d-4d23-8849-040ef8c3d60f | NONE | FAILED | 0 | BUDGET / AGENT_MODEL_BUDGET_EXCEEDED | 5 | 24508 | 21.5 s |

## 故障集（与 9 个需求分开统计）

- 代码故障按预期修复：**2/3**；环境故障按预期停止：**2/2**
- 故障集实际 token：≥111822（1 次未知）

### FAULT-CODE-01（CODE / MISSING_MODULE_IMPORT，基于 SHOW-01）：FAILED

任务 c3b30f62-3e80-467c-800a-f60157d4ec90；最终 FAILED；修复轮 1；失败 MODEL_OUTPUT / AGENT_MODEL_PROTOCOL_INVALID

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | "APPLIED" | 通过 |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | 通过 |
| first verify | "FAILED" | "FAILED" | 通过 |
| first failure category | "CODE" | "CODE" | 通过 |
| first decision | "REPAIR" | "REPAIR" | 通过 |
| final | "READY" | "FAILED" | **未通过** |
| repair rounds | "1..3" | 1 | 通过 |
| acceptance actions unchanged | true | true | 通过 |
| final source differs from injected source | true | false | **未通过** |

### FAULT-CODE-02（CODE / STRICT_TYPE_ERROR，基于 TASK-01）：PASSED

任务 fb71c6a8-386f-4323-bbd4-3864a409415b；最终 READY；修复轮 1；失败 —

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | "APPLIED" | 通过 |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | 通过 |
| first verify | "FAILED" | "FAILED" | 通过 |
| first failure category | "CODE" | "CODE" | 通过 |
| first decision | "REPAIR" | "REPAIR" | 通过 |
| final | "READY" | "READY" | 通过 |
| repair rounds | "1..3" | 1 | 通过 |
| acceptance actions unchanged | true | true | 通过 |
| final source differs from injected source | true | true | 通过 |

### FAULT-CODE-03（CODE / RUNTIME_ASYNC_PAGE_EXCEPTION，基于 CAT-01）：PASSED

任务 ae8d4530-58ce-4804-98c1-61ea9947db58；最终 READY；修复轮 1；失败 —

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | "APPLIED" | 通过 |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | 通过 |
| first verify | "FAILED" | "FAILED" | 通过 |
| first failure category | "CODE" | "CODE" | 通过 |
| first decision | "REPAIR" | "REPAIR" | 通过 |
| final | "READY" | "READY" | 通过 |
| repair rounds | "1..3" | 1 | 通过 |
| acceptance actions unchanged | true | true | 通过 |
| final source differs from injected source | true | true | 通过 |

### FAULT-ENV-01（ENVIRONMENT / CONTAINER_CLI_UNAVAILABLE，基于 SHOW-02）：PASSED

任务 89be3ee9-489e-4320-9774-973857f23f6c；最终 FAILED；修复轮 0；失败 ENVIRONMENT / AGENT_RUNNER_UNAVAILABLE

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| container CLI absent in sample JVM | false | false | 通过 |
| final | "FAILED" | "FAILED" | 通过 |
| failure stage | "VERIFY" | "VERIFY" | 通过 |
| failure category | "INFRASTRUCTURE" | "INFRASTRUCTURE" | 通过 |
| no REPAIR decision | true | true | 通过 |
| repair rounds | 0 | 0 | 通过 |
| REPAIR model calls | 0 | 0 | 通过 |
| immutable candidates | 1 | 1 | 通过 |
| file tool calls after failure | 0 | 0 | 通过 |

### FAULT-ENV-02（ENVIRONMENT / MODEL_ENDPOINT_UNREACHABLE，基于 TASK-02）：PASSED

任务 627294d9-eef0-4f30-99f7-48fe2d32761a；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_NETWORK

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| proxy route refused before task | "REFUSED" | "REFUSED" | 通过 |
| final | "FAILED" | "FAILED" | 通过 |
| failure code | "MODEL_NETWORK" | "MODEL_NETWORK" | 通过 |
| failure category | "MODEL_INTERFACE" | "MODEL_INTERFACE" | 通过 |
| model calls (no retry) | 1 | 1 | 通过 |
| failed call usage | "UNKNOWN" | "UNKNOWN" | 通过 |
| file tool calls | 0 | 0 | 通过 |
| repair rounds | 0 | 0 | 通过 |

## 一致性核对

评测计算的模型请求数、工具槽与预算计费均与平台日志计量一致。


## 输入文件摘要

- `batch-complete.json` sha256:affccb190ba7ba59de73e817401ed38366b95e8f762bb3acadc94c840e8ae79e
- `batch.json` sha256:908c3bc6207d99577768040aa9f57687408615747288636629071d6a32e901aa
- `frozen/faults.json` sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13
- `frozen/requirements.json` sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a
- `frozen/runConfig.json` sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- `samples/CAT-01/invocation-result.json` sha256:c0b1059ba78282d4a501eb1de42ec1bd4012fc4b8e322301cb02417571a7e931
- `samples/CAT-01/record.json` sha256:8c1b92a0595da735745ec714b37a67f972079a7ca2573256127b3cf8650da2d3
- `samples/CAT-01/spec.json` sha256:ef7c934ea90ad68b028d92d8fc9c5db37625b4fc5b8a28613a38fcdea75d2725
- `samples/CAT-02/invocation-result.json` sha256:3c963d871d9692c3d609ec5b89026ee20000e06c4cc0d26b7ab208bcb2c452f9
- `samples/CAT-02/record.json` sha256:640864bf6b12280c760a7824fcc9491b0b5aa6a243ada1dd62ed039f1492a071
- `samples/CAT-02/spec.json` sha256:1d14bd5f49425f5d8781e635c188a2da49d3d4b8ca277105088cd96d06de3a7b
- `samples/CAT-03/invocation-result.json` sha256:ce0ba074be1c5395623e9b3a00cfa92d770a08e5be91b6eae10ad1c40143b766
- `samples/CAT-03/record.json` sha256:30507b92625cfc1a268077d33e490186e9ecd1875cf3594662c04bea82a3c3f0
- `samples/CAT-03/spec.json` sha256:287c5f7c119ddaa1765eff3376c2958a4b12f4c16761c81ccf1b986d2a555a83
- `samples/FAULT-CODE-01/invocation-result.json` sha256:3178b3d5cee011918ff0a86e41335eb50a08a74c7afcaeacf43ebc55a451971d
- `samples/FAULT-CODE-01/record.json` sha256:19fdf808fc9504a3d05654ac07e92ed4411aa5a1578efda1fa29cf134c2f1ba3
- `samples/FAULT-CODE-01/spec.json` sha256:be992f15a1c89f370299fa56f73443db8bf2f0588824da5385f1a978ffa09409
- `samples/FAULT-CODE-02/invocation-result.json` sha256:a5434cd48890e4784a5e99b8e2c193793eebc3309d424b2705334a9f88f3c073
- `samples/FAULT-CODE-02/record.json` sha256:76910ee5f08e1ffe2ed046c840e7a81071deb1cd37fdc88ca5179dc8b53c9fa7
- `samples/FAULT-CODE-02/spec.json` sha256:c1dc900b5db66450b0a690f5842a9d3367898b651924e75a2e64c650fd7a041f
- `samples/FAULT-CODE-03/invocation-result.json` sha256:c16c223fb317f30be6c8c359c61f7585338e64da9d40826b489ff90e83c735e6
- `samples/FAULT-CODE-03/record.json` sha256:5f633db2f0e698368d37bf1debbf0fff190c2b0bfeba171fcb74c391573482fe
- `samples/FAULT-CODE-03/spec.json` sha256:b0124e485665fd9ce448a182581e96883871962a2f76e3be80b6c3380e869d18
- `samples/FAULT-ENV-01/invocation-result.json` sha256:6bdf401a46a19dfb60164616865081c59b62076602be95bbd50204efc7c4b64a
- `samples/FAULT-ENV-01/record.json` sha256:7cb86954c5dac54009a5d5198226dccf5d8021dd9111a45fbaf1a1d74698c334
- `samples/FAULT-ENV-01/spec.json` sha256:c8b8909fb50b386625aecff55ee8598852bbfed119d40c7010d029218a87c24d
- `samples/FAULT-ENV-02/invocation-result.json` sha256:eb40ba3e2f87ffcf955b92f15228e54fdc7811662b520abb3521dcc61a92daec
- `samples/FAULT-ENV-02/record.json` sha256:c34b090e9f3b3c354756d0629c96728b7c9693d847f512c64c3ea42371b5ab01
- `samples/FAULT-ENV-02/spec.json` sha256:f23afc8a7062bbfa9e31d1da1827431ca7311194f4fde5318817192dedfab02b
- `samples/SHOW-01/invocation-result.json` sha256:9d5b4b33aaa4a13db3982947fd425eb3f8ec88f26c3da79a855a7c96cd4d702c
- `samples/SHOW-01/record.json` sha256:b4e1af0d56f822f8ec7b3f9ba827e6cd0ca660076de3a2f3fbf6babc3adbbe40
- `samples/SHOW-01/spec.json` sha256:646317b6ae8479d20ad59e17c9d542a61a5debb19aa41d73a07f2eda908deff4
- `samples/SHOW-02/invocation-result.json` sha256:4c2246e71a9f5673afde133ba9dc8ebf71a9a9e25355e9a2b0499f86ba94ddae
- `samples/SHOW-02/record.json` sha256:425a45d2f67f666286f2949a6fcf2d7b259a10bfbd9e247c0c24d7ac420080bf
- `samples/SHOW-02/spec.json` sha256:779a1db527422d70c822d3f4fe3623e0d7d1756af3c4f243e200201b1073de49
- `samples/SHOW-03/invocation-result.json` sha256:d8e82162d03baa53daff3a4e212007e29c76a957ebf829a494c13b10971948c2
- `samples/SHOW-03/record.json` sha256:48a98895314c53f038f9e1fe8c40428bfc2d1010d6b52c853a933d76852c9bb5
- `samples/SHOW-03/spec.json` sha256:d62d749986165a900b51bd44f7189d0ba46cc5914d1aecf46321d807adbc714c
- `samples/TASK-01/invocation-result.json` sha256:5519fc14f7bb9268e9cc3aaa26539dd55228f4ef0bfcd84238388f331e7bad3a
- `samples/TASK-01/record.json` sha256:f7c960f297d102095b1ad49750171aea1ba6f61c9810c9de6ad461ef30617779
- `samples/TASK-01/spec.json` sha256:dce30049580c6c1c9632dd212825fbb889fa96d2bf2d8ed386442a65c59a9316
- `samples/TASK-02/invocation-result.json` sha256:9bfa71b4a7e773497b2f93c1ee8cf12af910b7268dbcd3f25f55e1bd97b12e07
- `samples/TASK-02/record.json` sha256:1e7b0b8e35d411699e2fef23dd38583a7bef9f7076ae2f89486e54c952fda7f5
- `samples/TASK-02/spec.json` sha256:9e152050bc7de75f5ee075ca81993f1381a0978397d57017e77399ddb71f662b
- `samples/TASK-03/invocation-result.json` sha256:99d20b533db7ab9af74bb6f13a76a209a3b39d0a8528c0bc3e5c2a2b19d6ec6b
- `samples/TASK-03/record.json` sha256:b4d85f375c328cbeb302fa91561d599a6984d6903380a74267f2c5ca3af332d8
- `samples/TASK-03/spec.json` sha256:fa90dc0a2d3c8c01afa8bd7101aa394f240923bce69f5d2ba6dd499c83388c02
