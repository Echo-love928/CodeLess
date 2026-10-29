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
