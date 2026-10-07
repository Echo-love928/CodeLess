package dev.codeless.api.agent;

import dev.codeless.api.model.ModelProvider.Usage;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class RepairPolicyTest {
    private final JsonMapper json=JsonMapper.builder().build();
    @Test void missingCountersUseAvailableUsageAndKeepAnExplicitEstimate() {
        assertThat(RuntimeBudget.charge(Usage.unknown(),1000)).isEqualTo(new RuntimeBudget.Charge(5096,0,true,"UTF8_BYTES_PLUS_FRAMING_AND_MAX_OUTPUT"));
        assertThat(RuntimeBudget.charge(new Usage(20,null,null,null),1000).chargedTokens()).isEqualTo(4116);
        assertThat(RuntimeBudget.charge(new Usage(null,20,null,null),1000).chargedTokens()).isEqualTo(1020);
        assertThat(RuntimeBudget.charge(new Usage(null,null,120,null),1000)).isEqualTo(new RuntimeBudget.Charge(120,4976,false,"PROVIDER_USAGE"));
        assertThat(RuntimeBudget.charge(new Usage(100,100,50,null),1000).chargedTokens()).isEqualTo(200);
        assertThat(RuntimeBudget.charge(new Usage(Integer.MAX_VALUE,Integer.MAX_VALUE,null,null),1000).chargedTokens()).isEqualTo(4294967294L);
    }
    @Test void onlyConfirmedCodeErrorsAreRepairableAndNetworkOrUnknownNeverIs() {
        var controller=new RepairController();
        var result=json.readTree("{\"build\":{\"status\":\"FAILED\",\"timedOut\":false,\"oomKilled\":false,\"cleanup\":{\"containerRemoved\":true,\"workspaceRemoved\":true,\"errors\":[]},\"failure\":\"BUILD_EXIT\",\"exitCode\":2,\"log\":{\"text\":\"src/pages/HomePage.vue: error TS2307: Cannot find module\"}}}");
        assertThat(controller.classify(result).category()).isEqualTo(RepairController.Category.CODE);
        ((tools.jackson.databind.node.ObjectNode)result.path("build")).put("exitCode",125);
        assertThat(controller.classify(result).category()).isEqualTo(RepairController.Category.INFRASTRUCTURE);
        assertThat(controller.classify(json.readTree("{\"failure\":\"RUNNER_UNAVAILABLE\"}")).category()).isEqualTo(RepairController.Category.INFRASTRUCTURE);
        assertThat(controller.category("MODEL_NETWORK")).isEqualTo(RepairController.Category.MODEL_INTERFACE);
        assertThat(controller.classify(json.readTree("{\"verification\":{\"failure\":\"RESOURCE_FAILED\"}}")).category()).isEqualTo(RepairController.Category.INFRASTRUCTURE);
        assertThat(controller.classify(json.readTree("{\"status\":\"FAILED\"}")).code()).isEqualTo("AGENT_RUNNER_UNAVAILABLE");
    }
    @Test void browserFailureUsesTheActualBrowserDiagnosticAfterSuccessfulCompilation() {
        var result=json.readTree("{\"build\":{\"status\":\"SUCCEEDED\",\"exitCode\":0,\"cleanup\":{\"containerRemoved\":true,\"workspaceRemoved\":true,\"errors\":[]},\"log\":{\"text\":\"built successfully\"}},\"verification\":{\"status\":\"FAILED\",\"failure\":\"ACTION_FAILED\",\"timedOut\":false,\"workerExitCode\":1,\"cleanup\":{\"browserClosed\":true},\"error\":\"toHaveText: expected Ada Lovelace, actual Wrong name\"}}");
        var failure=new RepairController().classify(result);
        assertThat(failure.category()).isEqualTo(RepairController.Category.CODE);
        assertThat(failure.diagnostic()).contains("actual Wrong name").doesNotContain("built successfully");
    }
}
