# D24-A 第五轮失败证据交接

批次：2026-10-27T00-56-18Z-real-dba59d9d
平台/API 与生成 harness：d2b20a70bac8518ec58c863b2b11b4a3f81d036f
最终独立评测器：b7c66733cd4515865d870a15592525b94c7573cb（B 草稿 PR #69，六项 CI 成功）

## 交付与核验

先运行 `node verify.mjs` 核对本包文件大小与 SHA256、样本关联及 163 条事件 / 17 次调用。外部 ZIP SHA256 见相邻收据。

- TASK-03：23 条 journal、4 次模型调用，最后一条 GENERATE 非法 JSON 为 488 UTF-8 字节、472 UTF-16 单元，Jackson 第 1 行第 423 列，SYNTAX，输出 142 token。只提供结构/长度/位置/摘要，不提供非法回复原文。没有冻结版本、构建、浏览器或 REPAIR 轮次，不虚构补丁。此前两次合法 GENERATE 文件写入在 patches/ 中保留。
- CAT-02：89 条 journal、9 次调用、v1-v4 四份冻结源码、三轮实际 REPAIR 补丁及四组构建/浏览器结果。所有构建 exit 0。最初 catalog-page 缺失，首轮变为整个容器文本不等于标题；后两轮在 cafe-detail 缺失处超时。最终 AGENT_REPAIR_LIMIT_EXCEEDED，不是预算不足。
- EDIT-02：51 条原始逐文件 journal、4 次调用的原始审计、原始组件编辑请求和采集记录、原始基底及三份失败候选。GENERATE 的 expectVisible(work-card) 最初找不到目标；首轮补标识后匹配三个共享实例产生 strict mode violation；第二轮 bare done 未改源码，重验同样失败，以 AGENT_REPAIR_NO_PROGRESS 结束。after=null。
- EDIT-03/05：NOT_EXECUTED，03 依赖 02，05 依赖 03；根阻塞为 EDIT-02；没有创建任务，没有调用模型。

record.original.json、journal-original/、model-audit-original/、source/ 中标明原文件的内容按字节复制。journal.json 与分拆的事件是无损字段提取，JSON 格式化不等于原文件字节；runner-result.json 保留原 journal 中完整的构建/浏览器 payload。平台原始错误文本已有截断、截图为 null；不声称存在未截断诊断或截图。TASK-03-wire 不在包中。

## 归因与 A 后续回归建议

TASK-03 是 GENERATE JSON 格式/协议输入问题；用脱敏结构构造同类非法 JSON 固定响应，先确认旧代码可稳定复现，再验证修复与严格拒绝对照，不应声称这个脱敏夹具逐字复现原模型文本。CAT-02 是模型生成动作、定位标识与渲染结构的一致性问题，保留原动作，分别覆盖精确标题文本与详情目标；三轮补丁没有修好事实应保留。EDIT-02 是共享组件多实例与单目标 expectVisible 的动作契约冲突，以及随后未改源码的 bare done；构造三个共享实例，验证原 strict-mode 失败及无进展边界。不要通过放松冻结动作或抹除原失败来制造通过。具体实现、旧失败/新通过的回归及修复由已接手第五轮的 A 继续；B 独立复核。真实效果另行申请授权。

本次只读取并打包保留证据，新增模型调用 0，未重跑、替换或修改原失败。原始数据库、会话、凭据、SQL、HTTP wire、无关样本不在交付包。此包是三项失败的定向交接，不是完整六项编辑七文件采集包。
