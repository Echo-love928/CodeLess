package dev.codeless.api.security;

import static java.nio.charset.StandardCharsets.ISO_8859_1;
import static java.nio.charset.StandardCharsets.UTF_8;

import com.sun.net.httpserver.HttpServer;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import dev.codeless.api.versions.SnapshotStore;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.json.JsonMapper;

/**
 * D19-A fixtures. Versions are frozen through the real {@link LocalVolumeSnapshotStore} with a fixture runner report:
 * they prove authorization, storage and input-boundary behaviour only, never a real build, browser check or model result.
 */
final class SecurityFixtures {
    static final JsonMapper JSON = JsonMapper.builder().build();
    private static final SecureRandom RANDOM = new SecureRandom();

    record Version(UUID id, UUID build, String sourceDigest, String artifactDigest) {}
    record Raw(int status, Map<String, String> headers, String body) {}

    private SecurityFixtures() {}

    static String hex(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        return HexFormat.of().formatHex(value);
    }

    /** A VERIFIED version (DRAFT row, SUCCEEDED build, then VERIFIED; DB triggers enforce the order) with a component catalog. */
    static Version verified(JdbcClient jdbc, SnapshotStore store, Path scratch, UUID app, UUID task, int number, String marker)
            throws Exception {
        UUID version = UUID.randomUUID(), build = UUID.randomUUID();
        Path source = Files.createTempDirectory(Files.createDirectories(scratch), "source-");
        byte[] vue = ("<template><h1>" + marker + "</h1></template>\n").getBytes(UTF_8);
        Path page = source.resolve("src/pages/HomePage.vue");
        Files.createDirectories(page.getParent());
        Files.write(page, vue);
        var entries = List.of(new SnapshotStore.Entry("src/pages/HomePage.vue", vue.length, LocalVolumeSnapshotStore.hash(vue)));
        String sourceDigest = LocalVolumeSnapshotStore.hash(JSON.writeValueAsBytes(entries));
        store.freezeSource(version, source, sourceDigest, JSON.valueToTree(entries));

        Path artifact = Files.createDirectories(scratch.resolve("artifact-" + version));
        Map<String, Object> catalogFile = new LinkedHashMap<>();
        catalogFile.put("sourceFile", "src/pages/HomePage.vue");
        catalogFile.put("fileDigest", LocalVolumeSnapshotStore.hash(vue));
        catalogFile.put("componentId", "home-page");
        catalogFile.put("disabledReason", null);
        byte[] catalog = JSON.writeValueAsBytes(Map.of("protocol", "codeless-component-catalog/v1", "files", List.of(catalogFile)));
        byte[] html = "<!doctype html><script src=\"/assets/app.js\"></script>".getBytes(UTF_8);
        byte[] js = ("console.log('d19a fixture " + number + "')").getBytes(UTF_8);
        Files.write(artifact.resolve("ai-component-catalog.json"), catalog);
        Files.write(artifact.resolve("index.html"), html);
        Files.createDirectories(artifact.resolve("assets"));
        Files.write(artifact.resolve("assets/app.js"), js);
        var files = List.of(
                new SnapshotStore.Entry("ai-component-catalog.json", catalog.length, LocalVolumeSnapshotStore.hash(catalog)),
                new SnapshotStore.Entry("assets/app.js", js.length, LocalVolumeSnapshotStore.hash(js)),
                new SnapshotStore.Entry("index.html", html.length, LocalVolumeSnapshotStore.hash(html)));
        String artifactDigest = LocalVolumeSnapshotStore.hash(JSON.writeValueAsBytes(files));
        var result = JSON.valueToTree(Map.of("status", "VERIFIED", "sourceDigest", sourceDigest,
                "build", Map.of("id", build, "status", "SUCCEEDED", "exitCode", 0, "artifact",
                        Map.of("directory", artifact.toString(), "digest", artifactDigest, "files", JSON.valueToTree(files))),
                "verification", Map.of("id", UUID.randomUUID(), "buildId", build, "sourceDigest", sourceDigest,
                        "artifactDigest", artifactDigest, "status", "PASSED", "workerExitCode", 0)));
        store.freezeOutcome(version, sourceDigest, "VERIFIED", result, null);
        jdbc.sql("INSERT INTO application_versions(id,application_id,number,source_digest,status,source_task_id) VALUES (?,?,?,?,'DRAFT',?)")
                .params(version, app, number, sourceDigest, task).update();
        jdbc.sql("INSERT INTO builds(id,task_id,version_id,status,exit_code,artifact_digest,completed_at) VALUES (?,?,?,'SUCCEEDED',0,?,clock_timestamp())")
                .params(build, task, version, artifactDigest).update();
        jdbc.sql("UPDATE application_versions SET status='VERIFIED',build_id=? WHERE id=?").params(build, version).update();
        jdbc.sql("UPDATE generation_tasks SET status='READY',queue_state='FINISHED',lease_token=NULL,lease_expires_at=NULL WHERE id=?")
                .param(task).update();
        jdbc.sql("UPDATE applications SET latest_ready_version_id=? WHERE id=?").params(version, app).update();
        return new Version(version, build, sourceDigest, artifactDigest);
    }

