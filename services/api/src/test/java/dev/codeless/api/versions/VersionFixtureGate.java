package dev.codeless.api.versions;

/** Ordered acceptance cases must fail explicitly when their real READY fixture was not established. */
final class VersionFixtureGate {
    private boolean ready;
    private Throwable failure;
    void ready() {
        if (failure != null) throw new IllegalStateException("Cannot promote a failed acceptance prerequisite", failure);
        ready = true;
    }
    void failed(Throwable cause) { if (failure == null) failure = cause; ready = false; }
    void require() {
        if (!ready) throw new AssertionError("D11-A prerequisite unavailable: T1 must complete real READY generation and draft setup. "
                + "This case was NOT EXECUTED; see D11-A-prerequisite.json. No /versions/null request was sent.", failure);
    }
}
