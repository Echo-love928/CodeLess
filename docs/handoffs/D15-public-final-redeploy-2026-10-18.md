# A 方复审后：发布目录隔离与最终提交公网复验

2026-10-18。A 已用非作者账号 yuanqizuimeng 对 `6d55d55b70d71bf8c8828e16154ad4314a5111de` [正式批准](https://github.com/Echo-love928/CodeLess/pull/46#pullrequestreview-5563127639)。本轮按其建议 1、2 修正权限并重新部署；新增提交须重新核对受影响门禁与复审，不将旧批准冒称新提交批准。人工决定是否合并，main 不修改。

## 权限修复

- `publication/sites` 改为 worker 所有、0755、IPC 组；API/preview 的共享组不再有父目录写权，不能重命名/移除/替换已发布目录。公开内容仍由 worker 创建为目录 0755、文件 0644、私有 receipt 0600，staging 0700。
- API 取消 sites 的 `ReadWritePaths`，API 与 preview 都显式 `ReadOnlyPaths=/srv/codeless/publication`；worker 保留该路径写权限。
- 正式 Java 网关构造函数要求 hostingRoot 可读，写入仍走带 peer UID 校验的固定 worker IPC。POSIX 配置回归将目录设为 0555 后验证实际 bean 可启动，未放宽发布校验。
- `check-publication-permissions.py` 同时验证主机 DAC 和各实际运行服务 MainPID 的 mount namespace：API/preview 读取可用，而创建、覆盖、unlink、rename 均拒绝；worker 正向写删通过。只操作不可路由的随机 dot canary，现有 UUID 发布内容仅只读扫描 owner/mode。

## 最终哈希与新验收

以冻结的 Git 提交生成源码档案和逐文件 SHA256 清单，在 Linux 非 root 验证后构建 JAR/Web。部署记录 `/srv/codeless/deployed-release.json` 绑定 commit、archive/manifest/JAR hash。停服务替换前保留旧运行包和服务文件；保留数据库、TLS 和受保护配置。安装后逐文件及安装的 worker 字节核对。

新验收命令必须显式指定 `--run-id` 和 `--commit-sha`。操作员入口拒绝任何已存在的 private/public run 目录，不恢复历史 checkpoint。运行前后验证该提交全部源码和 JAR；新公开证明保存 deployedCommit/hash/freshRun。旧公开证据和失败记录保留。

完成顺序：Linux 受影响测试/package → 最终提交 CI → 安装/角色与命名空间检查 → 新同服务器真实 UI/API 发布（含并发编辑、幂等、真实探测失败保留旧成功）→ 独立外部正常 DNS/TLS/资产 hash/路由刷新与私有文件拒绝 → SQL、源码/JAR、权限收尾核验。全部满足才生成本轮公网汇总，不将资源预检、历史成功或本机 fixture 当作新公网成功。

本轮新证据位于本机 `.local-data/d15-public-final-redeploy-2026-10-18/` 和服务器对应 run 的 public-evidence 子目录，结果链接及精确提交写入 PR #46。此文档不提前声明待执行验证成功。历史证据见 [上一运行包交接](D15-public-acceptance-2026-10-18.md)。

本机首次受影响 API 组合因 Docker 不可用退出 1，配置 4 项与不依赖 Docker 的 5 项回归、Python AST 通过；原失败日志保留，Linux 和 CI 结果单列。真实模型仍为 deterministic-mock，不能据功能链路证明真实模型质量。
