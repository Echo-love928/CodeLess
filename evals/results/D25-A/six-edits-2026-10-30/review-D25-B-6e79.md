# 对B PR81 / 6e79faf的只读增量互审

阻塞问题：本轮未发现新增代码阻塞；真实总体仍HOLD。原九需求6/9、原故障/缺记录、SHOW-02公网超时和封面、TASK-01根占位、cover生产HTTP未启用、自然FAILED编辑保护未覆盖，均不能由确定性CI解除。

建议：区分原生队列成功与可用功能封面、私有adapter与生产路由、脚本与实际WebM；两份JSON原失败和原/tasks失败保持不变，PR84真实生成未评。请只增量重查新增代码和受影响证据，不制造无价值修改。

已核验内容：A独立在精确6e79faf6464f33c260d8c8e47efdce3b0b6dddd2执行原评测单元139/139、native0；命令及源码摘要见deterministic/B-139-command.json，完整日志私存对应原命令目录。首次缺JAVA_HOME的准备失败未执行测试，正确锁定Java后才记录这次139/139。evals/browser/cases.mjs:200要求匿名内联详情新增真实可见内容，:207-208核对元数据与新简介，:216仅拆显式分类/许可证标注，不按任意空白拆字段；相应正反例完整。原六项编辑本轮6/6，原九样本纠正CAT-03误拒为6/9，旧5/9保留；没有改需求数据、冻结动作、过滤规则、权限、解析器、预算、锁或CI。互审不等于批准合并。

复现：在B固定检出用锁定Java21与Node24.22.1执行node --test tests/eval/browser/{core,batch,behavior,names,edit-records}.test.mjs；原命令实际逐个传文件名，PowerShell不自动展开此花括号。真实源码重放使用PEER-TASK.md完整命令，预期整体1/生成6/9、编辑6/6。
