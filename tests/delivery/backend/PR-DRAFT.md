任务ID：D29-A

新访问者缺少仓库权限、成员贡献和后端技术声明的统一评审入口。本PR补充README入口、后端交付材料和讲解/换手脚本，以真实匿名GET、Git/PR快照和逐项代码/测试/历史回执支撑讲解；当天不增加功能。

- 范围：README、docs/delivery/backend.md、docs/demo/backend-script.md、docs/handoffs/D29-A.md与本卡tests/delivery/backend。无依赖、配置、迁移、契约或生产变更。
- 验证：匿名访问/历史收集原生0；材料28证据引用、17份D28摘要及本地链接检查0；安装回归5/5；static0（前端213测试及构建）；API1（JAVA_HOME无效）、runner1（110项76过34失败，含Docker缺失）、E2E1（4173被占用）。本机ci-gate派生FAILED，不继承D28历史绿色。
- 失败与边界：保留初版收集器错误、材料自链接首次失败和所有阶段真实退出；未知不补0；PR94/95 closed但merged=false，main仅一个作者，需PR与评审共同追溯。T4仅本卡高置信秘密格式扫描，不冒称全历史审计。
- 模型来源：D29未启动REAL/付费请求；mock编排、真实构建/DB/浏览器与D28 REAL8/9增量组合分别标注，TASK-03失败和账单UNKNOWN保留。
- 同伴审查：PR97@28037c5只读六文件、独立B文档检查2/2；发现过时D28当前状态、未交付门禁报告和真人/录像缺口，见review-D29-B.md，未批准。
- 未完成：真人A/B换手演练、B材料修正/互审批准、本机资源与端口协调后的真实检查、最终候选远端六门禁。
- 接纳：保持草稿，M6前置HOLD；另一人审批、最新main组合全部必需success、无未解决讨论后才具备合并条件。作者不自批、不推main、不合并。

详细命令、退出码、证据路径与token UNKNOWN均见docs/handoffs/D29-A.md。开发与平台运行时用量分账。
