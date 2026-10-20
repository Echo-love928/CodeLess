package dev.codeless.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.util.FileSystemUtils;

class AdminAuditLogTest {
    // Under target/ (a real path): java.io.tmpdir may be an 8.3 alias that the real-directory check refuses.
    private Path root;

    @BeforeEach void freshRoot() throws Exception {
        root = Path.of("target/d17a-audit-unit", UUID.randomUUID().toString()).toAbsolutePath().normalize();
        FileSystemUtils.deleteRecursively(root);
    }

    @Test void requestedThenCompletedIsReadBackNewestFirstAndRecordsAreImmutable() {
        AdminAuditLog log = new AdminAuditLog(root.toString());
        assertThat(log.entries()).isEmpty();
        UUID actor = UUID.randomUUID(), target = UUID.randomUUID();
        AdminAuditLog.Entry first = log.request("TASK_CANCEL", actor, "TASK", target, "first");
        assertThat(first.outcome()).isEqualTo("UNKNOWN");
        AdminAuditLog.Entry done = log.complete(first, "CANCELLED", "GENERATE", "FAILED");
        assertThat(done.outcome()).isEqualTo("CANCELLED");
        assertThat(done.completedAt()).isNotNull();
        assertThatThrownBy(() -> log.complete(first, "ALREADY_TERMINAL", "FAILED", "FAILED"))
                .isInstanceOf(AdminAuditLog.Unavailable.class);
        AdminAuditLog.Entry second = log.request("TASK_CANCEL", actor, "TASK", target, "second");
        AdminAuditLog reopened = new AdminAuditLog(root.toString());
        assertThat(reopened.entries()).extracting(AdminAuditLog.Entry::id).containsExactly(second.id(), first.id());
        assertThat(reopened.entries().get(1)).isEqualTo(done);
        // A request whose completion never landed stays UNKNOWN; it is never reported as success.
        assertThat(reopened.entries().getFirst().outcome()).isEqualTo("UNKNOWN");
        assertThat(reopened.entries().getFirst().completedAt()).isNull();
    }

    @Test void interruptedTemporaryWritesAreIgnoredButUnexpectedOrCorruptContentFailsClosed() throws Exception {
        AdminAuditLog log = new AdminAuditLog(root.toString());
        AdminAuditLog.Entry entry = log.request("TASK_CANCEL", UUID.randomUUID(), "TASK", UUID.randomUUID(), "x");
        Files.writeString(root.resolve(".pending-123.json"), "{\"partial\":");
        assertThat(log.entries()).hasSize(1);
        Path stray = root.resolve("notes.txt");
        Files.writeString(stray, "operator note");
        assertThatThrownBy(log::entries).isInstanceOf(AdminAuditLog.Unavailable.class);
        Files.delete(stray);
        Path orphan = root.resolve(UUID.randomUUID() + ".completed.json");
        Files.writeString(orphan, "{\"id\":\"" + orphan.getFileName().toString().substring(0, 36)
                + "\",\"outcome\":\"CANCELLED\",\"completedAt\":\"2026-10-20T00:00:00Z\"}");
        assertThatThrownBy(log::entries).isInstanceOf(AdminAuditLog.Unavailable.class);
        Files.delete(orphan);
        Files.writeString(root.resolve(entry.id() + ".requested.json"), "{\"id\":");
        assertThatThrownBy(log::entries).isInstanceOf(AdminAuditLog.Unavailable.class);
    }

    @Test void aRootThatIsNotADirectoryRefusesWritesAndReads() throws Exception {
        Files.createDirectories(root.getParent());
        Files.writeString(root, "file");
        AdminAuditLog log = new AdminAuditLog(root.toString());
        assertThatThrownBy(() -> log.request("TASK_CANCEL", UUID.randomUUID(), "TASK", UUID.randomUUID(), "x"))
                .isInstanceOf(AdminAuditLog.Unavailable.class);
        assertThatThrownBy(log::entries).isInstanceOf(AdminAuditLog.Unavailable.class);
        Files.delete(root);
    }
}
