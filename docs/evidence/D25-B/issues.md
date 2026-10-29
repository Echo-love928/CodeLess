# D25-B 问题与阻塞

| ID | 状态 | 影响与复现/解除条件 |
| --- | --- | --- |
| D25-RUNTIME | BLOCKED | 未提供本候选的原批次在线 API、owner/audit 会话、完整保留快照及 D25-A 交接；环境仅有模型配置，无 CODELESS_EVAL_API_URL / 两个会话变量。六项真实编辑、公开页面、封面与下载均 NOT_EXECUTED/null。按 demo 脚本补齐输入再采集；不能拿历史失败基底或 MOCK 替换。 |
| D25-PEER | BLOCKED | 2026-10-29 `gh pr list --repo Echo-love928/CodeLess --state open --json number,title,headRefName,headRefOid` exit 0，结果 []。无 D25-A 候选，未完成同伴审查/批准。 |
| D25-HISTORY | OPEN | D21 最新交接需求行为 7/9，真实编辑 0/6；D24 本地 hosting EPERM 未归因。只作为历史风险，不计本轮失败或成功；不得用本轮 fixture 清除此状态。 |
| D25-SETUP | RESOLVED | 克隆检出因 Windows 长路径失败；独立 clone 设置 core.longpaths 后恢复完整检出与索引，开发前 status 干净。首次离线安装缺 pnpm metadata，随后正常权限按 frozen lockfile 安装成功。未改锁文件。 |
| D25-LOCAL-GATE | CANCELLED | 初始 PR 提交六项远端 CI 全成功后停止重复本地聚合；本地仅 static 完成、API 部分执行，runner/e2e 未到达。取消不是测试通过或产品失败；原生总退出码 UNKNOWN，详情 local-cancellation.json。最终 HEAD CI 另行重跑。 |

新的测试失败与退出码追加在 verification.json。候选保持 HOLD；不得合并或发布通过声明。
