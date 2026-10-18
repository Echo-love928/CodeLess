# D15 实际公网域名与 DNSPod 配置

2026-10-17，Asia/Shanghai。用户指定三个独立主域，DNS 管理平台为腾讯云 DNSPod。
本文固定实际部署名称；用户指定不等于已核验注册、控制权、DNS 或 TLS 就绪。

## 服务地址

| 用途 | 独立主域 | 服务 origin |
| --- | --- | --- |
| 平台 | codeless-platform.top | https://app.codeless-platform.top |
| 预览 | codeless-preview.top | https://preview.codeless-preview.top |
| 发布 | codeless-publish.top | https://sites.codeless-publish.top |

服务器沿用用户授权的 `huangjiaqi@23.136.172.128`，公网 IPv4 为 `23.136.172.128`。
三者满足当前受限站点策略；不需要改用不同后缀，也不需要三台服务器。

## DNSPod 中需要的五条记录

进入各自主域的解析记录页添加以下记录。主机记录只填表内前缀，不填完整域名。
记录类型均为 A、线路选择默认、TTL 保持控制台默认；记录值均为 `23.136.172.128`。

| 在哪个域名中添加 | 主机记录 | 类型 | 记录值 |
| --- | --- | --- | --- |
| codeless-platform.top | app | A | 23.136.172.128 |
| codeless-preview.top | preview | A | 23.136.172.128 |
| codeless-preview.top | *.preview | A | 23.136.172.128 |
| codeless-publish.top | sites | A | 23.136.172.128 |
| codeless-publish.top | *.sites | A | 23.136.172.128 |

`*.preview` 用于 `v<versionId>.preview.codeless-preview.top`，
`*.sites` 用于 `d<deploymentId>.sites.codeless-publish.top`。
这些是不同独立主域下的子域名，不能只给三个主域添加 `@` 记录替代。
若尚未委派到 DNSPod，须在注册商处使用各域名 DNSPod 控制台实际提供的权威 NS，不能猜测 NS 名称。
现有同名 CNAME 或其他冲突记录先核对用途；不要改动无关邮件或其他服务记录。
当前公网预检仅接受公网 IPv4；这些服务名不能有生效的 AAAA 答复（含上级通配/代理产生的答复）。
本方案直接解析到服务器，不启用 CDN 或代理。

DNSPod 主机记录、泛解析说明：
[主机记录说明](https://cloud.tencent.com/document/product/302/105285)、
[泛解析说明](https://cloud.tencent.com/document/product/302/9073)。

## 应用配置真值

```dotenv
CODELESS_PLATFORM_ORIGIN=https://app.codeless-platform.top
CODELESS_PREVIEW_ORIGIN=https://preview.codeless-preview.top
CODELESS_PUBLICATION_ORIGIN=https://sites.codeless-publish.top
VITE_CODELESS_PREVIEW_ORIGIN=https://preview.codeless-preview.top
```

前端公开发布配置 JSON 的 `publicOrigin` 为 `https://sites.codeless-publish.top`；
若使用构建变量 `VITE_PUBLICATION_ORIGIN`，也必须是同一值。
先保持 `CODELESS_PUBLICATION_ENABLED=false`；路径、受信 worker、入口和资源预检就绪后再启用。
这些值不含密码或密钥，可记录；生产秘密仍放受保护配置，不能写入仓库。

## TLS 覆盖范围

既定方案的受信证书须覆盖五个名称：

```text
app.codeless-platform.top
preview.codeless-preview.top
*.preview.codeless-preview.top
sites.codeless-publish.top
*.sites.codeless-publish.top
```

通配项不覆盖其基准名称，因此 preview/sites 基准名称与通配项都要保留。
按原方案通过 DNS-01 验证签发；挑战 TXT 值由实际 ACME 流程产生，本文不预填或伪造。
不能用三个根域名的普通证书代替上述覆盖范围。

## 本次核验状态与下一步

**2026-10-18 更新**：用户添加 A 记录后，五个服务名及随机动态子域在两台 DNSPod 权威 NS 上均返回
`23.136.172.128`，无 AAAA。所有者随后添加 TXT，证书已签发、校验并安装到受保护目录；
统一入口与应用公网验收尚未完成。
当前状态及记录清单见 [DNS/TLS 进度](D15-DNS-TLS-2026-10-18.md)。下列内容保留为首次核验历史。

- 使用当前生产 `publicationSite` 对三个实际 origin 执行校验，原生命令退出 0，接受该三站点组合。
- 本机直连递归 DNS 查询超时；这是查询路径失败，不能据此断言域名未注册。
- 经授权 SSH 在实际服务器查询五个服务名：平台返回临时解析失败，其余名称返回未找到；
  尚未获得指向服务器的有效解析结果，未验证权威 DNS/控制权。
- 本次仅记录域名和只读查询，没有修改 DNS、服务器配置、防火墙或申请证书。
- DNS 记录由所有者在 DNSPod 添加后，复查权威 NS、基准与随机动态子域 A/AAAA，再继续 DNS-01/TLS、
  SNI 入口与 worker 装配、预检及真实鉴权发布。DNS 成功不等于公网发布成功。

`PUBLIC_ACCEPTANCE=NOT_RUN`，公网验收仍为 `BLOCKED`。
