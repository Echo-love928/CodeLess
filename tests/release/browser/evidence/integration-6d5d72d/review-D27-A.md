# PR93 精确 HEAD 只读复核

审查目标 `94ab4ddccf5cedb7d62ddb94e73ab026d009f8fe`；选定 A 原源码 `1f072dc361bd6e05b899390c7e84678711716f20` 仅作历史对照。已按用户指定 fetch/read handoff/cat-file，A HEAD 合入 B 隔离分支，未批准、评论、合并或修改 A 分支。

## 阻塞

1. `services/api/src/test/java/dev/codeless/api/agent/AgentLoopIntegrationTest.java:158`：精确 A HEAD 的 Actions 41284105720 / API job124781789181，`pnpm verify:api` 原生退出1，428项中1失败，expected `AGENT_ACTION_FAILED` / actual `AGENT_CLEANUP_FAILED`。详见 a93-failure.json、a93-ci.json。原因 UNKNOWN；组合源码本轮 CI 成功不关闭 A 此次失败。
2. 原 runner284/285、ci-gate=1：queue 腾位 rm 的 ENOTEMPTY 仍 UNKNOWN；生产 queue 未改，原始报告/日志摘要完整保留。受控迟写模型可复现同类原生错误，不能证明历史写入者。
3. 缺 D27 部署主机/部署SHA/真实reviewer会话，缺 D23 私密演示库同摘要备份；公网登录预览/下载/真实会话隔离及独立真实库兼容验收仍 BLOCKED。

## 已独立核验

- `scripts/release/api_release.py`：Git固定源码、受信包外manifest摘要、路径/链接校验及模块导入预检。`python -B tests/release/api/test_release.py` native0，16/16；原始日志 `.local-data/d27-b/api-unit-review.log`，摘要见 review-checks.json。
- 组合6d5d72d封存API：`python -B tests/release/api/live.py --package .local-data/d27-b/combined-6d5d72d/release/api --manifest-sha256 bd7997e5a8e3c7fd8e3270b6ea48f48898dbb38d78bc40b33d8321c341f8711e --output tests/release/api/.private/b-review-6d5d72d-live` native0，40项；真实空库安装、合成V4→V5、备份恢复与失败边界，cleanupErrors=[]。api-live.json 明确 ACTUAL_DEMO_BLOCKED；未复制 A 的真实D23库22项成功。
- API259项文件，JAR摘要与 A 原选定JAR相同；B新manifest绑定组合提交与本机日志，不冒称 A 原封存包。两包113个重叠文件严格相同；两根真实 bridge→Docker→Chromium→receipt native0。

## 建议

`scripts/release/api_release.py:186` 的 toolchain 字段含声明常量，javaVersion另有实际输出；建议将来补充各工具实际版本探针。本轮 B 按锁定Java21/Node24.22.1/pnpm12.6.0构建。安装依赖应在封存API repository的runtime副本进行，随后复验源文件摘要，不能修改封存包导致清单失效。

结论：打包完整性与本机组合桥契约通过；发布仍 HOLD。未自批、未合并、未部署。
