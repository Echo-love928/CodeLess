package dev.codeless.api.versions;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class VersionFixtureGateTest {
    @Test void missingOrFailedPrerequisiteNeverAllowsAnAcceptanceCase() {
        var gate = new VersionFixtureGate();
        assertThatThrownBy(gate::require).isInstanceOf(AssertionError.class).hasMessageContaining("NOT EXECUTED");
        var original = new AssertionError("AGENT_BUILD_EXIT");
        gate.failed(original);
        gate.failed(new AssertionError("downstream failure"));
        assertThatThrownBy(gate::require).hasCause(original).hasMessageContaining("No /versions/null request");
        assertThatThrownBy(gate::ready).hasCause(original).isInstanceOf(IllegalStateException.class);
    }
    @Test void completedPrerequisiteAllowsTheUnmodifiedAcceptanceAssertions() {
        var gate = new VersionFixtureGate(); gate.ready();
        assertThatCode(gate::require).doesNotThrowAnyException();
    }
}
