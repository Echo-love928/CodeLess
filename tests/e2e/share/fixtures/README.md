# D16-A export compatibility fixture

`d16-a-export.zip` is the unmodified real owner HTTP export committed in PR #48,
candidate `feb820c8ddaa1233ad8d54806dc31bb5e4f4ed1f`, at
`tests/export/evidence/2026-10-19/export-0df0892e-cd61-4cd7-8109-0181fbc02834.zip`.
SHA-256: `74d3ce515e15586d87c143208875f6f2c66bb1c9f0345c9279fc8db74af383b0`.

The adapter test uses its actual version/application/source identity and A's
`X-CodeLess-*` stream headers, without Content-Length or a ZIP digest header.
This archive previously passed A's and B's independent clean-install/build checks;
it is a compatibility regression fixture, not a live API or public-cover integration.

## Live A HTTP / production B adapter check

`BSourceExportInteropTest.java` is a developer-only subclass of A's actual HTTP
integration test. Copy it into an isolated A checkout at
`services/api/src/test/java/dev/codeless/api/export/`. Do not install it into B's
API or production sources. Set absolute `CODELESS_D16_B_ROOT` to the B checkout,
`CODELESS_D16_B_INTEROP_OUT` and `CODELESS_EXPORT_EVIDENCE_DIR` to fresh private
output directories, and JAVA_HOME to the pinned Java 21 installation. In A run:

```text
services/api/mvnw -f services/api/pom.xml -Dtest=BSourceExportInteropTest test
```

Use `services/api/mvnw.cmd` on Windows. This runs A's real PostgreSQL, Docker build,
Chromium verification and all inherited export tests, then invokes the unmocked
B adapter against the live session-authenticated HTTP server. Model proposals
remain explicitly deterministic-mock. Owner download bytes must equal a second
direct owner export, the response must lack Content-Length, and real other-owner
404 / anonymous 401 must be preserved. DRAFT/FAILED/invalid-ID attempts make no
request. The script writes no cookies or credentials into its report. A and B
tracked sources remain separate; this is not public hosting/cover integration.
