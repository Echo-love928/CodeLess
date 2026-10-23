# D21-A 生成评测报告 2026-10-23T14-16-43Z-real-545bbebf

由 `scripts/eval/report.mjs#v1` 从本目录原始记录生成；`node scripts/eval/report.mjs <batchDir> --check` 可复算。

- 模式：**REAL**（REAL_MODEL）；真实模型证据：是
- Provider：deepseek / deepseek-flash；其他 provider 调用：0
- 平台提交：`c25b722bee9122c7bc7cafe01b5739b7a7f4e1ac`（DETACHED_WORKTREE_AT_HEAD）
- 冻结集：requirements sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a，faults sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13，run-config sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- 完成度：计划 14，已启动 14，原始记录 14，批次完成 是，凭据出现次数 0

## 9 个需求（分母固定为冻结计划）

- 首轮成功（首次真实构建+浏览器即通过、0 次修复）：**3/9**（33.3%）
- 3 轮内最终成功（平台 READY）：**3/9**（33.3%）；目标 ≥8/9：未达到（基线目标，不是既有成绩）
- 需求级最终成功（叠加 D21-B 行为断言）：PENDING_D21_B，当前为未知，不计为成功
- 缺失记录：无；harness 错误：无
- 修复：共 0 轮，0 个样本发生修复
- 实际 token：≥71992（6 次未知）；输入 — / 输出 —；已知下限 输入 66134 / 输出 5858；缓存命中（已含在输入中）49536
- 运行时预算计费（含保守估算，非实际用量）：129210，估算调用 6
- 模型请求 26，工具槽 23；耗时中位数 0.4 s，最大 27.3 s（已知 9，未知 0）
- 失败类型：MODEL_TRANSPORT×6

| 需求 | 类别 | 任务 ID | 首次验证 | 最终 | 修复轮 | 失败类型 / 代码 | 模型请求 | 实际 token | 耗时 |
| --- | --- | --- | --- | --- | ---: | --- | ---: | --- | ---: |
| SHOW-01 | SHOWCASE | 7d9b5271-2098-414c-89a8-33bee250c829 | VERIFIED | READY | 0 | — | 8 | 28225 | 26.2 s |
| SHOW-02 | SHOWCASE | f65a7fb4-6710-41ec-a9a1-1ae660bf7d9b | VERIFIED | READY | 0 | — | 4 | 11922 | 18.7 s |
| SHOW-03 | SHOWCASE | 38e065a7-225c-4e26-8381-92a8245b0445 | NONE | FAILED | 0 | MODEL_TRANSPORT / MODEL_NETWORK | 1 | ≥0（1 次未知） | 0.6 s |
| TASK-01 | TASKS | 7e2ca29e-9521-4a46-aa97-1ab1fae9507b | VERIFIED | READY | 0 | — | 8 | 31845 | 27.3 s |
| TASK-02 | TASKS | 219efd2b-bee9-49a6-aa98-99de0b7ef216 | NONE | FAILED | 0 | MODEL_TRANSPORT / MODEL_NETWORK | 1 | ≥0（1 次未知） | 0.4 s |
| TASK-03 | TASKS | 5fc90ad8-7d17-4633-a23f-8f9e4392b90b | NONE | FAILED | 0 | MODEL_TRANSPORT / MODEL_NETWORK | 1 | ≥0（1 次未知） | 0.4 s |
| CAT-01 | CATALOG | d9bfd28b-b18f-4ed9-b60d-b1e57c3e469e | NONE | FAILED | 0 | MODEL_TRANSPORT / MODEL_NETWORK | 1 | ≥0（1 次未知） | 0.4 s |
| CAT-02 | CATALOG | 9878ef9c-f292-4a2b-8381-dcf788049c6f | NONE | FAILED | 0 | MODEL_TRANSPORT / MODEL_NETWORK | 1 | ≥0（1 次未知） | 0.4 s |
| CAT-03 | CATALOG | 3f935da2-23d7-4fcf-ae8d-8d0d562a6234 | NONE | FAILED | 0 | MODEL_TRANSPORT / MODEL_NETWORK | 1 | ≥0（1 次未知） | 0.4 s |

