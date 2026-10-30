# D25-B 问题与阻塞

| ID | 状态 | 影响与复现/解除条件 |
| --- | --- | --- |
| D25-RUNTIME | BLOCKED | 2026-10-30 已收到 A #82 / 9ad40a0 公开批次与身份交接，原执行提交 a863b76；A 保留原数据库/私有根，曾预检 6/6，旧 owner 后来 401。本机不存在交接中的 F:/JAVA/CodeLess/CodeLess 和 session.private.json；公开 PR 不含 SQL/私有根或有效会话，无法在本机凭公开源码重建原身份/刷新会话。六项真实编辑及公开页面/封面/下载仍 NOT_EXECUTED/null；先在原设备恢复登录或私密交接保留导出，再预检/执行，不造原版本。连接复核见 mode-review-fix.json。 |
| D25-PEER | REVIEWED_HOLD | 2026-10-30 已只读审查 A #82 / 9ad40a0，独立复算 7/9 需求、1/3 代码、2/2 环境，整体 HOLD，未批准。A 反馈的 B 行 mode 缺陷已修复并补先红后绿反例，待 A 增量复审；双方真实验收和批准仍未完成。原 10-29 查询 [] 只属历史快照。 |
| D25-MODE | FIXED_PENDING_REVIEW | bd6188f 可将六个显式 MOCK 成功行计为 REAL；validate 现在对全部九行断言 row.mode===index.mode。两项新增测试先红（4/6、exit 1）后绿（6/6、exit 0）；原真实索引仍 executed=0、acceptance=null。合成反例不作为真实编辑成绩。 |
| D25-HISTORY | OPEN | D21 最新交接需求行为 7/9，真实编辑 0/6；D24 本地 hosting EPERM 未归因。只作为历史风险，不计本轮失败或成功；不得用本轮 fixture 清除此状态。 |
| D25-SETUP | RESOLVED | 克隆检出因 Windows 长路径失败；独立 clone 设置 core.longpaths 后恢复完整检出与索引，开发前 status 干净。首次离线安装缺 pnpm metadata，随后正常权限按 frozen lockfile 安装成功。未改锁文件。 |
| D25-LOCAL-GATE | CANCELLED | 初始 PR 提交六项远端 CI 全成功后停止重复本地聚合；本地仅 static 完成、API 部分执行，runner/e2e 未到达。取消不是测试通过或产品失败；原生总退出码 UNKNOWN，详情 local-cancellation.json。最终 HEAD CI 另行重跑。 |

新的测试失败与退出码追加在 verification.json。候选保持 HOLD；不得合并或发布通过声明。
