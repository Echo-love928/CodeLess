package dev.codeless.api.agent;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Explicit private-input replay of the recorded request only: no network, model, database or generated execution. */
class D28RecordedGenerationBudgetIT {
    @Test void exactRecordedSeventhRequestGainsRoomWithoutDiscardingOriginalSourceOrAcceptance() throws Exception {
        var json=JsonMapper.builder().build();
        var wire=json.readTree(Files.readString(Path.of(Objects.requireNonNull(System.getProperty("d28.request")))));
        var messages=wire.path("messages");
        String policy=messages.get(0).path("content").asText();
        var input=json.readTree(messages.get(1).path("content").asText());var saved=input.deepCopy();
        int original=RuntimeBudget.inputReservation(policy,input.toString());
        var meter=new RuntimeBudget.Meter(6,5,27492);
        assertThat(wire.path("max_tokens").asInt()).isEqualTo(351);
        assertThat(RuntimeBudget.outputAllowance(meter,original)).isEqualTo(351);
        var compact=GenerationContext.compactInput(input);
        int next=RuntimeBudget.inputReservation(policy,compact.toString());
        int allowance=RuntimeBudget.outputAllowance(meter,next);
        assertThat(allowance).isEqualTo(2304);
        for(String key:List.of("request","plan","componentIds"))assertThat(compact.path(key)).isEqualTo(input.path(key));
        for(int n=0;n<input.path("observations").size();n++)
            for(String key:input.path("observations").get(n).propertyNames())
                assertThat(compact.path("observations").get(n).path(key)).isEqualTo(input.path("observations").get(n).path(key));
        assertThat(input).isEqualTo(saved);
        var out=Map.of("measurement","EXACT_ORIGINAL_REQUEST_PROJECTION_NOT_MODEL_QUALITY","chargedBefore",27492,
                "originalInputReservation",original,"projectedInputReservation",next,"originalOutput",351,
                "projectedOutput",allowance,"remainingMissingPage",true,"originalFailureRetained",true,"paidRequests",0);
        Path file=Path.of("target/d28-recorded-generation-budget.json");
        Files.write(file,(json.writeValueAsString(out)+"\n").getBytes(StandardCharsets.UTF_8));
    }
}
