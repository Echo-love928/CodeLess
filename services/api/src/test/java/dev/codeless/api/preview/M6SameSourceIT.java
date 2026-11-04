package dev.codeless.api.preview;

/** Opt-in final-candidate integration; reuses the real API, SQL and runner harness. */
class M6SameSourceIT extends PreviewPlatformIntegrationTest {
    @Override protected String acceptanceScript() {
        return "../../tests/delivery/client/m6-same-source.acceptance.mjs";
    }
}
