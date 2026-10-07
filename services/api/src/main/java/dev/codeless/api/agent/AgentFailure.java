package dev.codeless.api.agent;

public final class AgentFailure extends RuntimeException {
    public AgentFailure(String code) { super(code); }
}