    /** Relative path -> SHA-256 of every regular file and "dir" for every directory under {@code root}. */
    static Map<String, String> tree(Path root) throws Exception {
        var result = new TreeMap<String, String>();
        if (!Files.exists(root)) return result;
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.toList()) {
                String name = root.relativize(path).toString().replace('\\', '/');
                if (name.isEmpty()) continue;
                result.put(name, Files.isDirectory(path) ? "dir"
                        : HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path))));
            }
        }
        return result;
    }

    /**
     * Sends exactly the given request target over a plain socket, so spellings such as {@code /%61pi/...} or
     * {@code /api;x=1/...} reach Tomcat byte for byte instead of being normalised by an HTTP client library.
     */
    static Raw raw(int port, String method, String target, Map<String, String> headers, String body) throws IOException {
        try (Socket socket = new Socket("127.0.0.1", port)) {
            socket.setSoTimeout(30_000);
            byte[] payload = body == null ? new byte[0] : body.getBytes(UTF_8);
            StringBuilder head = new StringBuilder(method).append(' ').append(target).append(" HTTP/1.1\r\n")
                    .append(headers.containsKey("Host") ? "" : "Host: 127.0.0.1:" + port + "\r\n").append("Connection: close\r\n");
            headers.forEach((name, value) -> head.append(name).append(": ").append(value).append("\r\n"));
            if (body != null) head.append("Content-Type: application/json\r\nContent-Length: ").append(payload.length).append("\r\n");
            head.append("\r\n");
            OutputStream out = socket.getOutputStream();
            out.write(head.toString().getBytes(ISO_8859_1));
            out.write(payload);
            out.flush();
            return parse(socket.getInputStream().readAllBytes());
        }
    }

    private static Raw parse(byte[] bytes) {
        String text = new String(bytes, ISO_8859_1);
        int end = text.indexOf("\r\n\r\n");
        if (end < 0) return new Raw(-1, Map.of(), text);
        String[] lines = text.substring(0, end).split("\r\n");
        int status = Integer.parseInt(lines[0].split(" ")[1]);
        Map<String, String> headers = new LinkedHashMap<>();
        for (int i = 1; i < lines.length; i++) {
            int colon = lines[i].indexOf(':');
            if (colon > 0) headers.merge(lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT),
                    lines[i].substring(colon + 1).trim(), (a, b) -> a + ", " + b);
        }
        byte[] content = java.util.Arrays.copyOfRange(bytes, end + 4, bytes.length);
        if ("chunked".equalsIgnoreCase(headers.get("transfer-encoding"))) content = dechunk(content);
        return new Raw(status, headers, new String(content, UTF_8));
    }

    private static byte[] dechunk(byte[] chunked) {
        var out = new ByteArrayOutputStream();
        int position = 0;
        while (position < chunked.length) {
            int lineEnd = indexOf(chunked, position);
            if (lineEnd < 0) break;
            String size = new String(chunked, position, lineEnd - position, ISO_8859_1).split(";")[0].trim();
            int length = Integer.parseInt(size, 16);
            if (length == 0) break;
            out.write(chunked, lineEnd + 2, length);
            position = lineEnd + 2 + length + 2;
        }
        return out.toByteArray();
    }

    private static int indexOf(byte[] bytes, int from) {
        for (int i = from; i + 1 < bytes.length; i++) if (bytes[i] == '\r' && bytes[i + 1] == '\n') return i;
        return -1;
    }

    /**
     * Loopback stand-in for the trusted preview gateway's readiness endpoint, so the real {@code PreviewReadiness}
     * client and the real credential issuer run. It answers only for versions registered by the test and only with the key.
     */
    static final class PreviewGatewayStub {
        private final HttpServer server;
        private final Map<String, Map<String, Object>> ready = new ConcurrentHashMap<>();

        private PreviewGatewayStub(String key) throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/internal/preview/ready/", exchange -> {
                String path = exchange.getRequestURI().getPath().substring("/internal/preview/ready/".length());
                var body = key.equals(exchange.getRequestHeaders().getFirst("X-Codeless-Preview-Registry-Key")) ? ready.get(path) : null;
                byte[] bytes = JSON.writeValueAsBytes(body == null ? Map.of("ready", false) : body);
                exchange.sendResponseHeaders(body == null ? 404 : 200, bytes.length);
                try (OutputStream out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start();
        }

        static PreviewGatewayStub start(String key) {
            try { return new PreviewGatewayStub(key); }
            catch (IOException failure) { throw new IllegalStateException(failure); }
        }

        int port() { return server.getAddress().getPort(); }

        void register(UUID app, Version version) {
            ready.put(app + "/" + version.id(), Map.of("ready", true, "buildId", version.build().toString(),
                    "sourceDigest", version.sourceDigest(), "artifactDigest", version.artifactDigest()));
        }

        void stop() { server.stop(0); }
    }

    /**
     * Tees everything written to System.out/System.err (Spring Boot's console appender looks System.out up on every
     * write) into memory from class load on, so the context start-up and every request of the class are scanned.
     */
    static final class OutputTee {
        private final ByteArrayOutputStream captured = new ByteArrayOutputStream();
        private final PrintStream out = System.out, err = System.err;

        private OutputTee() {
            System.setOut(new PrintStream(new Tee(out), true, UTF_8));
            System.setErr(new PrintStream(new Tee(err), true, UTF_8));
        }

        static OutputTee install() { return new OutputTee(); }

        String text() { synchronized (captured) { return captured.toString(UTF_8); } }

        long bytes() { synchronized (captured) { return captured.size(); } }

        void restore() {
            System.out.flush();
            System.err.flush();
            System.setOut(out);
            System.setErr(err);
        }

        private final class Tee extends OutputStream {
            private final PrintStream target;
            Tee(PrintStream target) { this.target = target; }
            @Override public void write(int b) {
                target.write(b);
                synchronized (captured) { captured.write(b); }
            }
            @Override public void write(byte[] b, int off, int len) {
                target.write(b, off, len);
                synchronized (captured) { captured.write(b, off, len); }
            }
            @Override public void flush() { target.flush(); }
        }
    }

    static String read(InputStream input, int limit) throws IOException {
        return new String(input.readNBytes(limit), UTF_8);
    }
}
