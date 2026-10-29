package dev.codeless.api.auth;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Bound the entire API body before MVC parses JSON or a handler mutates state, including chunked input. */
final class ApiRequestBody {
    // An 8000-code-point prompt needs at most 96000 bytes even as escaped UTF-16 surrogate pairs.
    static final int MAX_BYTES = 128 * 1024;

    static final class TooLarge extends IOException {}

    static HttpServletRequest bounded(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > MAX_BYTES) throw new TooLarge();
        byte[] bytes = request.getInputStream().readNBytes(MAX_BYTES + 1);
        if (bytes.length > MAX_BYTES) throw new TooLarge();
        return new HttpServletRequestWrapper(request) {
            private final ByteArrayInputStream input = new ByteArrayInputStream(bytes);
            private final ServletInputStream stream = new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public int read(byte[] b, int off, int len) { return input.read(b, off, len); }
                @Override public int available() { return input.available(); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) {
                    throw new IllegalStateException("API request bodies use synchronous reads");
                }
            };
            @Override public ServletInputStream getInputStream() { return stream; }
            @Override public BufferedReader getReader() {
                String encoding = getCharacterEncoding();
                return new BufferedReader(new InputStreamReader(stream,
                        encoding == null ? StandardCharsets.UTF_8 : java.nio.charset.Charset.forName(encoding)));
            }
        };
    }

    private ApiRequestBody() {}
}
