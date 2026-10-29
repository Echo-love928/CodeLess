# B点名的三个API文件：原始现场指纹与LF归一化补证

本证据专门覆盖 TaskProgressService.java、TaskEventReplay.java、AuthIntegrationTest.java。
上轮 fingerprint-review-0dbc999 比对的是文档/汇总工具，覆盖对象选错，不能替代本证据；原报告仅保留追溯。

运行 `node tests/regression/api/verify-api-site-fingerprints.mjs`，exit0，3/3全部通过。该命令只读Git/文件并输出证据，不编译、不测试、不运行门禁或模型。

- 被测现场指纹来源：门禁记录 `2026-10-29T06-29-39.894Z-gate/command.json` 的 sourceDigests；被测提交9cf78ef。
- 本轮复核提交b5f9ec8，另比对此前0dbc999；三份Git版本内容均相同。完整提交号及Git blob OID见comparison.json。
- site/*.java.raw 是从当前实际文件逐字节复制，复制前其SHA256必须等于原被测记录，未从LF重构CRLF。原始文件在运行后补存，但其内容由原运行SHA256绑定，不能宣称运行时已有这份副本。
- 三份原始文件实为混合换行：TaskProgressService.java: CRLF=45, bare LF=24；TaskEventReplay.java: CRLF=91, bare LF=13；AuthIntegrationTest.java: CRLF=169, bare LF=18。不能将Git LF统一重构为CRLF来冒充原始字节；本次保留实际混合换行。
- 三份原始副本以 `.gitattributes: site/*.raw -text` 保留CRLF。跨平台复算请用默认命令读取这些副本；`--capture`只用于原操作员初次收集，默认核对不需要该选项。
- 唯一归一规则为移除紧邻LF之前的CR；不trim、不去BOM、不做Unicode或其他空白归一化，也不改原记录/源码。

| 文件 | 原始CRLF对数 | 被测现场原始SHA256（=原始副本） | 现场仅CRLF→LF后的SHA256（=三个Git版本的原始LF内容） |
| --- | --- | --- | --- |
| TaskProgressService.java | 45 | c2515819524e78f024ad103aaf66d2ffe39eed22c5fb35d163f9adc53ca041a0 | 79e16e43799173d5e86b6ab3266699b91c850889768ced668e864246e14a93f6 |
| TaskEventReplay.java | 91 | c00cca9435381b21a980d4bc2d103bb7b096db50d09a1e4c63c5397e7521a26e | 9cbf64d781b3b9286d321ac05855d9fc70b1ab32b3fd51d57e70284432a853fb |
| AuthIntegrationTest.java | 169 | ebdb384e26c5b8d19d0a3cf86b47b40ec99f032624619dbde999d015d914f700 | 8d48c3f4d9dfad71df88985776f22da7260391280733b35146afb9e4389a725e |

comparison.json逐文件列出完整路径、原始现场SHA256、原始副本SHA256/字节数、归一化SHA256、三个提交的Git blob OID/SHA256/字节数及所有等值判定。SHA256与Git对象ID分列，未混用。

结果：原始副本3/3匹配原被测记录；原始副本LF归一化后3/3匹配9cf78ef、0dbc999、b5f9ec8的Git原始内容；当前工作区LF内容也匹配b5f9ec8。现场CRLF/Git LF的差异仅为换行，未发现内容差异。

API源码与门禁入口守卫均无差异。无需修改生产代码、测试断言、输入限制或运行任何门禁。原失败报告与历史502根因UNKNOWN保持不变；本证据只供B独立复审，不等于正式批准或发布放行。

复算需要本地能读取上述三个Git提交（均在本PR历史中）；缺对象/缺指纹/不匹配会直接失败，不降级为成功或0。
