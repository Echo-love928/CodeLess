# 587f830 审查整改证据

只记录本轮新增验证，首次交付证据不变。commands.json 中的 revision 是 checkout 参考；本轮工作树未提交时执行的 security/runner 均 canonical=false，以 sources 标识被测字节。

重现：

```text
node tests/security/runner/record-command.mjs security
node tests/security/runner/record-command.mjs runner
node tests/security/runner/evidence/2026-10-21/review-followup/fixture-controls.mjs
```

controls.json 的 baseline-delayed-close-mutant exit0 是注入故障后旧断言的假通过；fixed-delayed-close-mutant exit1 是新断言准确检测故障。二者不能列为正常安全测试通过。代理对照仅在私有浏览器注入坏代理，不更改宿主代理。原始副本与完整run日志留在 .local-data/d19-b/review-followup/ 及对应时间run目录。

历史批准只覆盖587f830；本轮新HEAD待重新审查，不能沿用旧批准或CI。
