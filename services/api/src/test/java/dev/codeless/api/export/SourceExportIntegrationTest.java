package dev.codeless.api.export;

import static org.assertj.core.api.Assertions.*;
import dev.codeless.api.agent.*;
import dev.codeless.api.apps.ApplicationService;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import dev.codeless.api.versions.*;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * D16-A acceptance over real HTTP. PostgreSQL, the Docker build, Chromium verification, frozen snapshots and the clean
 * install/build of the downloaded ZIP are real; only model proposals use the named deterministic-mock provider.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "codeless.model.provider=deterministic-mock", "CODELESS_DEMO_PASSWORD=demo-password-for-test-only", "CODELESS_ADMIN_PASSWORD=admin-password-for-test-only",
    "codeless.agent.enabled=true", "codeless.agent.repair.enabled=false", "codeless.agent.repository-root=../..",
    "codeless.agent.private-root=target/export-integration/runtime", "codeless.versions.root=target/export-integration/versions",
    "CODELESS_FILE_WORKSPACE_ROOT=target/export-integration/workspaces", "CODELESS_FILE_AUDIT_ROOT=target/export-integration/audit",
    "codeless.deploy.root=target/export-integration/records", "codeless.deploy.worker-enabled=false",
    "codeless.export.repository-root=target/export-integration/repository"})
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class SourceExportIntegrationTest {
    // Own database: queue claims are global, so this suite never claims another suite's task or shares its pool.
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(DockerImageName.parse(
            "postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94").asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("codeless_export_test").withUsername("codeless_test").withPassword("local-test-only");
    static {POSTGRES.start();}
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("CODELESS_DATABASE_URL", () -> "jdbc:postgresql://127.0.0.1:1/must_not_connect");
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
    static final Path REPOSITORY = Path.of("../..").toAbsolutePath().normalize();
    static final Path WORK = Path.of("target/export-integration").toAbsolutePath();
    static final String PLANTED = "d16a-planted-" + UUID.randomUUID(), FAILED_MARKER = "D16_FAILED_VERSION_MARKER",
            DRAFT_MARKER = "D16_DRAFT_VERSION_MARKER";

    @Value("${local.server.port}") int port;
    @Autowired JdbcClient jdbc;
    @Autowired ApplicationService applications;
    @Autowired TaskQueueService queue;
    @Autowired TaskStageRunner loop;
    @Autowired AgentJournal journal;
    @Autowired AgentRunStore store;
    @Autowired FileToolService tools;
    @Autowired ArtifactRepository artifacts;
    @Autowired SnapshotStore snapshots;
    final JsonMapper json = JsonMapper.builder().build();
    final HttpClient client = HttpClient.newHttpClient();
    record Login(String cookie, String csrf) {}
    record Unzipped(String root, Map<String, byte[]> files) {}
    Login login, other;
    UUID owner, app, ready, shell, failed, draft;
    String source, artifact;

    String base() {return "http://127.0.0.1:" + port + "/api/v0/";}
    HttpResponse<byte[]> get(String route, Login session) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create(base() + route)).GET();
        if (session != null) builder.header("Cookie", session.cookie());
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
    }
    HttpResponse<byte[]> export(UUID version, Login session) throws Exception {return get("versions/" + version + "/export", session);}
    Login login(String email, String password) throws Exception {
        var r = client.send(HttpRequest.newBuilder(URI.create(base() + "auth/csrf")).GET().build(), HttpResponse.BodyHandlers.ofString());
        String token = json.readTree(r.body()).path("token").asText(), first = r.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
        var logged = client.send(HttpRequest.newBuilder(URI.create(base() + "auth/login")).header("Cookie", first).header("X-CSRF-Token", token)
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(
                        Map.of("email", email, "password", password)))).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(logged.statusCode()).isEqualTo(200);
        return new Login(logged.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0], token);
    }
    static Unzipped unzip(byte[] zip) throws Exception {
        var files = new LinkedHashMap<String, byte[]>();
        String root = null;
        try (var in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            for (var entry = in.getNextEntry(); entry != null; entry = in.getNextEntry()) {
                assertThat(entry.isDirectory()).isFalse();
                String name = entry.getName(), first = name.substring(0, name.indexOf('/'));
                if (root == null) root = first;
                assertThat(first).isEqualTo(root);
                assertThat(files.put(name.substring(root.length() + 1), in.readAllBytes())).isNull();
            }
        }
        return new Unzipped(root, files);
    }
    Path evidence() throws Exception {
        return Files.createDirectories(Path.of(System.getenv().getOrDefault("CODELESS_EXPORT_EVIDENCE_DIR", WORK.resolve("evidence").toString())));
    }
    void report(String name, Object value) throws Exception {
        Files.write(evidence().resolve(name + ".json"), json.writerWithDefaultPrettyPrinter().writeValueAsBytes(value));
    }
    /** Fixed developer tool from tests/export; never reachable through the platform API. */
    JsonNode node(String script, Path out, String... args) throws Exception {return nodeExit(0, script, out, args);}
    JsonNode nodeExit(int expectedExit, String script, Path out, String... args) throws Exception {
        var command = new ArrayList<>(List.of("node", REPOSITORY.resolve("tests/export/" + script).toString()));
        command.addAll(List.of(args));
        Path stdout = Files.createDirectories(WORK.resolve("logs")).resolve(script + "-" + UUID.randomUUID() + ".stdout");
        var process = new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(stdout.toFile()).start();
        assertThat(process.waitFor(16, TimeUnit.MINUTES)).as(script + " finished").isTrue();
        assertThat(process.exitValue()).as(script + " exit; see " + stdout).isEqualTo(expectedExit);
        return json.readTree(Files.readAllBytes(out));
    }
    static void delete(Path path) throws Exception {
        if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return;
        try (var files = Files.walk(path)) {for (var p : files.sorted(Comparator.reverseOrder()).toList()) Files.delete(p);}
    }

    /** Trusted repository copy with planted secrets, logs, dependencies, build output and extra pages. */
    void plantedRepository() throws Exception {
        Path repo = WORK.resolve("repository");
        delete(repo);
        Path from = REPOSITORY.resolve("templates/vue"), to = repo.resolve("templates/vue");
        try (var files = Files.walk(from)) {
            for (var file : files.filter(Files::isRegularFile).toList()) {
                var relative = from.relativize(file);
                if (relative.startsWith("node_modules") || relative.startsWith("dist")) continue;
                Files.createDirectories(to.resolve(relative).getParent());
                Files.copy(file, to.resolve(relative));
            }
        }
        Files.createDirectories(repo.resolve("docs"));
        Files.copy(REPOSITORY.resolve(ExportTemplate.README_TEMPLATE), repo.resolve(ExportTemplate.README_TEMPLATE));
        var planted = new LinkedHashMap<String, String>();
        planted.put("templates/vue/.env", "CODELESS_DATABASE_PASSWORD=" + PLANTED);
        planted.put("templates/vue/.npmrc", "//registry.npmjs.org/:_authToken=" + PLANTED);
        planted.put("templates/vue/node_modules/leak/index.js", "module.exports='" + PLANTED + "'");
        planted.put("templates/vue/npm-debug.log", "token " + PLANTED);
        planted.put("templates/vue/dist/index.html", "<p>" + PLANTED + "</p>");
        planted.put("templates/vue/src/pages/Leak.vue", "<template>" + PLANTED + "</template>");
        planted.put("templates/vue/id_rsa", "-----BEGIN OPENSSH PRIVATE KEY-----\n" + PLANTED);
        planted.put(".env", "CODELESS_MODEL_API_KEY=" + PLANTED);
        planted.put("docs/.env", "SECRET=" + PLANTED);
        for (var entry : planted.entrySet()) {
            Files.createDirectories(repo.resolve(entry.getKey()).getParent());
            Files.writeString(repo.resolve(entry.getKey()), entry.getValue());
        }
    }

    @BeforeAll void verifiedVersionAndOtherVersions() throws Exception {
        plantedRepository();
        var runtime = new ProcessBuilder("node", "../../tests/agent/prepare-runtime.mjs").inheritIO().start();
        assertThat(runtime.waitFor(300, TimeUnit.SECONDS)).isTrue();
        assertThat(runtime.exitValue()).isZero();
        login = login("demo@codeless.local", "demo-password-for-test-only");
        other = login("admin@codeless.local", "admin-password-for-test-only");
        owner = jdbc.sql("SELECT id FROM platform_users WHERE email='demo@codeless.local'").query(UUID.class).single();
        var application = applications.create(owner, "D16 source export", null, "STATIC");
        app = application.id(); shell = application.baseVersionId();
        UUID task = queue.create(owner, app, "生成静态个人展示页，展示 Ada Lovelace 与作品", null).id();
        var claim = queue.claim().orElseThrow();
        assertThat(claim.taskId()).isEqualTo(task);
        for (var stage : List.of(TaskStatus.PLAN, TaskStatus.GENERATE, TaskStatus.VERIFY)) {
            var r = loop.execute(claim, stage);
            if (r.next() == TaskStatus.FAILED) report("prerequisite-failed", Map.of("stage", stage,
                    "failureCode", Objects.toString(r.failureCode(), "UNKNOWN"),
                    "runnerResult", Objects.toString(AgentJournal.latest(journal.read(task), "runner.result"))));
            assertThat(r.next()).as("real prerequisite %s: %s", stage, r.failureCode()).isNotEqualTo(TaskStatus.FAILED);
            loop.advance(queue, claim, r, r.next() == TaskStatus.READY ? EventType.STAGE_COMPLETED : EventType.STAGE_STARTED);
        }
        assertThat(queue.find(owner, task).orElseThrow().status()).isEqualTo(TaskStatus.READY);
        ready = applications.find(owner, app).orElseThrow().latestReadyVersionId();
        source = artifacts.findVersion(ready).orElseThrow().sourceDigest();
        var outcome = snapshots.outcome(ready, source, "VERIFIED");
        artifact = outcome.artifactDigest();
        failed = otherVersion(FAILED_MARKER, true);
        draft = otherVersion(DRAFT_MARKER, false);
        assertThat(artifacts.findVersion(failed).orElseThrow().status()).isEqualTo(VersionStatus.FAILED);
        assertThat(artifacts.findVersion(draft).orElseThrow().status()).isEqualTo(VersionStatus.DRAFT);
        report("prerequisite", Map.of("versionId", ready, "sourceDigest", source, "validation", outcome,
                "failedVersionId", failed, "draftVersionId", draft, "shellVersionId", shell,
                "realPostgresDockerChromium", true, "modelProvider", "deterministic-mock"));
    }

    /** A later version of the same application with its own frozen snapshot and a unique marker. */
    UUID otherVersion(String marker, boolean fail) throws Exception {
        UUID task = queue.create(owner, app, "D16 other version " + marker, null).id();
        var claim = queue.claim().orElseThrow();
        assertThat(claim.taskId()).isEqualTo(task);
        queue.advance(claim, TaskStatus.GENERATE, EventType.STAGE_STARTED, "Other version fixture", null);
        var created = tools.execute(task, claim.token(), "files.create", json.writeValueAsString(
                Map.of("path", "src/pages/HomePage.vue", "content", "<template><main>" + marker + "</main></template>\n")));
        assertThat(created.status()).isEqualTo("SUCCEEDED");
        var version = store.draft(claim, tools.snapshot(task, claim.token()), json.createArrayNode());
        UUID id = UUID.fromString(version.path("versionId").asText());
        assertThat(new String(snapshots.sourceBytes(id, version.path("sourceDigest").asText()).get("src/pages/HomePage.vue"),
                StandardCharsets.UTF_8)).contains(marker);
        if (fail) {
            queue.advance(claim, TaskStatus.VERIFY, EventType.STAGE_STARTED, "Unavailable fixture", null);
            store.failedBuild(claim, version, json.readTree("{\"status\":\"FAILED\",\"build\":null,\"verification\":null}"));
            queue.advance(claim, TaskStatus.FAILED, EventType.TASK_FAILED, "Unavailable fixture", "RUNNER_UNAVAILABLE");
        }
        return id;
    }

    void assertZipResponse(HttpResponse<byte[]> r) {
        assertThat(r.statusCode()).as(new String(r.body(), StandardCharsets.UTF_8)).isEqualTo(200);
        assertThat(r.headers().firstValue("Content-Type")).contains("application/zip");
        assertThat(r.headers().firstValue("Content-Disposition")).contains("attachment; filename=\"codeless-" + ready + ".zip\"");
        assertThat(r.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(r.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
        assertThat(r.headers().firstValue("X-CodeLess-Version-Id")).contains(ready.toString());
        assertThat(r.headers().firstValue("X-CodeLess-Source-Digest")).contains(source);
        assertThat(r.headers().firstValue("X-CodeLess-Artifact-Digest")).contains(artifact);
        assertThat(Arrays.copyOf(r.body(), 4)).isEqualTo(new byte[] {'P', 'K', 3, 4});
    }
    /** A rejection is a JSON error, never ZIP bytes, and does not echo planted or real secrets. */
    JsonNode assertRejected(HttpResponse<byte[]> r, int status, String code) throws Exception {
        String body = new String(r.body(), StandardCharsets.UTF_8);
        assertThat(r.statusCode()).as(body).isEqualTo(status);
        assertThat(r.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
        assertThat(r.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(r.headers().firstValue("Content-Disposition")).isEmpty();
        assertThat(body).doesNotStartWith("PK").doesNotContain(PLANTED, POSTGRES.getPassword(), "target/export-integration", WORK.toString());
        var error = json.readTree(body);
        if (code != null) assertThat(error.path("code").asText()).isEqualTo(code);
        return error;
    }

    @Test @Order(1) void d16aT1ExtractedPackageInstallsFromLockfileAndBuildsInCleanContainer() throws Exception {
        var r = export(ready, login);
        assertZipResponse(r);
        Path zip = evidence().resolve("export-" + ready + ".zip");
        Files.write(zip, r.body());
        Path work = WORK.resolve("clean-build/" + UUID.randomUUID());
        Files.createDirectories(work.getParent());
        // Reproducibility of the frozen artifact itself. The build image copies working-tree template bytes, so an image
        // built from a Windows autocrlf checkout compiled CRLF template files; the frozen index.html is the direct witness.
        boolean crlfImage = new String(snapshots.readArtifact(ready, source, "index.html"), StandardCharsets.UTF_8).contains("\r");
        // The harness exits 0 only when the build passed and any requested reproduction matched (3 = built, not reproduced).
        var result = crlfImage ? node("clean-build.mjs", work.resolve("clean-build.json"), zip.toString(), work.toString())
                : node("clean-build.mjs", work.resolve("clean-build.json"), zip.toString(), work.toString(), "--expect-artifact-digest", artifact);
        assertThat(result.path("status").asText()).isEqualTo("PASSED");
        assertThat(result.path("reproduction").asText()).isEqualTo(crlfImage ? "NOT_REQUESTED" : "REPRODUCED");
        assertThat(result.path("exitCode").asInt()).isZero();
        assertThat(result.path("distIndexHtml").asBoolean()).isTrue();
        assertThat(result.path("hostProjectUnchanged").asBoolean()).isTrue();
        assertThat(result.path("hostNodeModulesCreated").asBoolean()).isFalse();
        assertThat(result.path("lockfileErrors").asBoolean()).isFalse();
        assertThat(result.path("versionId").asText()).isEqualTo(ready.toString());
        assertThat(result.path("pnpm").asText()).isEqualTo(new ExportTemplate(REPOSITORY).load().pnpm());
        Files.copy(work.resolve("clean-build.log"), evidence().resolve("D16-A-T1-clean-build.log"), StandardCopyOption.REPLACE_EXISTING);
        JsonNode reproduction = result;
        if (!crlfImage) assertThat(result.path("artifactReproduced").asBoolean()).as("exported bytes rebuild the frozen artifact").isTrue();
        else {
            Path diagnostic = WORK.resolve("clean-build/" + UUID.randomUUID());
            reproduction = node("clean-build.mjs", diagnostic.resolve("clean-build.json"), zip.toString(), diagnostic.toString(),
                    "--expect-artifact-digest", artifact, "--crlf-template-diagnostic");
            assertThat(reproduction.path("templateLineEndings").asText()).isEqualTo("CRLF_DIAGNOSTIC_NOT_EXPORT_BYTES");
            assertThat(reproduction.path("reproduction").asText())
                    .as("only the template line-ending presentation differs from the Windows-built image").isEqualTo("REPRODUCED");
            assertThat(reproduction.path("artifactReproduced").asBoolean()).isTrue();
        }
        // A successful build with a non-matching expected digest is reported separately (exit 3), never as success.
        Path mismatch = WORK.resolve("clean-build/" + UUID.randomUUID());
        var notReproduced = nodeExit(3, "clean-build.mjs", mismatch.resolve("clean-build.json"), zip.toString(), mismatch.toString(),
                "--expect-artifact-digest", "sha256:" + "0".repeat(64));
        assertThat(notReproduced.path("status").asText()).isEqualTo("PASSED");
        assertThat(notReproduced.path("reproduction").asText()).isEqualTo("NOT_REPRODUCED");
        report("D16-A-T1", Map.of("versionId", ready, "archive", zip.getFileName().toString(), "cleanBuild", result,
                "frozenArtifactDigest", artifact, "buildImageTemplateLineEndings", crlfImage ? "CRLF" : "LF",
                "artifactReproduction", reproduction, "mismatchedExpectationExit", 3,
                "mismatchedExpectation", Map.of("status", notReproduced.path("status").asText(), "reproduction", notReproduced.path("reproduction").asText()),
                "modelProvider", "deterministic-mock"));
    }

    @Test @Order(2) void d16aT2PackageExcludesSecretsLogsDependenciesAndOtherVersions() throws Exception {
        var r = export(ready, login);
        assertZipResponse(r);
        var unzipped = unzip(r.body());
        assertThat(unzipped.root()).isEqualTo("codeless-" + ready);
        var versionSource = snapshots.sourceBytes(ready, source).keySet();
        var expected = new TreeSet<String>(ExportTemplate.FIXED);
        expected.addAll(versionSource);
        ExportTemplate.DEFAULTS.stream().filter(p -> !versionSource.contains(p)).forEach(expected::add);
        expected.addAll(List.of("README.md", "codeless-export.json"));
        assertThat(new TreeSet<>(unzipped.files().keySet())).isEqualTo(expected);
        for (String path : unzipped.files().keySet())
            assertThat(path).doesNotStartWith(".").doesNotContain("/.", "node_modules", "dist/", "fixtures", "preview-bridge")
                    .doesNotEndWith(".log").doesNotEndWith(".env").isNotEqualTo("id_rsa").isNotEqualTo("allowed-dependencies.json");
        var forbidden = List.of(PLANTED, FAILED_MARKER, DRAFT_MARKER, POSTGRES.getPassword(), "demo-password-for-test-only",
                "admin-password-for-test-only", "-----BEGIN", "_authToken");
        for (var file : unzipped.files().entrySet())
            for (String text : forbidden)
                assertThat(new String(file.getValue(), StandardCharsets.UTF_8)).as(file.getKey()).doesNotContain(text);
        Path zip = evidence().resolve("D16-A-T2-export.zip"), list = WORK.resolve("forbidden-strings.txt");
        Files.write(zip, r.body());
        Files.write(list, forbidden);
        var independent = node("verify-export.mjs", evidence().resolve("D16-A-T2-verify.json"), zip.toString(),
                "--version", ready.toString(), "--forbidden-file", list.toString(), "--out", evidence().resolve("D16-A-T2-verify.json").toString());
        assertThat(independent.path("status").asText()).isEqualTo("PASSED");
        Files.delete(zip);

        // A planted file inside the frozen version folder fails closed instead of being skipped or exported.
        Path frozen = WORK.resolve("versions").resolve(ready.toString()).resolve("source");
        var plantedResponses = new LinkedHashMap<String, Integer>();
        for (String planted : List.of(".env", "node_modules/leak.js", "src/pages/debug.log")) {
            Path file = frozen.resolve(planted);
            Files.createDirectories(file.getParent());
            Files.writeString(file, "CODELESS_DATABASE_PASSWORD=" + PLANTED);
            try {
                var rejected = export(ready, login);
                assertRejected(rejected, 503, "SNAPSHOT_PATH_REJECTED");
                plantedResponses.put(planted, rejected.statusCode());
            } finally {
                Files.delete(file);
                if (planted.startsWith("node_modules")) Files.delete(file.getParent());
            }
        }
        var restored = export(ready, login);
        assertZipResponse(restored);
        assertThat(restored.body()).isEqualTo(r.body());
        report("D16-A-T2", Map.of("versionId", ready, "members", expected, "plantedTemplateRootFiles", 9,
                "forbiddenStringsChecked", forbidden.size(), "otherVersionsPresentButExcluded", List.of(failed, draft),
                "plantedFrozenSnapshotResponses", plantedResponses, "independentVerifier", independent.path("status").asText(),
                "restoredExportIdentical", true));
    }

    @Test @Order(3) void d16aT3InvalidVersionsAndUnauthorizedDownloadsAreRejected() throws Exception {
        var results = new LinkedHashMap<String, Object>();
        results.put("anonymous", assertRejected(export(ready, null), 401, "UNAUTHENTICATED").path("code").asText());
        results.put("otherOwnerAdmin", assertRejected(export(ready, other), 404, "NOT_FOUND").path("code").asText());
        results.put("missingVersion", assertRejected(export(UUID.randomUUID(), login), 404, "NOT_FOUND").path("code").asText());
        for (String invalid : List.of("not-a-uuid", "1-1-1-1-1", "00000000-0000-0000-0000-00000000000g"))
            results.put("invalid:" + invalid, assertRejected(get("versions/" + invalid + "/export", login), 400, "INVALID_REQUEST").path("code").asText());
        results.put("initialShellDraft", assertRejected(export(shell, login), 409, "EXPORT_VERSION_UNAVAILABLE").path("code").asText());
        results.put("draftWithSnapshot", assertRejected(export(draft, login), 409, "EXPORT_VERSION_UNAVAILABLE").path("code").asText());
        results.put("failedWithSnapshot", assertRejected(export(failed, login), 409, "EXPORT_VERSION_UNAVAILABLE").path("code").asText());
        results.put("otherOwnerDraft", assertRejected(export(draft, other), 404, "NOT_FOUND").path("code").asText());
        // GET only: writes are CSRF-checked first, then have no handler.
        var post = client.send(HttpRequest.newBuilder(URI.create(base() + "versions/" + ready + "/export")).header("Cookie", login.cookie())
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofByteArray());
        results.put("postWithoutCsrf", assertRejected(post, 403, "CSRF_INVALID").path("code").asText());
        var put = client.send(HttpRequest.newBuilder(URI.create(base() + "versions/" + ready + "/export")).header("Cookie", login.cookie())
                .header("X-CSRF-Token", login.csrf()).PUT(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(put.statusCode()).isEqualTo(405);
        assertThat(new String(put.body(), StandardCharsets.UTF_8)).doesNotStartWith("PK");
        results.put("putWithCsrf", put.statusCode());
        // No path parameter exists: an injected one is ignored and cannot select other files.
        var injected = get("versions/" + ready + "/export?path=../../.env&versionId=" + failed, login);
        assertZipResponse(injected);
        assertThat(injected.body()).isEqualTo(export(ready, login).body());
        results.put("ignoredInjectedQuery", injected.statusCode());
        var traversal = get("versions/..%2F..%2F" + ready + "/export", login);
        assertThat(traversal.statusCode()).isIn(400, 404);
        assertThat(new String(traversal.body(), StandardCharsets.UTF_8)).doesNotStartWith("PK");
        results.put("encodedTraversal", traversal.statusCode());
        // Integrity failures of the frozen version are 503, never a partial or repaired package.
        Path versionRoot = WORK.resolve("versions").resolve(ready.toString());
        String member = snapshots.source(ready, source).manifest().files().getFirst().path();
        for (var tamper : List.of(versionRoot.resolve("source").resolve(member), versionRoot.resolve("outcome/report.json"))) {
            byte[] original = Files.readAllBytes(tamper);
            try {
                Files.write(tamper, (new String(original, StandardCharsets.UTF_8) + " ").getBytes(StandardCharsets.UTF_8));
                results.put("tampered:" + versionRoot.relativize(tamper).toString().replace('\\', '/'),
                        assertRejected(export(ready, login), 503, "SNAPSHOT_DIGEST_MISMATCH").path("code").asText());
            } finally {Files.write(tamper, original);}
        }
        assertZipResponse(export(ready, login));
        report("D16-A-T3", Map.of("versionId", ready, "responses", results, "failedVersionId", failed, "draftVersionId", draft));
    }

    @Test @Order(4) void d16aT4ExportedContentMatchesVersionHashes() throws Exception {
        var first = export(ready, login);
        var second = export(ready, login);
        assertZipResponse(first);
        assertThat(second.body()).as("deterministic archive bytes").isEqualTo(first.body());
        var unzipped = unzip(first.body());
        var manifest = json.treeToValue(json.readTree(unzipped.files().get("codeless-export.json")), SourceExportService.Manifest.class);
        var version = json.readTree(get("versions/" + ready, login).body());
        assertThat(manifest.versionId()).isEqualTo(ready);
        assertThat(manifest.applicationId()).isEqualTo(app);
        assertThat(manifest.status()).isEqualTo("VERIFIED");
        assertThat(manifest.versionNumber()).isEqualTo(version.path("number").asInt());
        assertThat(manifest.buildId().toString()).isEqualTo(version.path("buildId").asText());
        assertThat(manifest.sourceDigest()).isEqualTo(version.path("sourceDigest").asText()).isEqualTo(source);
        var outcome = snapshots.outcome(ready, source, "VERIFIED");
        String buildDigest = jdbc.sql("SELECT artifact_digest FROM builds WHERE id=?").param(manifest.buildId()).query(String.class).single();
        assertThat(manifest.artifactDigest()).isEqualTo(outcome.artifactDigest()).isEqualTo(buildDigest).isEqualTo(artifact);
        assertThat(manifest.reportDigest()).isEqualTo(outcome.reportDigest());
        var snapshot = json.readTree(get("versions/" + ready + "/snapshot", login).body());
        assertThat(snapshot.path("validation").path("artifactDigest").asText()).isEqualTo(manifest.artifactDigest());
        assertThat(snapshot.path("validation").path("reportDigest").asText()).isEqualTo(manifest.reportDigest());

        // Every listed file, and nothing else, with exact bytes and digest.
        var listed = new TreeMap<String, SourceExportService.FileEntry>();
        manifest.files().forEach(f -> listed.put(f.path(), f));
        var members = new TreeSet<>(unzipped.files().keySet());
        members.remove("codeless-export.json");
        assertThat(listed.keySet()).isEqualTo(members);
        for (var f : manifest.files()) {
            byte[] bytes = unzipped.files().get(f.path());
            assertThat(bytes.length).as(f.path()).isEqualTo(f.bytes());
            assertThat(LocalVolumeSnapshotStore.hash(bytes)).as(f.path()).isEqualTo(f.digest());
        }
        // Version source equals the D11 read APIs byte for byte; recomputed canonical digests match the manifest.
        var apiFiles = json.readTree(get("versions/" + ready + "/files", login).body()).path("files");
        var versionEntries = manifest.files().stream().filter(f -> f.origin().equals("VERSION_SOURCE")).toList();
        assertThat(versionEntries).hasSize(apiFiles.size());
        for (var file : apiFiles) {
            String path = file.path("path").asText();
            assertThat(listed.get(path).origin()).isEqualTo("VERSION_SOURCE");
            assertThat(listed.get(path).digest()).isEqualTo(file.path("digest").asText());
            var content = json.readTree(get("versions/" + ready + "/files/content?path=" + path, login).body()).path("content").asText();
            assertThat(unzipped.files().get(path)).isEqualTo(content.getBytes(StandardCharsets.UTF_8));
        }
        assertThat(canonical(manifest, "VERSION_SOURCE")).isEqualTo(source);
        var template = new ExportTemplate(REPOSITORY).load();
        assertThat(canonical(manifest, "TEMPLATE")).isEqualTo(manifest.templateDigest()).isEqualTo(template.digest());
        for (var e : template.fixed().entrySet()) assertThat(unzipped.files().get(e.getKey())).as(e.getKey()).isEqualTo(e.getValue());
        assertThat(canonical(manifest, null)).isEqualTo(manifest.contentDigest());
        assertThat(first.headers().firstValue("X-CodeLess-Content-Digest")).contains(manifest.contentDigest());
        String readme = new String(unzipped.files().get("README.md"), StandardCharsets.UTF_8);
        assertThat(readme).contains(ready.toString(), source, artifact, manifest.templateDigest());
        Path zip = evidence().resolve("D16-A-T4-export.zip");
        Files.write(zip, first.body());
        var independent = node("verify-export.mjs", evidence().resolve("D16-A-T4-verify.json"), zip.toString(), "--version", ready.toString(),
                "--source-digest", source, "--artifact-digest", artifact, "--out", evidence().resolve("D16-A-T4-verify.json").toString());
        assertThat(independent.path("status").asText()).isEqualTo("PASSED");
        assertThat(independent.path("recomputed").path("contentDigest").asText()).isEqualTo(manifest.contentDigest());
        Files.delete(zip);
        report("D16-A-T4", Map.of("versionId", ready, "manifest", manifest, "archiveSha256", LocalVolumeSnapshotStore.hash(first.body()),
                "deterministicBytes", true, "d11FilesMatched", apiFiles.size(), "independentVerifier", independent.path("status").asText()));
    }

    /** Traceability with D15: the publication record binds exactly the exported version and artifact digest. */
    @Test @Order(5) void exportedManifestTracesToPublicationRecord() throws Exception {
        var manifest = json.readTree(unzip(export(ready, login).body()).files().get("codeless-export.json"));
        String body = json.writeValueAsString(Map.of("applicationId", app, "versionId", ready, "artifactDigest", manifest.path("artifactDigest").asText()));
        var created = client.send(HttpRequest.newBuilder(URI.create(base() + "publications")).header("Cookie", login.cookie())
                .header("X-CSRF-Token", login.csrf()).header("Idempotency-Key", UUID.randomUUID().toString())
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(created.statusCode()).as(created.body()).isEqualTo(202);
        var publication = json.readTree(created.body());
        var deployment = json.readTree(get("publications/" + publication.path("id").asText() + "/deployment", login).body());
        assertThat(publication.path("versionId").asText()).isEqualTo(manifest.path("versionId").asText());
        assertThat(deployment.path("sourceDigest").asText()).isEqualTo(manifest.path("sourceDigest").asText());
        assertThat(deployment.path("artifactDigest").asText()).isEqualTo(manifest.path("artifactDigest").asText());
        assertThat(deployment.path("reportDigest").asText()).isEqualTo(manifest.path("reportDigest").asText());
        report("traceability", Map.of("versionId", ready, "publicationId", publication.path("id").asText(),
                "publicationStatus", publication.path("status").asText(), "deploymentPhase", deployment.path("phase").asText(),
                "sourceDigest", deployment.path("sourceDigest").asText(), "artifactDigest", deployment.path("artifactDigest").asText(),
                "reportDigest", deployment.path("reportDigest").asText(),
                "publicUrlAndCover", "not exercised: hosting worker disabled; final enabling PR verifies public URL and cover"));
    }

    String canonical(SourceExportService.Manifest manifest, String origin) {
        var entries = manifest.files().stream().filter(f -> origin == null || f.origin().equals(origin))
                .map(f -> new SnapshotStore.Entry(f.path(), f.bytes(), f.digest())).sorted(Comparator.comparing(SnapshotStore.Entry::path)).toList();
        return LocalVolumeSnapshotStore.hash(json.writeValueAsBytes(entries));
    }
}
