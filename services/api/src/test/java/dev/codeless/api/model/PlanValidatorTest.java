package dev.codeless.api.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

class PlanValidatorTest {
    private final PlanValidator validator = new PlanValidator();
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final Path root = Path.of("../..").toAbsolutePath().normalize();
    private String valid() throws Exception { return Files.readString(root.resolve("contracts/plan/fixtures/valid/static.json")); }

    @Test
    void sameAjvFixturesAreAcceptedOrRejectedByTheRuntimeValidator() throws Exception {
        var fixture = mapper.readTree(valid());
        assertThat(validator.validate(valid(), "STATIC")).isEqualTo(fixture);
        for (String number : List.of("1.0", "1e0")) {
            assertThat(validator.validate(valid().replace("\"schemaVersion\": 1", "\"schemaVersion\": " + number), "STATIC")
                    .get("schemaVersion").intValue()).isEqualTo(1);
        }
        assertThatThrownBy(() -> validator.validate(valid().replace("\"schemaVersion\": 1", "\"schemaVersion\": 1.5"), "STATIC"))
                .hasMessage("PLAN_INVALID");
        for (var item : mapper.readTree(Files.readString(root.resolve("contracts/plan/fixtures/invalid/cases.json")))) {
            ObjectNode candidate = (ObjectNode) fixture.deepCopy();
            String pointer = item.get("pointer").asText();
            int split = pointer.lastIndexOf('/');
            ObjectNode parent = (ObjectNode) candidate.at(pointer.substring(0, split));
            parent.set(pointer.substring(split + 1), item.get("value"));
            assertThatThrownBy(() -> validator.validate(candidate.toString(), "STATIC"))
                    .as(item.get("name").asText()).isInstanceOf(ModelFailure.class);
        }
    }

    @Test
    void invalidJsonDuplicateKeysTrailingValuesAndCodeFencesCannotBePlans() throws Exception {
        String valid = valid();
        for (String invalid : List.of("null", "{}", "[]", "{", valid + " {}", "```json\n" + valid + "\n```",
                valid.replace("\"schemaVersion\": 1", "\"schemaVersion\": 1, \"schemaVersion\": 1"))) {
            assertThatThrownBy(() -> validator.validate(invalid, "STATIC")).isInstanceOf(ModelFailure.class);
        }
    }

    @Test
    void validatesTemplateReferencesCaseCollisionsDataModeAndAcceptanceCoverage() throws Exception {
        ObjectNode valid = (ObjectNode) mapper.readTree(valid());
        assertThatThrownBy(() -> validator.validate(valid.toString(), "LOCAL_STORAGE")).hasMessage("PLAN_DATA_MODE");
        for (String pointer : List.of("/pages/0/file", "/components/0/file", "/acceptance/0/route")) {
            ObjectNode plan = valid.deepCopy();
            int split = pointer.lastIndexOf('/');
            ((ObjectNode) plan.at(pointer.substring(0, split))).put(pointer.substring(split + 1),
                    pointer.endsWith("route") ? "/tasks" : "src/pages/TasksPage.vue");
            assertThatThrownBy(() -> validator.validate(plan.toString(), "STATIC")).isInstanceOf(ModelFailure.class);
        }
        var duplicate = valid.deepCopy();
        ((tools.jackson.databind.node.ArrayNode) duplicate.get("files")).add(duplicate.get("files").get(0).deepCopy());
        assertThatThrownBy(() -> validator.validate(duplicate.toString(), "STATIC")).isInstanceOf(ModelFailure.class);
        var caseCollision = valid.deepCopy();
        var files = (tools.jackson.databind.node.ArrayNode) caseCollision.get("files");
        files.addObject().put("path", "src/data/Seed.ts").put("purpose", "Static seed data");
        files.addObject().put("path", "src/data/seed.ts").put("purpose", "Colliding seed data");
        assertThatThrownBy(() -> validator.validate(caseCollision.toString(), "STATIC")).hasMessage("PLAN_INVALID");
        var uncovered = valid.deepCopy();
        ((tools.jackson.databind.node.ArrayNode) uncovered.get("pages")).addObject().put("route", "/tasks")
                .put("file", "src/pages/TasksPage.vue").put("title", "Tasks").put("purpose", "Local tasks");
        ((tools.jackson.databind.node.ArrayNode) uncovered.get("files")).addObject()
                .put("path", "src/pages/TasksPage.vue").put("purpose", "Task page");
        assertThatThrownBy(() -> validator.validate(uncovered.toString(), "STATIC")).hasMessage("PLAN_INVALID");
        var wrongName = valid.deepCopy();
        ((ObjectNode) wrongName.at("/components/0")).put("name", "Other");
        assertThatThrownBy(() -> validator.validate(wrongName.toString(), "STATIC")).isInstanceOf(ModelFailure.class);
    }

