# D30-B delivery checks

Run from the repository root using the locked Node/pnpm and Python 3. These tools only add task-specific receipts. They do not deploy, authenticate with historical traces or call a paid model.

```sh
python tests/delivery/client/test_audit.py -v
python tests/delivery/client/audit.py offline --out tests/delivery/client/evidence/recheck-unique.json
python tests/delivery/client/audit.py public --out tests/delivery/client/evidence/public-unique.json
python tests/delivery/client/check-export.py <existing-safe-artifacts-directory> export-unique
node tests/delivery/client/check-preview.mjs <independently-built-dist> tests/delivery/client/evidence/browser-unique.json
```

The ZIP/PNG source must be the explicitly delivered safe D28 originals, not an authenticated trace or a different fixture. check-export rejects a different archive/image hash. clean-build needs Docker Engine and npm access; it uses the existing pinned-image harness. Raw ZIPs/logs stay in ignored .local-data/d30-b. The static preview browser is restricted to loopback and checks the known sample and its default pages, not arbitrary generated code or full task/catalog functionality.

On Windows, run `E:/nvm/v24.22.1/node.exe tests/delivery/client/record-gates.mjs <new-run-id>` (use the actual non-symlink locked Node path on another workstation). It reuses the existing Java21/environment selector and the local Docker Desktop Linux pipe, executes the original four verify entries and ci:gate sequentially, and records each native status/signal/error and raw log digest. It never retries a failed entry; ci:gate itself still performs its existing aggregate execution. Unix users should run the original repository commands directly with native receipts; this recorder is explicitly Windows-specific.

Every invocation requires a new output filename/run directory. Never overwrite failed evidence. Public reachability does not prove authenticated access, page behavior or the deployed commit. Offline checks do not prove runtime success. Historical quality remains 8/9 incremental composite with TASK-03 failed, not a new all-pass batch. Developer token totals remain UNKNOWN; runtime evidence is separate.
