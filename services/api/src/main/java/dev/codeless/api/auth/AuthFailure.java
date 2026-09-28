package dev.codeless.api.auth;

import org.springframework.http.HttpStatus;

public class AuthFailure extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public AuthFailure(HttpStatus status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
}