## 故障集（与 9 个需求分开统计）

- 代码故障按预期修复：**0/3**；环境故障按预期停止：**1/2**
- 故障集实际 token：≥32231（4 次未知）

### FAULT-CODE-01（CODE / MISSING_MODULE_IMPORT，基于 SHOW-01）：FAILED

任务 a72f215f-746c-4fb7-8ecf-9c4df663e36a；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_NETWORK

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| injection applied | "APPLIED" | null | **未通过** |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | null | **未通过** |
| first verify | "FAILED" | "NONE" | **未通过** |
| first failure category | "CODE" | null | **未通过** |
| first decision | "REPAIR" | null | **未通过** |
| final | "READY" | "FAILED" | **未通过** |
| repair rounds | "1..3" | 0 | **未通过** |
| acceptance actions unchanged | true | false | **未通过** |
| final source differs from injected source | true | false | **未通过** |

### FAULT-CODE-02（CODE / STRICT_TYPE_ERROR，基于 TASK-01）：FAILED

任务 526ce126-5ab2-4644-b957-dde8cc2d2609；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_NETWORK

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| injection applied | "APPLIED" | null | **未通过** |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | null | **未通过** |
| first verify | "FAILED" | "NONE" | **未通过** |
| first failure category | "CODE" | null | **未通过** |
| first decision | "REPAIR" | null | **未通过** |
| final | "READY" | "FAILED" | **未通过** |
| repair rounds | "1..3" | 0 | **未通过** |
| acceptance actions unchanged | true | false | **未通过** |
| final source differs from injected source | true | false | **未通过** |

### FAULT-CODE-03（CODE / RUNTIME_ASYNC_PAGE_EXCEPTION，基于 CAT-01）：FAILED

任务 23f86a81-2357-4f0a-b95d-3d446c0429e5；最终 FAILED；修复轮 1；失败 BUDGET / AGENT_MODEL_BUDGET_EXCEEDED

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| injection applied | "APPLIED" | "APPLIED" | 通过 |
| injection labelled | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | "HOST_TEST_INJECTION_NOT_SPONTANEOUS_MODEL_ERROR" | 通过 |
| first verify | "FAILED" | "FAILED" | 通过 |
| first failure category | "CODE" | "CODE" | 通过 |
| first decision | "REPAIR" | "REPAIR" | 通过 |
| final | "READY" | "FAILED" | **未通过** |
| repair rounds | "1..3" | 1 | 通过 |
| acceptance actions unchanged | true | true | 通过 |
| final source differs from injected source | true | false | **未通过** |

### FAULT-ENV-01（ENVIRONMENT / CONTAINER_CLI_UNAVAILABLE，基于 SHOW-02）：FAILED

任务 31f9feb1-1b0f-4580-b29b-32f5e0374114；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_NETWORK

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
| container CLI absent in sample JVM | false | false | 通过 |
| final | "FAILED" | "FAILED" | 通过 |
| failure stage | "VERIFY" | "PLAN" | **未通过** |
| failure category | "INFRASTRUCTURE" | "MODEL_INTERFACE" | **未通过** |
| no REPAIR decision | true | true | 通过 |
| repair rounds | 0 | 0 | 通过 |
| REPAIR model calls | 0 | 0 | 通过 |
| immutable candidates | 1 | 0 | **未通过** |
| file tool calls after failure | 0 | 0 | 通过 |

### FAULT-ENV-02（ENVIRONMENT / MODEL_ENDPOINT_UNREACHABLE，基于 TASK-02）：PASSED

