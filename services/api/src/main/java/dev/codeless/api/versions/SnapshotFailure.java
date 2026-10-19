package dev.codeless.api.versions;

public final class SnapshotFailure extends RuntimeException {
    public SnapshotFailure(String code) { super(code); }
    public SnapshotFailure(String code, Throwable cause) { super(code, cause); }
}
