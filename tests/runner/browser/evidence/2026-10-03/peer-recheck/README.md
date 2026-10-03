# D08-B peer recheck — 2026-10-03

The before-fixed-route-http report preserves the actual real-build 200/404/404 result before the fix. The new static and browser assertions failed against original B code, then passed after the narrow shared document-route mapping. commands.json records all observed command exits, including a partial-patch failure.

Final gate reports come from real Chromium and Docker in review-gate. Root, Tasks and Catalog return identical frozen index.html bytes; real navigation/reload works, while resource aliases and unknown document paths remain denied. The browser control server binds 127.0.0.1. B's local default/explicit comparison both connected; A's reported IPv6 EACCES is not claimed to have reproduced on this host.

fixed-source.json was freshly exported by A's real Java tools at b7989cd557f95ff57f276a40ad84f3e87ce7852a (13 PostgreSQL-backed tests passed). peer-integration-root/tasks use A's unmodified cross-PR test. peer-integration-routes-reload adds 14 real controlled actions covering persistence, Catalog filtering/reload and return to Tasks using that fresh snapshot. Build/source/artifact identity is asserted; no synthetic producer substitutes for A.

fixture=true identifies host-authored browser fault fixtures. Other reports use the real D07 build. Absolute filesystem paths are normalized to <host-path>; screenshots retain their original bytes and verified digests. Original logs and raw evidence are under .local-data/d08-b. Null evidence and intentional failures stay unchanged. No skip/retry or removed assertion. Browser evidence persistence and version READY still require the public integration owner.
