# D11-B 原机器 EIO 调查与修复

2026-10-12，原 Windows 机器、Docker 29.8.0、原锁定 D05 镜像；没有升级 Docker、修改宿主权限或降低生产隔离。

## 已证实的触发条件

真实 runner 在 API 原深层工作目录以 user1000 构建，正常环境及 Java 网关环境白名单两组均得到 BUILD_EXIT、原生 exit1、`EIO: i/o error, scandir '/input'`，清理均确认成功。因此不能把问题归因于 Java 的环境过滤。

使用同一固定、只读目录探针、同一源内容、不可变镜像及隔离参数：

| 对照 | 结果 |
| --- | --- |
| 浅层目录，user1000 / 仅诊断用 user0 | 均 exit0，可以读取 |
| 原 API 深层目录，user1000 | exit1，stat/readdir EIO |
| 同一原 API 深层目录，仅诊断用 user0 | exit0，可读；共享层呈现 uid/gid0、mode0777 |
| 单个长目录组件，宿主路径119/139/159/179/188字符，user1000 | 五组均 exit0 |
| 13个宿主路径组件、99字符，user1000 | exit0 |
| 21/22个组件、127/121字符，user1000 | 两组 exit1、EIO |

因此已隔离到原机器 Docker Windows 文件共享层对深层宿主绑定目录的非root读取；总路径长度、Vue内容、Java环境过滤均不足以解释失败。宿主目录为普通 NTFS 目录且继承ACL相同。尚未确认 Docker/内核内部机制或精确深度阈值，不声称这是已获上游确认的缺陷。user0只用于可信固定诊断程序，从未执行生成代码，生产继续 user1000。

## 最小修复及复现

`services/runner/src/build/runner.mjs` 在 Windows 将一次性 input/output 副本放在工作账户的规范化 TEMP 浅层随机目录；持久源码、版本与产物根路径保持原配置。源验证、非root、只读输入、无网络/能力/密钥/socket、资源限制及清理断言保留，Linux继续使用配置工作根。

深层工作根真实 Vue 回归：

```powershell
node --test --test-name-pattern='deep configured work roots' tests/runner/build/acceptance.test.mjs
```

修复前原生 exit1、EIO；修复后完整 runner acceptance11/11、exit0，没有跳过。完整阶段门禁另记录最终结果。原始失败、探针、日志和原生退出码保留在 `.local-data/d11-b/eio-investigation/`，新公开投影记录各原件 SHA256；原2026-10-11/12失败证据不覆盖。

## 独立复核补充

复核发现浅层TEMP可能位于C盘而配置产物位于E盘，原子rename会EXDEV。新增 `promoteArtifacts` 只对EXDEV回退：有界普通文件读取、冻结实际字节并核对原摘要、产物卷私有临时目录CREATE_NEW写入，最后原子晋升。其他错误保持失败，变化/超限不发布，失败清理只针对所属目录。

```powershell
node --test tests/runner/build/promotion.test.mjs
```

三项明确故障注入测试3/3、原生exit0，独立复查关闭该问题。这不是实际E盘联调；不能将故障注入描述为另一盘符上的实测。新增测试通过现有 `tests/infra/build.test.mjs` 纳入必需runner门禁，原安全/失败测试未删除。

## 范围及批准

独立只读复核分两次检查生产差异：第一次发现上述跨盘问题；修复后只重查新增和受影响范围，未发现其他可操作问题。V5来源回填/FK/冻结、owner检查、public OpenAPI集成未发现新增问题；安全载荷fixture为摘要审阅，不把它当独立重跑。

该复核用于缺陷发现，不能代替另一成员对B最终提交的正式GitHub批准。PR34作者为Echo-love928，本账户不可自批。A acdc183及main413e5b8保持不变，旧A批准不涵盖B新增维护者变更。
