# D25-B 编辑证据对应表

产品候选：5de2e6cf995c95ee91a1f9dc40403654df0af3de。REAL 索引 index.json 的六项保持未执行；下表单列 MOCK 源码 fixture，task/version/address 不存在，不证明平台在线编辑或历史版本保护。

| 需求 | task/version/address | 构建 | 截图 | 差异 |
| --- | --- | --- | --- | --- |
| EDIT-01 | null / null / null | e491f3c4-6d69-4866-a1d1-6c2d0ad97621, exit 0 | [前](../../../docs/evidence/D25-B/EDIT-01-before.png) / [后](../../../docs/evidence/D25-B/EDIT-01-after.png) | [源码前后](./EDIT-01-fixture-diff.json) |
| EDIT-02 | null / null / null | f6216b17-6560-42d9-b00c-9cb0beae47e6, exit 0 | [前](../../../docs/evidence/D25-B/EDIT-02-before.png) / [后](../../../docs/evidence/D25-B/EDIT-02-after.png) | [源码前后](./EDIT-02-fixture-diff.json) |
| EDIT-03 | null / null / null | 93462ca0-ab3e-4d07-b4a6-b308757b9ad6, exit 0 | [前](../../../docs/evidence/D25-B/EDIT-03-before.png) / [后](../../../docs/evidence/D25-B/EDIT-03-after.png) | [源码前后](./EDIT-03-fixture-diff.json) |
| EDIT-04 | null / null / null | fe458089-babe-4567-9216-2091e8bf3430, exit 0 | [前](../../../docs/evidence/D25-B/EDIT-04-before.png) / [后](../../../docs/evidence/D25-B/EDIT-04-after.png) | [源码前后](./EDIT-04-fixture-diff.json) |
| EDIT-05 | null / null / null | 5fe448c6-063c-4615-9297-7fd3fced25e2, exit 0 | [前](../../../docs/evidence/D25-B/EDIT-05-before.png) / [后](../../../docs/evidence/D25-B/EDIT-05-after.png) | [源码前后](./EDIT-05-fixture-diff.json) |
| EDIT-06 | null / null / null | 1c904bba-7c2e-4590-a637-56461ee75c73, exit 0 | [前](../../../docs/evidence/D25-B/EDIT-06-before.png) / [后](../../../docs/evidence/D25-B/EDIT-06-after.png) | [源码前后](./EDIT-06-fixture-diff.json) |

真实发布页面、封面与下载当前均未采集；完整链 MOCK 另见 docs/evidence/D25-B/verification.json。所有失败和阻塞见 docs/evidence/D25-B/issues.md。

结构核验：`node evals/edit-results/validate.mjs evals/edit-results/D25-B/index.json`。该命令不访问业务运行时，不能替代业务验收。

## 本轮平台链（deterministic-mock）

同一产品候选、真实 PG/Docker/Chromium，retries=0；本地 HTTPS 地址已随测试清理失效。封面专项不由这组完整链证明。

| 用户 | 编辑任务 | 前版本 → 后版本 | 发布及下载证据 | 截图 |
| --- | --- | --- | --- | --- |
| 1 | bb4c16e0-eacc-4d46-8a90-0b6612e3da9e | 1ab32616-2b8e-4c2f-8d56-321799b7f4a4 → 18997358-d7d6-4831-9498-ec0f2dfc78c6 | publication=7e539785-e94a-8f49-8081-275f7749c046；[状态/地址/ZIP清单及摘要](../../../docs/evidence/D25-B/full-product.json) | [完成画面](../../../docs/evidence/D25-B/user-1-complete.png) |
| 2 | 3d80c164-58d4-4543-ab26-5e9adf38210d | 59e05a6a-4548-4b2b-9d1d-a5f08a9a18ec → f6f2041d-2eb5-46ab-84dc-f4630848d78b | publication=af49b15f-dc4c-8b3d-b7e7-a65ca0088b4e；[状态/地址/ZIP清单及摘要](../../../docs/evidence/D25-B/full-product.json) | [完成画面](../../../docs/evidence/D25-B/user-2-complete.png) |

失败任务 10a8f97c-15be-42f7-81e7-3fc5d2b8ed4b；[保留旧版本画面](../../../docs/evidence/D25-B/failed-edit-keeps-old-version.png)。发布页访问与刷新 HTTP 200、导出 ZIP 内清单/摘要核验由原验收断言执行，完整记录与原报告 SHA256 在 full-product.json；这些不是本轮 REAL 原批次成绩。
