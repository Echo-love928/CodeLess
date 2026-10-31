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

进展：已建分支并完成冻结依赖安装，尚未实现或声明生产cover可用。实现与实际检查结果将逐项补录。开发agent计量UNKNOWN；本任务付费模型0。
