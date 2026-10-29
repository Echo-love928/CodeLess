# B复核：三个文件的现场指纹与Git内容关联

审查提交：`0dbc999cc3712d8c7cb66b032e924a9569bc284c`。
完整本地门禁提交：`9cf78ef1f812aa8377fb7d42215650e78b05b3b9`。
现场指纹来源：该审查提交中的 `evidence/2026-10-29T06-29-39.894Z-gate/command.json` 的 `sourceDigests`。

执行 `node tests/regression/api/verify-source-fingerprints.mjs`，**exit0，三项全部关联成功**。
本命令只读取Git对象和现有文件并生成比对证据，不编译、不测试、不运行门禁或模型。
完整Git blob OID、原始/归一化SHA256、字节数与布尔判定见 [comparison.json](comparison.json)，
两个提交之间的完整三文件差异见 [changes.patch](changes.patch)。Git对象OID与内容SHA256分列，未将两种哈希混为一谈。

| 文件（均在tests/regression/api/下） | 现场记录SHA256 = 9cf78ef Git原始内容 | 当前现场原始内容 = 0dbc999 Git内容 | 当前现场/Git仅CRLF→LF后相等 | 两个版本归一后相同 |
| --- | --- | --- | --- | --- |
| PR-DRAFT.md | 是 | 是 | 是 | 否 |
| README.md | 是 | 是 | 是 | 否 |
| summarize.mjs | 是 | 是 | 是 | 否 |

这三个文件本次现场均为LF。历史指纹直接匹配门禁提交的Git原始字节，当前字节直接匹配审查提交；换行归一化后关系仍成立。
**历史指纹不能直接套用到当前版本，也不能把版本间的实际内容变化说成仅换行差异。**

- PR-DRAFT.md：运行后补充已完成的门禁、文档建议处理及剩余限制。
- README.md：运行后增加新门禁复算说明，原FAILED报告仍保留。
- summarize.mjs：运行后扩展报告输出位置、保留历史失败/UNKNOWN、把API指纹检查由5份加强为233份，并增加预览用例汇总；没有修改成功判定所依赖的原始阶段退出码。该文件为事后报告工具，不是门禁入口。

核对的门禁入口/版本文件包括根package/锁/工作区声明、ci-gate/run-static/run-maven/契约及版本校验脚本、API pom/Maven wrapper、记录器和stage-observer；两个提交之间及当前工作区均无差异。API源码目录同样无差异。逐项守卫结果在comparison.json。

原完整本地385/385、268/268、75/75与全产品通过报告未重算、未替换，原失败与502根因UNKNOWN也未改动。
0dbc999远端六项success单独保存在 [checks-0dbc999.json](checks-0dbc999.json)；后续证据提交的新HEAD不继承该检查状态。
正式批准仍由B决定，本人不自批、合并或发布。
