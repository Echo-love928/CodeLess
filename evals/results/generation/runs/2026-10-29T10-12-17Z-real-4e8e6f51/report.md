# D21-A 生成评测报告 2026-10-29T10-12-17Z-real-4e8e6f51

由 `scripts/eval/report.mjs#v2` 从本目录原始记录生成；`node scripts/eval/report.mjs <batchDir> --check` 可复算。

- 模式：**REAL**（REAL_MODEL）；真实模型证据：是
- Provider：deepseek / deepseek-flash；其他 provider 调用：0
- 平台提交：`a863b76e9d5785e20cb6f0d43bb67f79f5df0a50`（IN_PLACE）
- 冻结集：requirements sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a，faults sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13，run-config sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- 完成度：计划 14，已启动 14，原始记录 14，批次完成 是，凭据出现次数 0

## 9 个需求（分母固定为冻结计划）

- 首轮成功（首次真实构建+浏览器即通过、0 次修复）：**6/9**（66.7%）
- 3 轮内最终成功（平台 READY）：**8/9**（88.9%）；目标 ≥8/9：达到（基线目标，不是既有成绩）
- 需求级最终成功（叠加 D21-B 行为断言）：PENDING_D21_B，当前为未知，不计为成功
- 缺失记录：无；harness 错误：无；样本进程异常（不计成功）：无
- 修复：共 2 轮，2 个样本发生修复
- 实际 token：172317；输入 148268 / 输出 24049；已知下限 输入 148268 / 输出 24049；缓存命中（已含在输入中）94208
- 运行时预算计费（含保守估算，非实际用量）：172317，估算调用 0
- 模型请求 43，工具槽 53；耗时中位数 24.1 s，最大 44.8 s（已知 9，未知 0）
- 失败类型：MODEL_OUTPUT×1

| 需求 | 类别 | 任务 ID | 首次验证 | 最终 | 修复轮 | 失败类型 / 代码 | 模型请求 | 实际 token | 耗时 |
| --- | --- | --- | --- | --- | ---: | --- | ---: | --- | ---: |
| SHOW-01 | SHOWCASE | f4acc944-6bb3-4ef7-9b84-84a144339189 | VERIFIED | READY | 0 | — | 4 | 13414 | 19.9 s |
| SHOW-02 | SHOWCASE | 287d7e31-dbc4-4104-8c20-6d38fca38d87 | FAILED | READY | 1 | — | 5 | 17687 | 34.3 s |
| SHOW-03 | SHOWCASE | 735ff80d-82ea-47f2-830d-18a4f9153d2e | VERIFIED | READY | 0 | — | 5 | 18642 | 25.9 s |
| TASK-01 | TASKS | 6b898397-ef76-4855-ba3f-25c6e416478e | VERIFIED | READY | 0 | — | 4 | 14250 | 18.9 s |
| TASK-02 | TASKS | 66e29eda-6470-49d6-8735-c3b90c9d57c0 | NONE | FAILED | 0 | MODEL_OUTPUT / AGENT_ACCEPTANCE_INVALID | 5 | 21839 | 15.3 s |
| TASK-03 | TASKS | e1686fb6-fead-4b0c-bc77-c42a79217825 | VERIFIED | READY | 0 | — | 3 | 10379 | 19.0 s |
| CAT-01 | CATALOG | 6e3ea891-6d6b-46e7-b19e-f846ce4f4916 | VERIFIED | READY | 0 | — | 4 | 15597 | 24.1 s |
| CAT-02 | CATALOG | 30e1d4df-4031-4342-ae49-e90bb955ee1a | VERIFIED | READY | 0 | — | 6 | 26616 | 31.3 s |
| CAT-03 | CATALOG | 0d5a676b-f3c7-43dd-b2e1-f41c8e209c2a | FAILED | READY | 1 | — | 7 | 33893 | 44.8 s |

## 故障集（与 9 个需求分开统计）

- 代码故障按预期修复：**1/3**；环境故障按预期停止：**2/2**
- 故障集实际 token：≥59207（1 次未知）

### FAULT-CODE-01（CODE / MISSING_MODULE_IMPORT，基于 SHOW-01）：PASSED

任务 861394fc-62bc-4627-9492-b97a61aa8d50；最终 READY；修复轮 1；失败 —

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

### FAULT-CODE-02（CODE / STRICT_TYPE_ERROR，基于 TASK-01）：FAILED

