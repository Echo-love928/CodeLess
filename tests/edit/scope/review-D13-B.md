# D13-B 只读互审（2026-10-14 Asia/Tokyo）

对象：[PR #39](https://github.com/Echo-love928/CodeLess/pull/39)，精确候选
`038b6c17ea41b0b194fde4075860c4fdeeec89b2`，base/main=`37755c43a7f34b1b90b1e5b8dd877ea516580a74`。
首轮交接时尚未出现B候选，后续fetch发现它；本节取代“无法互审”的当前结论，保留旧发现时间。
隔离detached工作树 `.local-data/d13-a/review-b-038b6c1`，复核后B跟踪源码仍干净；没有代写B或修改main。

## 阻塞问题

本轮源码审查及原四项验收复现未发现阻塞缺陷；也未发现新秘密、权限扩大、锁/CI/迁移变化或削弱断言。
独立B候选的确切[CI run38398553997](https://github.com/Echo-love928/CodeLess/actions/runs/38398553997)
六项completed/success，原API192/192、runner69/69、E2E45/45日志已下载核验。
不以这些Linux结果抹去B历史Windows完整E2E44/45失败；该轮登录fixture pageClosed确切根因仍UNKNOWN。

正式启用仍需维护者将A候选整合进最终PR并按新的head/base重跑受影响检查、重新获得批准；
以下私有组合测试是真实联调证据，**不是PR39已经含有A提交或main已经完成启用**。

## 建议

- 保留 `templates/vue/preview-bridge/README.md` 的边界：nonce/window只保护会话路由，不认证生成DOM；
  sourceFile由服务端冻结manifest映射，实例index/count仅显示，不能允许单实例或浏览器路径授权。
- 正式启用整合A的运行时补丁后，保留PLAN基结构、GENERATE/REPAIR目标上下文及底层read/update限制；
  API使用现有三字段selection，B无需依赖A新增的兼容响应头。附私有组合12/12证据供启用维护者复查。
- 历史Windows auth `tests/e2e/auth/flow.spec.ts:101` 的pageClosed/延迟fulfill保留诊断；
  不放宽超时或删断言。B最新完整Linux45/45是真实新检查，不能声称因此已根治历史故障。

## 已核验内容

| 要求 | 文件位置 / 实查与复现 |
| --- | --- |
| 嵌套元素定位所属组件 | `templates/vue/preview-bridge/selector.mjs:13` 使用nearest closest根；`tests/e2e/selector/flow.spec.ts:29` 真正点击strong→shared-card，API候选精确三字段。 |
| 伪造来源、错误nonce、过期版本忽略 | bridge:35/40/43；`apps/web/src/features/visual-edit/selector-session.ts:20/29/34` 对origin/WindowProxy/nonce/version/digest/闭合结构检查；flow:74真实同origin兄弟窗口、self-message、旧会话、非法实例/路径均不增加API请求。 |
| 退出编辑恢复导航 | bridge:54/57/68捕获编辑时pointer/click/键盘；flow:29校验普通hash导航、编辑不触发原监听、取消选择、iframe及平台Esc后恢复。session:44卸载/重建禁止late消息。 |
| 重复组件提示源码范围 | `VisualEditSelector.vue:39` 明示第2/3实例、整个源码组件和其他页面；flow:55桌面侧栏/手机单列、无横溢出，截图已实际查看。 |
| API不信任路径 | session:40投影只保留componentId/versionId/sourceDigest；实例元数据不送API。combined component-platform.json来自真实身份/CSRF/PG/签名网关/iframe选择→A局部executor→新READY，旧源码保留。 |

本人固定Node CLI复现（锁定依赖junction仅用于隔离环境，未安装/升级；避免pnpm工作树state保护）：

```powershell
. ./.local-data/d07-a/env.ps1
node .local-data/d13-a/review-record.mjs unit
node .local-data/d13-a/review-record.mjs build
node .local-data/d13-a/review-record.mjs browser
```

unit **native0、9/9**；Vite生产build **native0**；Chromium **native0、3/3、0skip**，覆盖T1–T4。
复现脚本仅在私有目录，固定CLI原生命令/HEAD/cwd/exit/signal/log SHA见
`tests/edit/scope/evidence/2026-10-14/peer-commands.json`。API及DOM在该三项browser中是明确fixture；
独立真实平台API链是下面组合树的真实测试，不混称。

私有组合树A=`8352b233b64dd4a3873ae4fae5266127c4c3bceb` + B=`038b6c17...`；
merge无冲突、无commit、没有修改两条任务分支或main，tested index tree=`b8a9bdad05284e14a2b26889dbcd47e84779798e`。

```powershell
node tests/edit/scope/record-command.mjs integration --repo .local-data/d13-a/integration-8352-038b
```

**native0、12/12、0failure/error/skip**：A范围集成8、单测3、真实PreviewPlatformIntegrationTest1。
真实PG/Docker Vue/Chromium/平台鉴权/CSRF/受控iframe选择、范围提示、三字段POST、A新草稿执行及旧源码保留。
命令、raw SHA、component-platform.json和原图SHA见同目录integration-command.json等。
Mock只作提案：组合中本卡SQL21次mock，真实预览链模型请求总数UNKNOWN，付费0、实际tokens UNKNOWN。
独立B unit/build/browser模型请求0；不与个人开发tokens混账，不证明真实模型质量。

本次审查只核查新增selector/gateway接线、协议、测试/失败报告及受影响回归；没有重复整个B API/门禁到绿色。
另一人批准A、正式启用候选同步main后的检查与重新批准仍由维护者承担；未自批或合并。
