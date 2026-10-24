package dev.codeless.api.model;

/** Safe classification only; never exposes provider bodies, request text or credentials. */
public final class ModelFailure extends RuntimeException {
    private final String code;
    private final ModelProvider.Evidence evidence;
    private final String detail;

    public ModelFailure(String code) { this(code, ModelProvider.Evidence.unknown()); }
    public ModelFailure(String code, ModelProvider.Evidence evidence) { this(code, evidence, null); }
    /** detail is a fixed enum-like word (for example FINISH_REASON_LENGTH), never provider text. */
    public ModelFailure(String code, ModelProvider.Evidence evidence, String detail) {
        super(code);
        this.code = code;
        this.evidence = evidence;
        this.detail = detail != null && detail.matches("[A-Z][A-Z0-9_]{1,60}") ? detail : null;
    }
    public String code() { return code; }
    public ModelProvider.Evidence evidence() { return evidence; }
    public String detail() { return detail; }
}
