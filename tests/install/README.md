# D23-B installation acceptance

From repository root, after preparing the locked tools in docs/install.md:

```sh
node --test tests/install/install.test.mjs
node tests/install/record-command.mjs config
node tests/install/record-command.mjs compose
node tests/install/record-command.mjs full
node tests/install/record-command.mjs export <this-run-download.zip>
node tests/install/record-command.mjs gate
```

`record-command.mjs` uses a fixed command list and the existing full-product sanitized environment. Modes static/api/runner/e2e are also available. `install` executes the frozen workspace install. Raw logs, source hashes and native exit/signal are retained under .local-data/d23-b/commands. A failed suite remains FAILED, even if its SQL later reaches terminal state. A dirty snapshot is identified by Git reference plus source hashes, not claimed as a clean committed run.

`real` is opt-in and makes **one** billable DeepSeek PLAN request with the existing CLI (60s/2048 output tokens/no retries); it reads only model key/name from the parent process. Obtain authorization for that request before executing it. `real-missing` strips both credentials and must exit 2/BLOCKED with requestsStarted=0; that is an expected negative-path observation, not successful model integration. Other modes never inherit model credentials.

The environment-template test covers blank secrets, local-only DB values, matching locked toolchains, failure configuration paths and documentation links. The evidence folder retains this task's actual outcomes and exported fixture ZIP. Rebuild that sample using the documented verify-export and clean-build commands; no platform credentials or existing node_modules are needed.
