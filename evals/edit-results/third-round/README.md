# D25-B 第三轮映射与独立验收索引

生产候选 fb79c402，A交付 cf80bed8；原九样本冻结评测5/9，CAT03语义补充另列，不覆盖原报告。完整结果/费用/ENV02接受结论及命令见 [报告](../../../docs/evidence/D25-B/third-round-2026-10-30/README.md)。

| 需求 | 原生成任务 | 原不可变版本 | 构建/浏览器 | 截图 |
| --- | --- | --- | --- | --- |
| SHOW-01 | 0db85dbc-3d43-4409-b361-2e5d1ca66ed6 | 4e9a9577-4c70-456d-98b4-447e777964b9 | 0 / PASSED | [离线截图](../../../docs/evidence/D25-B/third-round-2026-10-30/SHOW-01.png) |
| SHOW-02 | 5f5ce810-8f3e-4258-a05d-bc7f37dc9631 | 30b84834-7588-4e0f-bb02-7408157f6016 | 0 / PASSED | [离线截图](../../../docs/evidence/D25-B/third-round-2026-10-30/SHOW-02.png) |
| SHOW-03 | 8f83402f-df0c-4550-bb77-30a30d3d7204 | f2637fb8-4673-4ebd-a452-2559385e447f | 0 / PASSED | [离线截图](../../../docs/evidence/D25-B/third-round-2026-10-30/SHOW-03.png) |
| TASK-01 | f1a5c15e-088e-42ba-9119-d9c151a0c879 | 16b99f26-6002-4fdf-afa8-4f7284a63131 | 0 / PASSED | [离线截图](../../../docs/evidence/D25-B/third-round-2026-10-30/TASK-01.png) |
| TASK-02 | bb4501fa-b19b-4753-b4d8-2862cb58e116 | null | NOT_EXECUTED / NOT_EXECUTED | 无，平台失败 |
| TASK-03 | fb95b253-52d8-4c3f-ba69-a6ae96665be9 | d554200d-128b-4d2c-bdea-901aa87bd5c4 | 0 / FAILED | [离线截图](../../../docs/evidence/D25-B/third-round-2026-10-30/TASK-03.png) |
| CAT-01 | e2eec89d-4cd9-4ca1-a48c-a09e77551e2e | null | NOT_EXECUTED / NOT_EXECUTED | 无，平台失败 |
| CAT-02 | 6b986e9b-4ede-4a81-897d-78a0c3596d6c | a9d1a72f-9561-4bc7-bcbc-35bb6ad69d0b | 0 / PASSED | [离线截图](../../../docs/evidence/D25-B/third-round-2026-10-30/CAT-02.png) |
| CAT-03 | 4ac79e37-046a-4aeb-8490-b273f6381aae | 0e771c76-5c56-448a-a152-9065ef5a4229 | 0 / FAILED | [离线截图](../../../docs/evidence/D25-B/third-round-2026-10-30/CAT-03.png) |

六项编辑及公网页面/封面/下载：index.json 全 NOT_EXECUTED/null。rootGenerationTaskId/rootVersionId 仅标识离线核对的原始基底，不是编辑任务或连续链的待编辑前版本；02→01、03→02、05→03 必须使用每次真实编辑后重新证明的新版本。当前无编辑后版本、差异或真实地址，不制造占位证据。

校验：`node evals/edit-results/validate.mjs evals/edit-results/third-round/index.json`（结构检查，不是业务验收）。CAT03补充脚本与费用复算脚本的命令见完整报告，均不调用模型。
