# D26-A：封面入口未知时保留发布游标并隔离恢复

已发布版本的入口证明读取返回404/503时，旧协调器会推进持久游标，导致该版本永久失去后续封面处理机会。现在保留游标并写入 quarantine/manualRecoveryRequired，重启不自动重试；已确认的 FAILED 仍保持失败，未知 capture 仍保留 inflight。

- 范围：唯一生产差异 `services/api/src/main/java/dev/codeless/api/cover/CoverCoordinator.java`（4增/2删）；新增9项取消/预算/协调器回归、冻结清单、原失败映射和证据。基线 df6822e，代码候选3286dd3。没有HTTP API、公共契约、提示词、迁移、依赖、锁或CI变化。
- 验证：原 main 上 coordinator 红测3项中1失败（native1，cursor原件保留）；修复后受影响21/21（native0）；起点50项限定回归和6项边界native0。固定3286dd3完整门禁：static0（Node64/前端206）、API0（428/428）、runner1（276/285）、E2E0（75/75及完整平台链）；**ci-gate1/HOLD**，源字节和HEAD不变，9张历史PNG恢复。新增9项在完整API中通过。
- runner阻塞：映射组共同before hook创建已解析固定imageId时`No such image`，9项失败、build exitCode=null。独立原映射入口15/15/native0是诊断，不关闭原失败；具体镜像失效机制UNKNOWN，移交runner/公共门禁维护者协调D26-B，不改测试/隔离或重复整套重试。本PR不得合并。
- 冻结：204个API/资源/适配器/提示词/契约与7个原失败记录摘要冻结，HTTP API和提示词变更清单为空。补充覆盖OpenAPI外部封面schema后原static再次native0，平台代码和Java测试未变。
- 失败/边界：404/503保持游标、capture0次并隔离；重启不重试；确认失败capture1次且不改成功；未知capture保留inflight；真实坏Vue编辑不覆盖旧源码；VERIFY后取消拒绝迟到READY；256/255输出、12请求/20工具、双槽验证及过期租约边界。
- 来源：模型明确deterministic-mock；数据库、工具、Docker/Vue构建、Chromium真实执行。coordinator专项hosting/capture为明确fixture，不证明公网截图或真实模型质量。新增真实付费模型请求0。
- 配置/恢复：默认cover开关不变、不启用、不部署。第一个入口不明会暂停后续队列，需人工核对不可变入口和终态台账；不能删除/复位旧失败来制造成功。回退代码会恢复永久漏项风险，保留所有已写隔离/游标/inflight及历史报告。
- 剩余限制：原真实需求6/9、13/14不完整、故障门槛、自然REAL FAILED观察、新提示真实复评、生产capture启用与双方组合联调仍HOLD。本次无法把这些缺项登记为完成。
- 互审：A只读审D26-B PR87精确b0fc773，未发现新增代码阻塞，六项精确HEAD检查success；未批准B、不自批。请B增量核对本修复及原生red/green/失败样本，A/B最终组合由最后启用PR执行真实联调。

本PR必须保持draft。另一人批准、最新main同步、精确HEAD必需检查全部真实success、无未解决讨论以及实际质量门槛达标前，不具备合并条件。交接 `docs/handoffs/D26-A.md`，阻塞 `docs/release-blockers.md`。

当前仅完成本地草稿；向 `https://github.com/Echo-love928/CodeLess` 推送被自动审批拒绝，尚未上传或创建远端PR。待用户针对最终公开源码与证据载荷明确授权，不绕过审核换通道上传。
