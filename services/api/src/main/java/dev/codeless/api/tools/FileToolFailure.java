package dev.codeless.api.tools;

/** Only fixed codes cross the model boundary; never OS paths or exception causes. */
public final class FileToolFailure extends RuntimeException {
    public FileToolFailure(String code) { super(code); }
}
