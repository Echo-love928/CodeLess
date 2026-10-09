# D10-B Windows CLI exit investigation

用户要求解决本地 Windows 重定向门禁 libuv 异常。独立分支 `codex/d10-b-windows-cli-exit`，基线 `3e5c691444b4756148363cda3c1678088d0c170e`，依赖 B 草稿 PR #27；main 与 A 分支、CI、锁及模型预算不变。共享脚本扩展仅限 run-static 的 Redocly 子进程环境和一个5行 helper，另加4项实际 CLI 回归。

已确认的可重复机制：锁定 Node24.16.0 的 Windows 延迟任务调度器在 Stop 后仍可 PostDelayedTask/uv_async_send；Redocly2.54.3 的可选遥测 reachability fetch 异常后，在 beforeExit 回调中 process.exit。用纯127.0.0.1重定向循环复现同一断言：官方机制最小 fixture 强制退出5/5失败（3221226505 / 0xC0000409），自然退出对照5/5成功；同一真实 Redocly 的文件及管道模式6/6原生失败，关闭可选探测后3/3成功。真实 run-static 原脚本私有副本的同一集成回归失败；修订版4/4通过。

[Node官方修复 #61999](https://github.com/nodejs/node/pull/61999) 为调度器增加 has_shut_down_ 标志，Stop 时设置并拒绝后续任务；[锁定版本源码](https://github.com/nodejs/node/blob/v24.16.0/src/node_platform.cc) 缺少该保护。此机制与历史断言一致，但原历史进程没有原生堆栈/远端响应，所以不能还原当次具体响应、认定它是重定向循环或TLS错误。也不关闭其他cleanup/TCP/504/OOM或真实M1失败事件。

当前修复：只给 Redocly 子进程设置 `REDOCLY_TELEMETRY=off`、`REDOCLY_SUPPRESS_UPDATE_NOTICE=true`，均由锁定 Redocly源码支持。实际契约 lint 及真实失败码保留；其它子进程仍继承原环境。不是删除校验、改成功码、关闭TLS校验、添加sleep/retry或升级依赖。四项回归实际运行锁定 CLI，验证默认本地探测失败路径、固定环境成功且HTTP尝试0、无效OpenAPI仍exit1、实际 run-static 仅将环境传给 Redocly。

对照中的所有 fetch 原请求头/体均丢弃并只请求本地合成302响应，没有向 Redocly/模型供应商发送元数据。默认外网遥测矩阵被自动审批拒绝，未执行；改用以上安全对照完成。原200成功fetch、冷缓存和stdio初步测试均未复现断言，这些阴性结果也保留，不能用它们证明根因。归因依据是后续确定性异常fetch/退出和实际CLI调用链。

复现：`node --test tests/infra/static-cli.test.mjs`；`pnpm ci:gate`（原Windows PowerShell文件重定向方式）。命令、退出码与完整门禁结果见 commands.json；独立新证据有 manifest 逐字节摘要。原日志、旧证据和原真实M1包保留。新增付费模型调用0；开发input/output/合计UNKNOWN。

边界：此次消除当前静态门禁的非必需联网触发路径；Node底层缺陷仍存在。彻底修复运行时需维护者统一切换到含上游补丁的版本，同步所有版本锁并重新验证Windows退出fixture，不能只把进程崩溃当成功。历史准确触发响应仍UNKNOWN；真实M1仍NOT_PASSED、没有追加付费任务。草稿PR需同伴批准，不自行合并。