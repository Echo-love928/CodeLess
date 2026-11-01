# D27-B 只读互审：PR92 有阻塞，未批准

## 当前结论（覆盖下面早先的缺材料结论，历史保留）

2026-11-01最终查询发现 [PR #92](https://github.com/Echo-love928/CodeLess/pull/92)，审查精确HEAD `238cd3d1b2dc3f12a0e33c80ad55a0b63c70c9db`，B选定源码候选 `46e79aae5bb40569cd3828b67f0db705d91fdc12`。只读Git对象/25文件差异、配置、构建器、3项测试、ingress/public/sample/audit脚本、manifest/commands/identity及交接；未切换/改写B文件，未发远端评论或APPROVED。

### 阻塞问题

1. **B27-LAYOUT：文档指定的runner根缺后端固定桥。** B `infra/release/client/package.mjs:10` 的runnerInputs未包含 `services/api/agent-runner.mjs`，但 `docs/release-client.md:28` 要求将agent repository root指向展开后的runner根。真实生产 `services/api/src/main/java/dev/codeless/api/agent/LocalBuildGateway.java:17` 和 `infra/public/worker.py:158` 都固定解析该桥。A从B固定46e79aa独立重建runner.tar，SHA256严格等于B manifest的 `dacb15832df75fae69a929c9e160c33d78ee56784e8c8bc08e6c9ff7872cd5b6`；展开157成员，workflow和共享network策略实际存在，桥实际不存在；以该展开根运行Node固定桥，native1/MODULE_NOT_FOUND。按现有文档接入将使生成runner不可用。最小修复：将已有受信桥纳入归档并测真实桥路径，或明确组合安装契约指向A提供且已校验的完整repository根，不能只设置B-only根。A包确有该桥，但目前文档没有完成这项组合映射；不要求B修改API生产实现。独立证据 `independent-review.json` / `independent-unit.log`。
2. **B27-PUBLIC：T1及真实认证隔离缺证。** `tests/release/browser/evidence/public-candidate-failure.json:3` 仍绑定探索提交5acc205，status FAILED、candidateDeployed UNKNOWN、auth/me在30秒截止挂起；B清楚保留失败，没有把历史样例算新候选通过。`sample.json:4` 为authenticatedSession=false，不能验证真实评审会话。最终46e79aa的正式候选平台/同提交API/runner身份、真实登录预览/导出及会话隔离仍需受保护环境验收。阻塞上线/组合验收，不凭此判断底层网络原因。复现按B原 `record.mjs public` / 受保护服务器流程；两次失败后不无依据重复生产探测。
3. **组合/门禁未封口。** A=1f072dc、B=46e79aa尚无唯一组合提交；API/runner/模板树与共同基线相同已核对，但这不等于组合产物或部署成功。A原runner284/285 ENOTEMPTY、原ci-gate1仍OPEN。已只读核实B精确238cd3d六项checks completed/success，见exact-head-checks.json；B交接“运行中”为早先快照，远端成功只属于该B HEAD，不继承到A或组合，也不能覆盖布局/公网缺口。未满足前不可批准合并/启用。

### 建议

- `package.mjs:50` verify仅接收expectedCommit，清单真实性依赖文档要求的包外可信manifest摘要。建议将受信manifest SHA256作为显式CLI参数自动比对；目前不能把expectedCommit本身当供应链认证。此项是操作改进建议，不抹去文档已声明的信任前提。
- `docs/release-client.md:17` 仍引用不在runner.tar中的 `tests/agent/prepare-runtime.mjs`。补完整可信源码checkout前提或给出归档内Dockerfile/锁定Playwright的直接安装命令，以免空机操作员误在runner-only根执行缺文件脚本。

### 已核验内容

- **固定提交与范围**：25文件均属于B独立client/浏览器/文档范围；无公共契约、迁移、锁、CI、产品源码变更。B构建器Git archive固定完整SHA、锁定Node/pnpm、env只传系统工具必需项和固定VITE预览origin；源码/tree/锁/构建器/config摘要可对回Git。独立runner archive复算严格匹配；前端两次真实构建native0/同manifest属于B原报告，A没有冒称另重建完整web bundle。
- **独立专项**：从精确B HEAD提取只读源码到A私有fixture，`node --test <peer>/tests/release/browser/package.test.mjs` native0、3/3。覆盖篡改/错提交/缺件/多件、拒绝movable ref、正式网关内部路径/隔离及同站origin拒绝；原断言未改。
- **浏览器/隔离边界**：public脚本正常DNS/TLS、没有ignoreHTTPSErrors/hosts覆盖或替身请求，失败仍FAILED。sample三路由刷新、LocalStorage双向隔离和合成host-only/Secure/HttpOnly Cookie未流入历史示例的B原生0报告已读；它明确不是登录会话/新部署证明。ingress12项本地受信测试CA/固定nginx/Compose/静态字节仅属本地验证，不冒称公网。
- **秘密与权限**：新增源文件/文档/公开报告人工核对，只有明确SYNTHETIC canary/compose fixture，未见真实评审密码/token/私钥；原audit排除fixture/历史资料的局限保留，不作全仓绝对无秘密保证。没有降低既有Docker/socket/网络/发布/用户鉴权保护。

对B的修改建议仅登记此只读报告，未擅自改B模块或制造无价值平衡修改。作者修复后只复核变更、归档布局和受影响真实验收；当前结论 **CHANGES_REQUIRED / HOLD**，未提交正式review。

## 历史：早先查询未见材料

2026-11-01，查询范围与时刻见同目录 availability.json。查询公开仓库的全部现存分支名中含27的条目，以及open PR第一页（实际0条），本地 `docs/handoffs/D27-B.md` 也不存在；没有向同伴或其它chat发送消息。

## 阻塞问题

- **材料缺失，阻塞组合验收/批准**：没有可核对的D27-B PR精确HEAD、契约差异、client产物manifest或浏览器/runner报告。复现：`git ls-remote --heads origin '*27*'`；`GET https://api.github.com/repos/Echo-love928/CodeLess/pulls?state=open&per_page=100`；检查 `docs/handoffs/D27-B.md`。这不是对未见代码的缺陷判断。
- 因此“干净浏览器可访问平台与示例站点、构建产物固定提交、平台/生成站点会话隔离、公开仓库无真实评审密码”四项均 **NOT_REVIEWED**。不得继承D23/D26历史浏览器或CI为D27-B成功。

## 建议

B交付 `client/` 清单、完整提交、真实构建命令与原生退出/报告；共享release根只用api/client。runner源码与本包 `repository/services/runner/src`、API共享network策略应逐项比较同一Git blob或摘要。独立浏览器新上下文检查平台登录、旧版本和示例站点、跨origin会话Cookie、未认证拒绝、错误版本/构建失败保留旧可用版本。公开材料只保存受控fixture，真实评审密码、cookie、token和备份不导出。

## 已核验内容

已读scope/architecture、data/versions/deploy/export契约、D26-A及D23-A现行交接和D26-B交接；这些仅用来确定本卡边界。本方API发布包只读校验/恢复工具没有启用发布、改worker网络隔离、增加生成容器权限、修改契约/根锁/CI/迁移。D27-B四个重点尚无可审对象，不作通过或正式APPROVED结论。
