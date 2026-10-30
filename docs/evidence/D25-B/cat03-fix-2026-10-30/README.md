# D25-B 阻塞处理：CAT-03 已修复，A原机执行安排已确认

用户已选择 **A在原电脑执行真实编辑和公网链路，B独立审查证据**。因此跨机密文/密钥交接不再是本安排的前置条件；不把角色变更当成已经执行或通过。执行清单：[D25-B-to-A-runtime.md](../../../handoffs/D25-B-to-A-runtime.md)。原样本、代码故障、失败和金额授权范围均保持，质量继续HOLD。

## 已解决：B评测器的结构误拒

- 修复提交 **603f599775fbfeb8d0be81164c9a9c6af3623e47**，仅改 `evals/browser/cases.mjs` 与 `tests/eval/browser/behavior.test.mjs` 两个逻辑文件。按investigate先复现/定位再最小修复；没有生产、契约、锁、CI、模型或权限变动。
- 根因一：将p/dd段数误当字段数；只对明确标注的“类别/分类＋许可证”紧凑字段做分解，不按任意空格拆分描述，不凭地址/任意文字制造字段。
- 根因二：详情只认带heading的region/section/div；新增匿名内联详情观察，必须有点击后新增的非空可见描述、原字段仍在，且不能用冲突的类别/许可证冒充详情。点击无变化不通过；原独立详情字段比较保持。
- 新7项独立普通DOM对照：修复前6pass/1fail、exit1（合法实现被拒）；修复后7/7、exit0。缺类别、缺许可证、缺简介、点击不展开、详情错误许可、搜索绕过类别均仍被拒。guard-red.log / guard-green.log完整保留。
- 全部既有评测/采集器加新增回归 **139/139、native0、0skip**；确定性Docker/Chromium fixture需求9/9、编辑6/6、四反例检出、native0。这些MOCK结果不计真实模型质量。

## 同一原九需求重新独立验收

输入仍为A交付cf80bed8、生产候选fb79c402、批次2026-10-30T08-15-32Z-real-29ffed9b。与前次5/9的九行rawDigest、versionId、sourceDigest逐项一致，原源码和原报告未改。

使用新评测器603f599，真实Docker/Vue构建及Chromium全九项复测，**6/9、native exit1**：SHOW01/02/03、TASK01、CAT02、CAT03通过。剩余TASK02、CAT01为平台失败，TASK03仍在固定/tasks入口失败。`corrected-behavior.json`及七张样本PNG为新证据；旧5/9仍在 `../third-round-2026-10-30/behavior-report.json`，不覆盖旧结果、不替换样本。

命令均在603f599干净跟踪工作树运行，canonical=true、changedSources=[]；后来才补本报告。详见verification.json的精确命令、时间、exit、日志SHA及私有路径：

```powershell
node evals/browser/record-command.mjs unit
node evals/browser/record-command.mjs batch <原第三轮批次绝对路径>
node evals/browser/record-command.mjs fixture
```

## 新查明：TASK03是入口契约不一致，不能直接断言功能未实现

原任务plan明确声明route=/、file=src/pages/HomePage.vue，购物实现也在该页；固定TASKS评测入口为/tasks，该受控模板页面仍是“任务/待添加任务”。B在**原已构建产物**的原计划/入口执行相同TASK03购物/购买/清除/LocalStorage刷新断言，真实浏览器 **PASSED、诊断命令exit0**，见task03-route-diagnostic.json及TASK-03-planned-root.png。

该诊断不改变固定/tasks失败或6/9成绩，不修改计划/数据/动作/测试路由。A需要先明确受控入口契约并在后续独立修复中统一计划、文件和对外入口；不能仅换本轮评测路由抬分，也不能在未确认契约前强行归因为购物逻辑缺陷。原记录及诊断均保留。

## A接手的剩余工作（本轮未代为执行）

1. 先在原设备无需模型地刷新合法登录、核对fb79与三原应用版本、只读预检。跨设备不传Cookie/密钥/SQL；B等待去秘密终态证据。
2. 六项新增编辑的金额上限/执行范围尚未明确，原A两元只覆盖原14个生成/故障位置。明确范围后，按执行清单串行做01→02→03→05，04/06独立；真实任务和新版本、共享作用域、历史保护、越权拒绝、公网页面/封面/下载及录屏要分别采集。A原报告六项真实编辑0，当前B未收到新增终态，不能称链路通过。
3. TASK02/CAT01的SYNTAX失败仍真实存在。A应在原设备用保存的原wire做无模型严格重放，提供去秘密的摘要/长度/位置及最小失败；明确可验证的最小修复后再决定新付费批次。不得修补原非法JSON、自动去重/重试、重跑旧样本替换或缩小分母。
4. 代码1/3、原环境0/2及原批次13/14/完整性177/178继续保持；ENV02仅单列补验证据由B接受，费用/UNKNOWN不变。不因B探针修复或角色安排解除质量HOLD。

## 结果边界

**已关闭：CAT03评测器结构代码问题；已消除：必须把私密包/密钥交接到B电脑这一前置依赖。**

**未关闭：真实需求6/9未达8/9、入口契约/非法JSON问题，以及A尚未交付真实编辑和公网终态。** B不启动任何新付费调用、不冒充A已执行、不批准或合并。模型调用新增0；main、生产候选和A原记录未改。

公开guard-red.log仅清理显示副本的空行尾空格；完整原生原日志未修改，私有路径和原SHA256另存verification.json。初次格式检查的这两行尾空格失败已保留说明，未改变测试断言/结果。
