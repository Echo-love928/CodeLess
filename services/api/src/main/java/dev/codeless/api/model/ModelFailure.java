package dev.codeless.api.model;

/** Safe classification only; never exposes provider bodies, request text or credentials. */
public final class ModelFailure extends RuntimeException {
    private final String code;
    private final ModelProvider.Evidence evidence;

    public ModelFailure(String code) { this(code, ModelProvider.Evidence.unknown()); }
    public ModelFailure(String code, ModelProvider.Evidence evidence) {
        super(code);
        this.code = code;
        this.evidence = evidence;
    }
    public String code() { return code; }
    public ModelProvider.Evidence evidence() { return evidence; }
}