任务 abe5b18d-4da1-4754-acb9-116bdefe0532；最终 FAILED；修复轮 0；失败 MODEL_TRANSPORT / MODEL_NETWORK

| 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- |
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

- `batch-complete.json` sha256:a19c32b1d3004ee64009982ecaa6350c1ec8b21380ca9d382b0dffdf7e523ddd
- `batch.json` sha256:95ca64b29a798a6ad360c1c5662e8a039b145f80b37ec313a214cbe88b705364
- `frozen/faults.json` sha256:4b147818de5823b2ba3011cc65f57a08f63270154aa01289af8e7631c8790b13
- `frozen/requirements.json` sha256:ef219f3e5c0f05f3ab03ec854c66b32709349f80d1e1aee0076fe19d2b91cb2a
- `frozen/runConfig.json` sha256:6dc271c657cdb29e72ec052621fc2633ac5d82b8d8d963bfbffccd0d929cb054
- `samples/CAT-01/invocation-result.json` sha256:53c888103364e2d05445c2b1a0f0c9defbbd244df04e66cad8f5fe22498f1a87
- `samples/CAT-01/record.json` sha256:5d2919f5de020a57c908abe28f23623e9f613e4fd6859eca5f124cd91e86b3f5
- `samples/CAT-01/spec.json` sha256:39a4555a74f6c37509563f4882362bb0251c843da4461f957b30bab9e7f33aec
- `samples/CAT-02/invocation-result.json` sha256:197a39d95454de3314ee99c7d5eff2ae5d271ca7ebfeb4a2976443221dbbe8f3
- `samples/CAT-02/record.json` sha256:622747cd5685f15a843b33125710e42150ddad3571c9c06f0d00e11bfcc27dc0
- `samples/CAT-02/spec.json` sha256:47f8cf28317e0a84b8f03e6dd0b10518840f6f00a3274a76fff081730a55b802
- `samples/CAT-03/invocation-result.json` sha256:798ca53bcd061df98703cae089d134dd43482ec5e4f6af5cd8980776f68a1567
- `samples/CAT-03/record.json` sha256:0a9546b8ddfd3160a88187f0388f9e9ebe7556a5d6473a2c241330d7fe0feea9
- `samples/CAT-03/spec.json` sha256:ade5e98bf7170d8683ad25133f1b419c3db9a9810759a37da1177ed412030c2a
- `samples/FAULT-CODE-01/invocation-result.json` sha256:485bda5906d769ee7c86eefcbe563a43f1c3b200751e3c691b4f12017bbdee5a
- `samples/FAULT-CODE-01/record.json` sha256:7f05b3c51cc5147ee693ee4e7a585a38b19e0186a6d5c7362c8b5300a559486c
- `samples/FAULT-CODE-01/spec.json` sha256:28fe8ed27871c39405794d16d6955c0a00531deef2356a964a1285afada9bbb0
- `samples/FAULT-CODE-02/invocation-result.json` sha256:1b43d6b68656d348bdee0d646f222c33f385b097abfda0c521ddc03ec431b13d
- `samples/FAULT-CODE-02/record.json` sha256:e313f86e6f1b49fd222dab6e863ee65f96ac7861c109ccd95427ffd312ba5931
- `samples/FAULT-CODE-02/spec.json` sha256:7833db04fe8ecfa665cc9c0d12c3492dbd064f6d0a14d3851a55b81e3f00fb4f
- `samples/FAULT-CODE-03/invocation-result.json` sha256:522c8d4495ea71790e29a256556d5a17cac58071cb64143888ffae4390d30f97
- `samples/FAULT-CODE-03/record.json` sha256:a02e6c149935fa32014e186366690691486b402fa95f00dbc75b659bd4aaba01
- `samples/FAULT-CODE-03/spec.json` sha256:4b2440a42d6a68e64967c911e9ec9034ba0a4f1ccde739e77be4aae694a597f1
- `samples/FAULT-ENV-01/invocation-result.json` sha256:55f69187ba12e484a085f25996bd28dc7cb18aa24ad28f9ce3ba39607dc1c95d
- `samples/FAULT-ENV-01/record.json` sha256:1b5b1af970bbce0754e06cd0b65d371e496f3005a3fe7c75d1a2d6c789680279
- `samples/FAULT-ENV-01/spec.json` sha256:11f7aed0f00c568c18b3b39f9abf136a0229bae0ff7b5357b632d1c73c50ae14
- `samples/FAULT-ENV-02/invocation-result.json` sha256:99241a5d8b6835d3f76f8d12b017cac96de15f2a075be94fcad66fb02f6f7851
- `samples/FAULT-ENV-02/record.json` sha256:d0550aea8ba37f166817badbd59b11c8ddcc325d5edf5d67a12af7500153f394
- `samples/FAULT-ENV-02/spec.json` sha256:7a55e877d0b167af142b2153bc9ad389d639b3c25aeea8ab364170e05834de89
- `samples/SHOW-01/invocation-result.json` sha256:fa75726409a1788738e9315e11c729ed75c052e4a8478805eff63a0f6774a36f
- `samples/SHOW-01/record.json` sha256:4914380a54484e676cc554cc40e86682de42f8485c2d834d91242e4944fce765
- `samples/SHOW-01/spec.json` sha256:1c7ae5d35665832c60515ee62a4e403100d461f104e798f1b95eba4dd2c69fc1
- `samples/SHOW-02/invocation-result.json` sha256:7a3270d72b1e68d9f676ba0762ca76b2ae23d6c401bb06d390a6f9e3bb05f7d8
- `samples/SHOW-02/record.json` sha256:79c6de913a04bf9c4652c94756892f4bdcc19331ccf291826b80705f25044559
- `samples/SHOW-02/spec.json` sha256:853091cef7eb50c0a5866a0db796ac00fb9b58f6a9d5e5ac1e77525df4a94ea2
- `samples/SHOW-03/invocation-result.json` sha256:7175266cb61b17b449bc2a8c0bb4deee20150a56a1bfea8c2f3049d10dc0268a
- `samples/SHOW-03/record.json` sha256:66bd419e6d40ec32f7d84241beb82159c658d78698ab4f4795f6181f6a066b82
- `samples/SHOW-03/spec.json` sha256:0984d81dfb3c4d110fb2d079804cd7a262bcd20a2e23174151ac7cba4dba984b
- `samples/TASK-01/invocation-result.json` sha256:0139fedbd19e8528774d631e9aaff059a1cd1b1af6e6e70c3d2765804f30598e
- `samples/TASK-01/record.json` sha256:59e4b11cba2fcdea98ad944d4339fa8e57d1eea5125f0a59fcf4f90e8c920d75
- `samples/TASK-01/spec.json` sha256:327886e97ae90078b75f582de29cbb799d62c13274eaed27f4f78956e9a56eee
- `samples/TASK-02/invocation-result.json` sha256:33b033b54db42238e5b20fc5c97da7a84fdec6b02aab64149d4845bd2fa65bc2
- `samples/TASK-02/record.json` sha256:2a39c298efc2ffb16f7f76efd19ad622751edee2d130b1209fdf76a6c0b9ba0d
- `samples/TASK-02/spec.json` sha256:42afd621d8801cb54e46d36df9514e27543733fb90471b4f2d572d92e710bf12
- `samples/TASK-03/invocation-result.json` sha256:41f6bf7c61ee6078e11517393b111793f6a09d39dd2a2fa5b5d2a2ea5105b12c
- `samples/TASK-03/record.json` sha256:0debe5de26ee04f48534eb3855546250fd6728fe607e2a2063bcc5e9e3a2d87c
- `samples/TASK-03/spec.json` sha256:472f3273fc43f0bcd8dd108fed324b2a99b7fc022879255430a1c9ac5dc17995
