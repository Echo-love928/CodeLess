package dev.codeless.api.export;

/** Fixed export error code; never carries host paths or file content. */
public final class ExportFailure extends RuntimeException {
    public ExportFailure(String code) { super(code); }
    public ExportFailure(String code, Throwable cause) { super(code, cause); }
}
