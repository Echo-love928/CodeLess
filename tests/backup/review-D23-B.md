# D23-B 只读互审登记

本轮查询：GitHub REST `GET /repos/Echo-love928/CodeLess/pulls?state=open&per_page=100` 返回 open PR 0；D23 PR 0。`git ls-remote --heads origin '*d23*'` native 0、空结果；最新 main `26b95e3` 中无 D23-B 交接、契约差异或测试报告。此登记早于本卡草稿 PR 创建，不把后续 D23-A PR 算作 B。

## 阻塞问题

- **缺少审查对象/证据（P0 集成阻塞，不是已发现的 B 代码缺陷）**：未取得 D23-B 精确 PR/提交、契约差异与原始报告，不能批准，也不能声称全新安装通过。影响 M4 与 D23-A-T4 的最后启用组合验收。
- 本机 Docker 不可用，因此没有重新演练 B 的全新安装、真实模型或导出容器。未用已有 D22 结果补写 D23 通过。

## 建议

1. B 提供精确提交、安装命令逐步退出码和 mock 演示浏览器报告。模型配置的真实请求单独记账；没有新的费用授权时不重跑付费模型。
2. 安装清单包括固定 release 包、所有数据根、独立 PG cluster、服务账号和权限；环境模板只用占位符。
3. 恢复环境必须沿用原**绝对数据路径**：`services/runner/src/preview/registry.mjs` 的 `readEvidence` 校验 journal/receipt/report 中的原始路径。不能通过改写不可变证据适配搬迁。操作协议见 `docs/operations.md` 第 3 节。
4. 对恢复后的同一版本真实登录/预览/源码下载，在新隔离容器运行 `tests/export/clean-build.mjs`；保存版本/摘要/截图/ZIP/退出码。不能只证明 fixture 页面可打开。

## 已核验内容

| 重点 | 只读结论 |
| --- | --- |
| 陌生使用者按文档跑通 mock 演示 | 未核验，缺 B 文档与精确报告 |
| 填入模型配置后真实请求完成 | 未核验，缺 B 证据；本卡未使用/新增模型凭据 |
| 环境模板无真实密钥 | 仅核验本卡 `infra/backup/*.example.json`，专项秘密哨兵通过；B 环境模板未取得 |
| 源码导出样例可独立构建 | 已读取原 `SourceExportController`/`ExportTemplate` 与隔离构建测试器；B 新导出包/真实构建未核验 |
| 范围、失败分支、测试强度 | 本卡未修改 B/公共契约/CI/根锁；B 的实际 diff 未取得，不作无证据评价 |

后续只读审查按“阻塞问题 / 建议 / 已核验内容”补增量与具体文件行号，不为了互审配额制造修改。当前未提交正式 GitHub review，未批准任何 PR。
