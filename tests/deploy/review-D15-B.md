# D15-B 只读互审

2026-10-14，A基线572304e。已fetch origin并查询最新25个PR：最新为D14整合PR43，
没有D15-B候选、契约差异、测试报告或远端分支。此记录是前置缺失，不是代码审查通过；未批准任何A/B候选。

## 阻塞问题

- 无可核验的B候选。无法验证公开地址正确版本、刷新子路由、缺失JS404、源码与目录索引不泄露、失败面板保留旧成功。
  尚无实际公网托管适配器；A默认明确HOSTING_UNAVAILABLE。公网里程碑未达成。
- 公共 `contracts/openapi.v0.json` 的发布请求仍是旧两个ID。
  最终启用维护者需登记 `contracts/deploy/openapi.patch.json` 并对接必需 artifactDigest / Idempotency-Key；旧请求会400。

## 建议

- B注入 `DeploymentGateway`，实现独立不可变publication位置和有期限的真实访问/字节探测。
  不接受用户URL，拒绝重定向/private DNS解析；见接口JavaDoc与 `contracts/deploy/README.md`。
- UI一次点击生成key，重复网络请求保留key；显式重新部署生成新key。
  展示 `latestSuccessful`，不从最近失败attempt的null URL推导“无已发布版本”。

## 已核验内容

- 只读核对现有main、D11/D14交接、共享Publication schema、PG发布约束与模型工具注册表。
  这些不代替B托管/UI审查。A定向报告只证明锁定/状态/幂等/失败保留，fixture域名不是公开访问成功。
- B提供候选后按精确HEAD读取diff与测试报告，逐项实际访问 `/`、Vue子路由、缺失 `.js`、source/map/目录入口；
  将探测失败后UI显示与GET应用publications.latestSuccessful比较。作者修复后只重查变更及受影响范围。
