# D25-A-COVER｜独立生产cover接线任务，默认关闭

用户于2026-10-31明确允许“开始独立生产cover PR，按方案协调公共契约”。范围包括Java owner接口、受控runner功能入口、UI绑定及公共OpenAPI/schema；不部署VPS、不启动付费模型请求。原生成6/9、自然FAILED未覆盖及原始失败继续HOLD。

分支codex/d25-a-production-cover，基线PR84/380811d5270a72706fad0b1a74b7ffab8b97735a，工作树.local-data/d25-a/cover-production。原fb79运行时及评测分支不切换、不覆盖。零付费补证已独立草稿PR85/794725fa160ebd5ab6282ae461ecf96df8d5c765。

维护范围登记：本独立最后启用PR由A负责API及两条cover GET的OpenAPI/schema登记，B按既有D16接口审查runner/UI兼容性。仓库无AGENTS或新的共享维护登记，D16-A/B把接线、共享契约及实际追溯留给最后启用PR；本次用户已明确扩展范围。本分支不动根锁、CI、迁移、支付、生成协议或其他公共文件。冲突或他人更新时仅协调该差异，不覆盖其工作。未经B独立审查不批准、不合并。

执行方案（最多六步）：

1. 基于原生不可变draft/runner/VERIFIED报告解析唯一受控entryPath，缺失/歧义失败关闭；绝不接受客户端URL/路径或外部record授权。
2. runner增加根、/tasks、/catalog的严格入口绑定；复用受限截图队列、TLS/DNS/IP与字节摘要检查、12秒/2次/100条和PNG约束。实现固定stdio capture入口，客户端GET不能入队。
3. Java默认关闭的单所有者协调器扫描已提交PUBLISHED，在独立私有根串行驱动Node；游标持久化，未知进程清理隔离停机，旧FAILED不重置。owner HTTP元数据/图片每次核对原生版本/发布/entry及摘要，拒绝匿名、其他owner、损坏与超限。
4. 集成两条OpenAPI GET、cover schema/正反fixture，UI核对entryPath并安全打开功能页面；保持原发布URL及最近可用版本，独立登记公共改动。
5. 正反/边界先红后绿；真实DB、构建、浏览器、HTTP联调；同版本实际公网证据和受控DNS/私有环境的证明边界分别记录，不能把fixture或本机开关叫VPS部署。
6. 跑受影响测试与四阶段门禁，固定最终提交，创建草稿PR、只读互审与交接；仍不付费、不部署、不自批、不合并。

设计采用Java持久协调器/owner读适配器，加一次性Node capture CLI，复用原Node durable queue及捕获worker。CLI只写独立队列/PNG，API只读；模型没有此工具。平台密钥、DB凭据、session cookie、Docker socket不传给Node捕获或浏览器。原机验收进程保持禁用任务调度及模型密钥。

实现候选：`45650b16981b04b6d65742befea8793b21f7a229`，草稿[PR86](https://github.com/Echo-love928/CodeLess/pull/86)。生产接线已实现，开关默认关闭；未部署VPS。真实原机owner接口联调2/3：SHOW-01、SHOW-02成功，TASK-01仍FAILED/CAPTURE_FAILED，两次封顶且保留。最早候选因JSON数字表示不一致隔离，旧失败/队列保持不变；新增回归先红后绿，修复后Java专项18/18，完整static Node54/54+前端206/206。runner首轮277/278失败：固定Docker镜像消失，期间A曾并行重建共享标签；后续严格串行复查278/278、完整API419/419、E2E75/75及完整平台链全部通过，原生退出码均0、无跳过。9份历史PNG逐字节恢复，旧失败不覆盖。

代码候选45650b1六项实时CI（含ci-gate）04:17Z均success；本轮交付提交只补文档/证据，该提交CI以PR86实时精确HEAD为准。没有重复执行会再次跑四门禁的本地ci:gate聚合入口。全部门禁日志路径、原生退出码与SHA见报告gates.json/commands。未自批、未合并、未推送main。没有把mock夹具的9/9或6/6改成REAL指标。

交付详情、原生命令/退出码、日志摘要与哈希、三条真实版本/权限检查、受控失败保护、先红后绿和明日待办见[本轮报告](../../evals/results/D25-A/production-cover-2026-10-31/README.md)。受控失败仅为隔离mock fixture，不是自然FAILED或REAL质量证明。原真实质量6/9与自然FAILED缺口继续HOLD。

运行时责任：A保留原机原DB、三个已发布不可变版本、六项REAL依赖链及原API61997；新cover联调API在61998、使用独立私有cover根，生成/发布/恢复worker禁用，未传模型密钥。B继续审查原机证据，无跨机密文/密钥转交。原队列FAILED不清理、不复位。原机公开环境与部署连接配置仍私密，不纳入PR。新开关启用或VPS部署另行明确范围。

公共契约协调：A已登记并实现两个只读GET及schema；没有公共写入API、任意路由或模型工具。B增量复审所有权、entry/版本摘要、停机隔离、旧版本/发布保护与UI兼容性；未取得B独立批准，不合并。

开发agent input_tokens/output_tokens/合计UNKNOWN，工具无实测计量。新增外部付费模型请求0。原14次REAL编辑65,427 token另账、费用上界0.171768元、实际扣费UNKNOWN；隔离受控fixture实测5行mock账本，不能算自然失败或并入个人开发token。
