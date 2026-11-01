# 同服务器受保护验收辅助工具

这些脚本是61df15e验收的维护者工具，不是模型工具、用户HTTP接口或封存产品的源提交。实际产品源码仍为完整SHA `61df15eba456422762a667aaed7734b7d13b48e7`；报告提交可能仅追加辅助工具/证据，不能据此改写产物身份。

- `activate-61df15e.py`：仅Linux root。默认只读预检；`--activate` 需维护者明确授权，调用者必须先核对精确源提交六项CI全绿。检查源/资源摘要、Linux10项、真实库副本和IPC链，成组备份后切换固定repository/JAR/web/OPS worker/tag。启动失败恢复旧文件/服务/tag，不自动覆盖数据库。当前候选已启用，勿重复激活或覆盖现有证据。
- `authenticated-download.mjs <repository> <public-proof.json> <fresh-private-output>`：仅同主机低权限evaluator。私密凭据由受保护维护者在匿名stdin传入，不放命令参数或仓库。真实浏览器选版本/预览/下载，下载实物与同一认证会话独立GET内容SHA256一致，验证真实平台cookie不进入新站点。独立GET避免CDP在CDP无法取得该resource body的问题，不替换真实UI下载。
- `ipc-composite-61df15e.py`：仅独立候选的非root worker角色。fixture进程覆写模块内Root和测试peer UID，使用真实Unix socket、生产binding/handle和Docker/Chromium，不是正式HTTP/角色验收；正式API peer UID/权限另由Linux10项及真实公网链证明。
- `real-backup-compat-61df15e.py`：同主机root维护者，对已核验的D25真实回退备份创建独立PG，禁任务/后台生成，启动封存JAR，用原demo账号做读/源码ZIP和账本不变检查；秘密仅在服务器进程消费，结束清理带专属标签的PG。**不能替代D23规范机密备份22项**。

配套生产入口仍是 `infra/public/run-acceptance.py`、`check-final.py`、`check-external.mjs`。所有本轮原生退出码、Hash、公开数据和限制见 `../evidence/final-61df15e/`。辅助源码按Git LF保存，执行现场文件SHA与公开Git LF SHA分别列于operator-harnesses.json；这不用于归一化放行产品包字节差异。

评审账号密码、cookie、token、私钥不写入Git或从服务器导出。公开报告只保留ID、路径、摘要、计数和布尔结果。完整原始日志/备份/ZIP在受保护或忽略目录。