任务 8eda1dbd-0289-4405-a959-47618a67b3d1；最终 FAILED；修复轮 0；失败 MODEL_OUTPUT / AGENT_ACCEPTANCE_INVALID

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | "APPLIED" | 通过 |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | 通过 |
| first verify | "FAILED" | "NONE" | **未通过** |
| first failure category | "CODE" | null | **未通过** |
| first decision | "REPAIR" | null | **未通过** |
| final | "READY" | "FAILED" | **未通过** |
| repair rounds | "1..3" | 0 | **未通过** |
| acceptance actions unchanged | true | false | **未通过** |
| final source differs from injected source | true | false | **未通过** |

### FAULT-CODE-03（CODE / RUNTIME_ASYNC_PAGE_EXCEPTION，基于 CAT-01）：FAILED

任务 1514e06f-6930-403f-94cd-6b6f912b1deb；最终 FAILED；修复轮 0；失败 MODEL_OUTPUT / MODEL_INVALID_RESPONSE

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| sample JVM exit | "OK" | "OK" | 通过 |
| harness error | null | null | 通过 |
| journal and model calls recorded | true | true | 通过 |
| injection applied | "APPLIED" | null | **未通过** |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | null | **未通过** |
| first verify | "FAILED" | "NONE" | **未通过** |
| first failure category | "CODE" | null | **未通过** |
| first decision | "REPAIR" | null | **未通过** |
| final | "READY" | "FAILED" | **未通过** |
| repair rounds | "1..3" | 0 | **未通过** |
| acceptance actions unchanged | true | false | **未通过** |
| final source differs from injected source | true | false | **未通过** |

### FAULT-ENV-01（ENVIRONMENT / CONTAINER_CLI_UNAVAILABLE，基于 SHOW-02）：PASSED

任务 346cbadc-6e42-4c6f-91fe-201ddf1df05a；最终 FAILED；修复轮 0；失败 ENVIRONMENT / AGENT_RUNNER_UNAVAILABLE

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

任务 f87d3c3c-5648-4635-868a-d176d00f125a；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_NETWORK

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

