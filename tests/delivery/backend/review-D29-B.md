# D29-A 对 D29-B 的只读审查

**历史快照：仅适用于28037c5。** 用户随后取消真人彩排和完整录像；原第3项实物要求不再构成缺口，未伪造已执行。B最终cc60340的受影响变更另见 [增量复核](review-D29-B-final.md)，本页旧结论不作为最终候选的阻塞或批准。

日期：2026-11-04（Asia/Tokyo）。[PR97](https://github.com/Echo-love928/CodeLess/pull/97)，候选 `28037c53e780cbc543f8c3668497765afd5c495e`，基线 `aefaca193af3019bcadbcf8fdf3f6424baee750c`。读取全六文件（3份手册/脚本/交付、交接、2个测试工具）；未修改B文件、未发表评论、未批准。后续head更新须增量重查。

## 阻塞问题

1. **当前交付状态引用了过时的历史快照。** `docs/delivery/frontend.md:9–11` 把0a7阶段的6/9、生产61、未部署和cover待验写成当前事实；`:25–26`据此要求A重新修复并部署。`docs/demo/full-script.md:9`及`:22`也继续口播D28质量HOLD/生产cover阻塞。反证位于基线已存在的 `tests/release/api/evidence/d28-final-review/{summary,quality,live-identity,live-cover}.json` 和 `docs/handoffs/D28-A.md` 顶部：最终1fe已独立验收，需求增量组合8/9（TASK-03仍失败）、代码故障3/3、生产同源与cover实物已核验。影响：两位操作者会讲出相互冲突的“当前”事实，甚至在D29无新功能日重复已交付修复/部署。复现：`git show 28037c5:docs/delivery/frontend.md`，对照 `git show aefaca1:tests/release/api/evidence/d28-final-review/summary.json`。最小修正：保留6/9原批次为历史，增加最终候选索引；不能改写旧批次为8/9、不能把增量组合写成一次全量9/9，也不能声称D29已现场重测。

2. **门禁报告没有随该候选可获取交付。** `docs/handoffs/D29-B.md:33` 引用 `tests/release/d29-evidence/verification.json`，但该文件不在PR六文件diff或该候选Git树中，也没有受控获取定位。`tests/release/d29-record-gates.mjs` 是运行工具，不能代替已执行的原生结果。复现：`git cat-file -e 28037c5:tests/release/d29-evidence/verification.json` 非零。影响：不能复核四门禁和ci-gate的命令/退出/失败原件，尤其不能继承D28结果。最小修正：交付去敏回执（真实code、signal、日志摘要、精确源码身份、私有原件获取方式），保留所有失败；不要把完整潜在敏感日志直接提交。A没有执行B的全量gate recorder，也没有代填其结果。

3. **接纳必需的真人操作、录像及界面实测尚缺。** `docs/demo/full-script.md:40` 起、`docs/handoffs/D29-B.md:11–15/21–24` 如实标为NOT_RUN/BLOCKED；这一表述正确，但仍未达到两人独立演示、完整备用录像及候选UI一致性的任务验收。影响D29-B-T1/T2/T4及共同M6前置。按其脚本逐轮完成并交接原件后才能关闭；A自身同样缺换手，不把自动化2用户或文件走查计作真人完成。

## 建议

- 当前文档测试只校验本地链接和关键控件名，不检查状态事实或反引号中的报告路径。建议在补齐报告后加入必要的报告存在/身份核验，避免本次2/2绿灯被误解为材料全部完整。
- `tests/release/d29-record-gates.mjs` 的路径使用固定输出且每次覆盖；补证时使用唯一run目录并保留旧失败，避免 `--configured` 再次执行覆盖初次结果。不要为修文档重跑没有变化的全量付费/部署流程。

## 已核验内容

- `python tests/delivery/backend/audit.py peer` 原生0；从精确Git blobs复制到 `.local-data/d29-a/peer97-<SHA>` 后执行B原 `node --test tests/release/d29-docs.test.mjs`，2/2通过、无skip。日志SHA和每份源blob摘要在 [peer97.json](evidence/peer97.json)。这不证明业务操作通过。
- 六文件无产品、契约、锁、CI、迁移变更；没有引入开放shell、任意依赖安装或降低原断言。
- 手册说明普通用户所有权、管理员入口、共享源码组件影响、预览/待发布/下载版本差异、取消与未知状态、失败后保留旧版本。
- 脚本明确现场REAL、现场deterministic-mock、历史录像三种模式；录像未制作即不填链接；两轮必须不同用户/应用，观察者提示会记为未独立完成。
- 尚未验证公网/受控视频链接、实际声音画面、真人独立操作、候选浏览器逐步一致性。没有发现本次六文件含实际秘密；这是可读材料审查，不是全历史秘密扫描。

审查结论：**REQUEST_CHANGES（本地只读结论，未提交GitHub批准或审查动作）**。作者修复后只复核变更和受影响材料；不得因本文或2/2文档测试声称已批准。