    @Test
    void explicitUnsupportedUserRequestsAreRejectedBeforeTheMockCanPretendSuccess() {
        var generator = new PlanGenerator(new MockModelProvider(), validator);
        for (String request : List.of("生成后端", "接入微信支付", "use Stripe payment", "接入外部接口", "pnpm add axios", "使用 React",
                "Create a casino backend", "Create a piano backend", "Create a techno backend, no payment")) {
            assertThatThrownBy(() -> generator.generate(request, "STATIC", 1024, Duration.ofSeconds(1)))
                    .hasMessage("PLAN_UNSUPPORTED_REQUEST");
        }
        assertThat(generator.generate("静态个人展示页，无需后端，不需要支付", "STATIC", 1024, Duration.ofSeconds(1)).plan()).isNotNull();
        for (String request : List.of("Static portfolio, no backend and no payment", "Static page WITHOUT backend",
                "Static page without backend and without external services")) {
            assertThat(generator.generate(request, "STATIC", 1024, Duration.ofSeconds(1)).plan()).isNotNull();
        }
    }

    @Test
    void mockIsDeterministicExplicitlyNamedAndNeverInventsUsage() {
        var mock = new MockModelProvider();
        var generator = new PlanGenerator(mock, validator);
        for (String mode : List.of("STATIC", "MOCK", "LOCAL_STORAGE")) {
            var first = generator.generate("个人展示页", mode, 1024, Duration.ofSeconds(1));
            assertThat(first).isEqualTo(generator.generate("个人展示页", mode, 1024, Duration.ofSeconds(1)));
            assertThat(first.evidence().usage().inputTokens()).isNull();
            assertThat(first.evidence().usage().outputTokens()).isNull();
        }
        assertThat(mock.id()).isEqualTo("deterministic-mock");
    }

    @Test
    void preservesActualUsageWithoutEstimatingMissingOrAcceptingInvalidCounts() {
        var usage = ModelProvider.Usage.from(mapper.readTree("{\"prompt_tokens\":3,\"completion_tokens\":0,\"prompt_cache_hit_tokens\":2}"));
        assertThat(usage.inputTokens()).isEqualTo(3);
        assertThat(usage.outputTokens()).isZero();
        assertThat(usage.totalTokens()).isNull();
        assertThat(usage.raw().get("prompt_cache_hit_tokens").intValue()).isEqualTo(2);
        for (String invalid : List.of("{\"prompt_tokens\":-1}", "{\"prompt_tokens\":1.5}", "{\"prompt_tokens\":\"4\"}", "{\"completion_tokens\":2147483648}", "[]"))
            assertThatThrownBy(() -> ModelProvider.Usage.from(mapper.readTree(invalid))).hasMessage("MODEL_INVALID_USAGE");
        assertThat(ModelProvider.Usage.from(mapper.readTree("{}"))).isEqualTo(new ModelProvider.Usage(null, null, null, mapper.readTree("{}")));
    }
}
