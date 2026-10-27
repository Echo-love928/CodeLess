package dev.codeless.api.agent;

import dev.codeless.api.model.ModelProvider.Usage;
import java.util.List;
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
    @Test void outputAllowanceShrinksToTheRemainingCapInsteadOfRefusingAFittingRequest() {
        // D24-A: B's SHOW-01 call 11 reserved 9,879 input + 4,096 output; at 38,255 charged a request that size was refused, yet 1,866 output fits.
        assertThat(RuntimeBudget.outputAllowance(new RuntimeBudget.Meter(11,12,38255),9879)).isEqualTo(1866);
        assertThat(RuntimeBudget.outputAllowance(new RuntimeBudget.Meter(1,0,1636),9000)).isEqualTo(RuntimeBudget.OUTPUT_TOKENS);
        assertThat(RuntimeBudget.outputAllowance(new RuntimeBudget.Meter(1,0,50000-9000-256),9000)).isEqualTo(256);
        assertThat(RuntimeBudget.outputAllowance(new RuntimeBudget.Meter(1,0,50000-9000-255),9000)).isNull();
        assertThat(RuntimeBudget.outputAllowance(new RuntimeBudget.Meter(12,0,0),1000)).isNull();
        assertThat(RuntimeBudget.outputAllowance(new RuntimeBudget.Meter(0,0,0),0)).isNull();
        // Unknown output is charged at the allowance the provider enforced, so the cap still holds.
        assertThat(RuntimeBudget.charge(Usage.unknown(),9879,1866)).isEqualTo(new RuntimeBudget.Charge(11745,0,true,"UTF8_BYTES_PLUS_FRAMING_AND_MAX_OUTPUT"));
        assertThat(RuntimeBudget.charge(new Usage(3000,20,3020,null),9879,1866)).isEqualTo(new RuntimeBudget.Charge(3020,8725,false,"PROVIDER_USAGE"));
    }
    @Test void locatorTimeoutOnARenderedPageIsARepairableSourceFault() {
        var controller=new RepairController();
        String page="{\"build\":{\"status\":\"SUCCEEDED\",\"exitCode\":0,\"cleanup\":{\"containerRemoved\":true,\"workspaceRemoved\":true,\"errors\":[]}},"
                +"\"verification\":{\"status\":\"FAILED\",\"failure\":\"ACTION_TIMEOUT\",\"timedOut\":false,\"workerExitCode\":1,\"cleanup\":{\"browserClosed\":true},"
                +"\"error\":\"locator.check: Timeout 2000ms exceeded.\\nCall log:\\n\\u001b[2m  - waiting for getByRole('checkbox', { name: '买牛奶未完成', exact: true })\\u001b[22m\\n\","
                +"\"diagnostics\":{\"pageErrors\":[],\"consoleErrors\":[],\"blockedRequests\":[],\"failedRequests\":[],\"truncated\":false,\"visibleContent\":true}}}";
        var failure=controller.classify(json.readTree(page));
        assertThat(failure.category()).isEqualTo(RepairController.Category.CODE);assertThat(failure.code()).isEqualTo("AGENT_ACTION_TIMEOUT");
        // D21-A F1: a runtime error kept the element from rendering; the application error now reaches REPAIR.
        String blank=page.replace("\"consoleErrors\":[]","\"consoleErrors\":[\"Error: D21_EVAL_INJECTED_RUNTIME_FAULT\"]").replace("\"visibleContent\":true","\"visibleContent\":false")
                .replace("locator.check","locator.waitFor");
        var runtime=controller.classify(json.readTree(blank));
        assertThat(runtime.category()).isEqualTo(RepairController.Category.CODE);assertThat(runtime.diagnostic()).contains("D21_EVAL_INJECTED_RUNTIME_FAULT");
        // Without page evidence, with network trouble, truncated diagnostics or a navigation timeout it stays INFRASTRUCTURE.
        for(String other:List.of(page.replace("\"visibleContent\":true","\"visibleContent\":false"),
                page.replace("\"failedRequests\":[]","\"failedRequests\":[{\"url\":\"http://127.0.0.1/a.js\",\"reason\":\"HTTP_500\"}]"),
                page.replace("\"blockedRequests\":[]","\"blockedRequests\":[{\"url\":\"ws://x\",\"reason\":\"WEBSOCKET\"}]"),
                page.replace("\"truncated\":false","\"truncated\":true"),
                page.replace("locator.check: Timeout 2000ms exceeded.","page.goto: Timeout 8000ms exceeded."),
                page.replace("\"timedOut\":false","\"timedOut\":true"),
                page.replace("\"browserClosed\":true","\"browserClosed\":false"),
                page.replace("\"workerExitCode\":1","\"workerExitCode\":137")))
            assertThat(controller.classify(json.readTree(other)).category()).as(other).isEqualTo(RepairController.Category.INFRASTRUCTURE);
    }
    @Test void browserFailureUsesTheActualBrowserDiagnosticAfterSuccessfulCompilation() {
        var result=json.readTree("{\"build\":{\"status\":\"SUCCEEDED\",\"exitCode\":0,\"cleanup\":{\"containerRemoved\":true,\"workspaceRemoved\":true,\"errors\":[]},\"log\":{\"text\":\"built successfully\"}},\"verification\":{\"status\":\"FAILED\",\"failure\":\"ACTION_FAILED\",\"timedOut\":false,\"workerExitCode\":1,\"cleanup\":{\"browserClosed\":true},\"error\":\"toHaveText: expected Ada Lovelace, actual Wrong name\"}}");
        var failure=new RepairController().classify(result);
        assertThat(failure.category()).isEqualTo(RepairController.Category.CODE);
        assertThat(failure.diagnostic()).contains("actual Wrong name").doesNotContain("built successfully");
    }
}
