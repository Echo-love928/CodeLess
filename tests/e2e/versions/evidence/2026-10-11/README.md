# D11-B 证据说明

四张 PNG 来自真实 Chromium 的 production 平台 UI；API/auth/source/预览页面为明确 fixture。
源码与页面的相同版本切换证明前端行为，不代表缺失的 D11-A 后端/持久化联调通过。
fixture 的 sourceDigest 是测试值，不作为真实内容哈希证据。

commands.json 记录命令、实际退出码、范围和原完整 gate 日志 SHA256。
api-summary.json 只投影本次 JUnit 的 suite/count/失败测试名称；
api-build-failure.json 投影一个实际 runner.result 的失败/构建/清理，不含凭据。
API的 EIO 根因未知，25 failures/1 error 不能被其他通过结果关闭。

提交的日志只移除每行尾部空白与多余文件尾空行，未改错误、断言、次数或退出结果。
static.log / runner.log 是原 ci:gate 的阶段片段；完整未规范化日志仍在工作树
.local-data/d11-b/ci-gate.log。其余原日志也在同目录，失败和成功分开保留。
e2e-final.log 是两处旧预览定位精确化后的完整 verify:e2e（41/41）。
static-final.log 是单测增加 RouterLink stub 后的最后完整 verify:static（53/53）。
没有发布/签名 bearer URL、平台 cookie、TLS私钥或付费模型请求内容。