- `batch-complete.json` sha256:d431b8c76b4d4580135050b0062faf1feb91e038658d477938268e2a5e814512
- `batch.json` sha256:d3d4660bf9af3bedd3f4a01593cc29774dc24c607cad1b010b3e7730f3f2994a
- `frozen/faults.json` sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13
- `frozen/requirements.json` sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a
- `frozen/runConfig.json` sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- `samples/CAT-01/invocation-result.json` sha256:027d1689d22bab21709cb4545a2434fc9db25e5a2ef53318fd82db090bc38c42
- `samples/CAT-01/record.json` sha256:7298ac4eb28f263aad48af371d1984ab208f9ed01d6a027c2fa850b0868a8700
- `samples/CAT-01/spec.json` sha256:a921c41aaaffecbed2bfdbe421fd6cda932368887eda3ddf20965b85e19b6883
- `samples/CAT-02/invocation-result.json` sha256:c94edea932fb7240433639fb5e7f7556eb4489f72ae3c57e0fc7a9fe55078286
- `samples/CAT-02/record.json` sha256:6bb311edfe7424b682ee9fa1675f44886af99cfb84d55561f60c1715fa6d321a
- `samples/CAT-02/spec.json` sha256:030b208a61aae214ed9c04719550a656bbbd01bad2e7bd156b843272f06e6d80
- `samples/CAT-03/invocation-result.json` sha256:b789124fa88929d3c4386062b72aae9dc33527541a8119704969ed71e604f8ec
- `samples/CAT-03/record.json` sha256:78a43d262455bbd9bb58cd2c77bb9950a83b516cda1b6cf8f8183d1a81661741
- `samples/CAT-03/spec.json` sha256:8dfed9778a95e63c01d5215479f5db30d85482845b9fbd3de9535cd308755412
- `samples/FAULT-CODE-01/invocation-result.json` sha256:f767343dcbb9f740300d4fd5c82c9d1df6f575783854d66b74d09bede8467899
- `samples/FAULT-CODE-01/record.json` sha256:29c93c80c10869fa9eea593c168f9b94c490cf94799b40dd7f81383a1fec51e6
- `samples/FAULT-CODE-01/spec.json` sha256:f21d451fcf121a6296dc6b3425986fb839c2c9ba79520189ff674df9483ee87b
- `samples/FAULT-CODE-02/invocation-result.json` sha256:024927866d8baa26533d0ab6ad9099608b764b7c92ca23afa6b32b5185c6ae5e
- `samples/FAULT-CODE-02/record.json` sha256:90048606148673d3a9276da92fdb10e0312d71ea198dbee74b939f0881ac10cb
- `samples/FAULT-CODE-02/spec.json` sha256:1650d7ed36d848e6093c62d74e24d8cfcce1e57281fda312528a0acc84c862c9
- `samples/FAULT-CODE-03/invocation-result.json` sha256:cde0d6de1746e1b61d5175c0560baf656ac78733ed9d42a4283c33fab29be9c9
- `samples/FAULT-CODE-03/record.json` sha256:94e55f0b1341200a313929d5083bd5642267a31c80cf94f0750fb1fac81a7060
- `samples/FAULT-CODE-03/spec.json` sha256:4c2b1b97b8d7b198e3bef17d19e75fa7a8236b5e4606b251a3e3eee6e9be70be
- `samples/FAULT-ENV-01/invocation-result.json` sha256:25a0d1b4413e688cdfd9b167bf6964fea707c9827c127ffae944aa0eb3f060fa
- `samples/FAULT-ENV-01/record.json` sha256:199a6401d8ba88c5fc95abe01a3260cb1e13a451500bc996a29e38645d4d3dc3
- `samples/FAULT-ENV-01/spec.json` sha256:ffb07f2442ee9211edd38531ba86c845783e6c3d9a8bf8ff3fb5bcc6d2ed4d8c
- `samples/FAULT-ENV-02/invocation-result.json` sha256:83028e7d0187b9111334675323682c663de08fd1414f94d733687d7b548d6680
- `samples/FAULT-ENV-02/record.json` sha256:dd2c2ddf513eb96e8e60eedc11a63840b7ba853190fc5c4ed45e9c15c30e5d55
- `samples/FAULT-ENV-02/spec.json` sha256:e5e04799f64e8b5baaf9b2ce003689faf490182c245533ccb095d2aa423fe125
- `samples/SHOW-01/invocation-result.json` sha256:2d32ba93a7cd9a9a7d07d62830d9c6086edfc3d263558927e05395dd331bfc07
- `samples/SHOW-01/record.json` sha256:bb27a28e4fedee28d032c918c4761ce6cea0a23cbef1ef2fb2ece3c23de101e8
- `samples/SHOW-01/spec.json` sha256:cc2e0a7a7179f609d7b801a21fdad10e05accee843e7d57bea06fcba1c38423c
- `samples/SHOW-02/invocation-result.json` sha256:b02d2a35d5fcc5e895adb36c73d7af6f946a6ee3dda4203524d3886f55a933c3
- `samples/SHOW-02/record.json` sha256:24a8222da8fa51f43b5eae038e375a93b39185e842e76a3c8eb36170b73cfaf7
- `samples/SHOW-02/spec.json` sha256:79eead16d3f19f2f29910c2286f62eff727adbcbed4fc2d73b3e12076d9318be
- `samples/SHOW-03/invocation-result.json` sha256:e9421cc7153ad317bb4f64b1bf8de701434266d35fbd56a397509e7281bb8e0b
- `samples/SHOW-03/record.json` sha256:d1d8ad719d52d360d46683e09cf2a07f1ecbbf050431de089986d884700ca537
- `samples/SHOW-03/spec.json` sha256:2afabe14d12028579cf4410afc6714461d05a369a33a245c03e777593e8d33f5
- `samples/TASK-01/invocation-result.json` sha256:cd8fbedc27f978f85b97af836d8df303d0009840312cae50b480970e60f2865c
- `samples/TASK-01/record.json` sha256:0d4c1f6ababeb0f515852dfed6729d3eb21af8af0bd41c3613acbf7672f19ec1
- `samples/TASK-01/spec.json` sha256:a6ff3e940e407cca061f8a5eb7eea7eef66488f0a6c05c97b5eec92b6c1ae3b4
- `samples/TASK-02/invocation-result.json` sha256:7fca470e9bc3088283b51253e8ab0e0e992bb2c6842493738345142aa482d736
- `samples/TASK-02/record.json` sha256:cb38d10bd35c99178c54143deeef41556dcab1abcf67b6f5c5181ed90b749ca0
- `samples/TASK-02/spec.json` sha256:f3376ceca9ab19d1734f965510443f13cd25fa44cc0df05628040b86c0006c19
- `samples/TASK-03/invocation-result.json` sha256:b230532df1ce6ef4d006b751ca70cc0757483c82a1b0b76bdecece5950d84325
- `samples/TASK-03/record.json` sha256:c9940e488665880181c94ee7030ffa5eca66c6d789e4fa8133c908eb1649716b
- `samples/TASK-03/spec.json` sha256:c4f117b7f336394f7d9903090c1bcff605f4c56d33e09525a7bf4fbde56cef0b
