package dev.codeless.api.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import dev.codeless.api.auth.AuthFailure;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TaskEventStreamsTest {
    @Test void capacityRejectsSixtyFifthConnectionAndShutdownReleasesSlots() {
        TaskEventReplay replay = mock(TaskEventReplay.class);
        when(replay.read(any(), any(), anyInt()))
                .thenReturn(new TaskEventReplay.Snapshot(TaskStatus.PLAN, 0, List.of()));
        TaskEventStreams streams = new TaskEventStreams(replay, 500, 15000);
        UUID owner = UUID.randomUUID(), task = UUID.randomUUID();
        try {
            for (int i = 0; i < TaskEventStreams.MAX_CONNECTIONS; i++)
                streams.open(owner, task, 0, () -> true);
            assertThatThrownBy(() -> streams.open(owner, task, 0, () -> true))
                    .isInstanceOfSatisfying(AuthFailure.class, error -> {
                        assertThat(error.code()).isEqualTo("EVENT_STREAM_CAPACITY");
                        assertThat(error.status().value()).isEqualTo(503);
                    });
        } finally { streams.shutdown(); }
        // A stopped scheduler may reject work but must no longer report capacity exhaustion.
        assertThatThrownBy(() -> streams.open(owner, task, 0, () -> true))
                .isInstanceOf(java.util.concurrent.RejectedExecutionException.class);
    }

    @Test void bothTerminalStatesAndUnknownCursorRemainExplicit() {
        assertThat(new TaskEventReplay.Snapshot(TaskStatus.READY, 1, List.of()).terminal()).isTrue();
        assertThat(new TaskEventReplay.Snapshot(TaskStatus.FAILED, 1, List.of()).terminal()).isTrue();
        assertThat(new TaskEventReplay.Snapshot(TaskStatus.REPAIR, 1, List.of()).terminal()).isFalse();
        assertThatThrownBy(() -> TaskEventReplay.cursor("unknown")).isInstanceOf(AuthFailure.class);
    }
}
