# 可直接复制给 B：D26-A 修复后的增量复审与剩余阻塞

你负责 D26-B 的增量复审与组合封口，请继续保持 HOLD，不批准或合并。A 的新代码位于独立分支 `codex/d26-a-cleanup-followup`，源候选 `222bc904fecec66f6f8be42ec041b0f44889d3eb`，基线是 PR88 最终6ceeb5a。新载荷尚未上传（自动审批要求单独公开授权）；新草稿PR链接待授权后补充。不要把PR88旧HEAD当成本轮修复。

A 已完成：

1. 修复两个截图文件的私有启动协议：worker 必须等父进程记录并授予启动许可后才能启动 Chromium；到期/取消后不许可。只有自有 worker 已关闭且清理证据充分，或明确从未许可，才确认清理。许可已给/未知且无证据仍 false；截图超时仍 FAILED，不改成成功。旧代码真实无许可仍fork的红测、修复后的正常/拒绝路径均保留。未放宽原150ms断言、清理时限、重试、隔离或权限。
2. 核对你提供的四份原件差异，全部精确匹配 A 原混合换行文件的统一CRLF检出形式；原始字节与摘要已交付。冻结器绑定固定PR88 Git blob并列出允许的检出形式，原 `release-freeze.json` 不改，旧严格检查保留为 `check-raw`。两份运行时提示词检出换行仍拒绝，需显式恢复成原冻结字节；未知内容不覆盖。
3. 找到 A 原机完整日志，全日志摘要与旧回执一致；交付原完整 runner 阶段54875字节及摘要/字节范围。原daemon历史image events查询返回0条，不能定位删除者，故原镜像失效机制仍 UNKNOWN。
4. 在 A+B+PR89 的独立组合候选3a0d786上完成真实门禁：static0（Node64/UI206）、API0（428/428）、runner0（285/285，0失败/取消）、E2E0（80/80，随后真实完整平台发布/下载链也通过）。源码与HEAD执行期间未变；组合生产Git内容与A源候选相同。新增边界10/10、固定PR89原截图专项7/7通过。完整runner包含原D19隔离11项；没有另跑你的原“串行21项”入口。总ci-gate未重跑，不填success。
5. A 自己的诊断观察器曾干扰两次运行，已修复并保留其失败、明确排除为生产根因证据；正式组合验证没有加载观察器。PR89仍只有失败消息增强，不能称为修复。

请 B 做：

1. **增量审代码**：只重点审两个截图文件、冻结器/恢复工具和对应测试。检查先记录许可后发送、截止/取消不许可、未知清理不重试，不能把缺少IPC消息当成“没有浏览器”。确认没有改原断言、隔离、依赖、公开API/提示词内容，且没有秘密。不要扩大到整仓重构。
2. **核验冻结身份**：从仓库根运行 `node tests/regression/release-api/freeze.mjs check`。若仅两份已知提示词换行不符，先运行 `node tests/regression/release-api/restore-runtime-bytes.mjs` 只读检查；确认已知摘要后才能显式加 `--write`，保留备份并重新check。未知内容必须保留并报阻塞，不重新capture旧冻结。核对四份 `.raw` 与 `peer-byte-verification.json`，7份原失败摘要不得变化。
3. **核验当前组合**：用授权后公布的精确A候选+B b0fc773+PR89 30a2474重放受影响回归；至少核验 `record.mjs followup`、原完整runner/E2E及你原隔离入口的真实结果。发布/下载必须同一版本，错误与未知仍可见；截图不能任意访问内网。最后启用功能的PR承担真实联调，当前仍不启用capture。已有回执可先只读复核；不要为凑次数重跑失败或改时限取绿。
4. **继续登记原事故**：A旧276/285镜像失效，以及你旧283/285的429超时/404 null都不由新绿色覆盖。若原环境再次出现，使用PR89记录原生signal/cleanupProof；镜像问题需同次build/inspect/tag/untag/delete/create与调用者时间线。两轮无进展先交根因假设、尝试和最小复现，再协调维护者；不盲改共享入口或清理镜像。B原cleanup失败没有cleanupProof，当前IPC缺陷的修复不能倒推出原历史精确根因。
5. **三类给结论**：“阻塞问题 / 建议 / 已核验内容”，附精确文件位置、候选SHA、命令、原生退出与证据。原REAL需求6/9、批次13/14、自然REAL FAILED与生产capture缺口继续HOLD；mock、fixture和独立通过不能补真实分母。未批准、未合并；新HEAD检查不得继承旧success。

交付资料都在仓库：`docs/handoffs/D26-A.md` 顶部最终补记、`docs/release-blockers.md`、`tests/regression/release-api/evidence/followup-2026-10-31/verification.json` 与 `production-identity.json`。本轮原生结果目录分别是12-51-27 runner、13-00-43 E2E、13-05-34 static、13-06-23 API（均2026-10-31 UTC）；完整日志本机私有，公开只含去凭据回执与原runner阶段原件。开发token未知，新增付费模型调用0。
