package dev.codeless.api.recovery;

import dev.codeless.api.CodeLessApiApplication;
import dev.codeless.api.data.PlatformModels.TaskStatus;
import dev.codeless.api.deploy.DeploymentGateway;
import dev.codeless.api.tasks.TaskStageRunner;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.Arrays;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.type.classreading.MetadataReader;
import org.springframework.core.type.classreading.MetadataReaderFactory;

/**
 * Real API process for the D18-A-T1 kill/restart test (started only by {@link ProcessRestartRecoveryTest}).
 * It runs the production application with the production scheduler and deployment worker; only the stage runner
 * and hosting adapter are explicit fixtures that record each call. In {@code block} mode both calls block until the
 * process is killed; in {@code observe} mode any call is recorded and fails, so a restart that re-ran a stage or
 * re-published would be visible in the call logs.
 */
public final class RecoveryChildProcess {
    private RecoveryChildProcess() {}

    public static void main(String[] args) {
        Path markers = Path.of(option(args, "recovery.markers"));
        String incarnation = option(args, "recovery.incarnation");
        boolean block = "block".equals(option(args, "recovery.mode"));
        TaskStageRunner stages = (taskId, stage) -> {
            record(markers.resolve("stages.log"), incarnation + " " + taskId + " " + stage);
            if (block) hold();
            return new TaskStageRunner.StageResult(TaskStatus.FAILED, "restart fixture must not run stages", "UNEXPECTED_STAGE");
        };
        DeploymentGateway hosting = new DeploymentGateway() {
            @Override public String publish(Payload payload, Instant deadline) {
                record(markers.resolve("hosting.log"), incarnation + " publish " + payload.publicationId());
                if (block) hold();
                throw new IllegalStateException("HOSTING_UNAVAILABLE");
            }
            @Override public Probe probe(Payload payload, String url, Instant deadline) {
                record(markers.resolve("hosting.log"), incarnation + " probe " + payload.publicationId());
                throw new IllegalStateException("HOSTING_UNAVAILABLE");
            }
        };
        new SpringApplicationBuilder(CodeLessApiApplication.class)
                .initializers(context -> {
                    var beans = ((GenericApplicationContext) context).getBeanFactory();
                    beans.registerSingleton("recoveryMainClassesOnly", new MainClassesOnly());
                    beans.registerSingleton("recoveryStageRunner", stages);
                    beans.registerSingleton("recoveryHosting", hosting);
                })
                .run(args);
        record(markers.resolve("ready.log"), incarnation + " " + ProcessHandle.current().pid());
    }

    /** Scan production classes only; test configurations on the same classpath are never registered. */
    static final class MainClassesOnly extends TypeExcludeFilter {
        @Override public boolean match(MetadataReader reader, MetadataReaderFactory factory) throws IOException {
            return reader.getResource().getURL().toString().contains("/test-classes/");
        }
        @Override public boolean equals(Object other) { return other instanceof MainClassesOnly; }
        @Override public int hashCode() { return MainClassesOnly.class.hashCode(); }
    }

    private static String option(String[] args, String name) {
        return Arrays.stream(args).filter(a -> a.startsWith("--" + name + "=")).map(a -> a.substring(name.length() + 3))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("missing --" + name));
    }

    private static synchronized void record(Path log, String line) {
        try {
            Files.createDirectories(log.getParent());
            try (var channel = java.nio.channels.FileChannel.open(log, StandardOpenOption.CREATE, StandardOpenOption.APPEND,
                    StandardOpenOption.WRITE)) {
                channel.write(java.nio.ByteBuffer.wrap((line + "\n").getBytes(StandardCharsets.UTF_8)));
                channel.force(true);
            }
        } catch (IOException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static void hold() {
        try {
            Thread.sleep(Long.MAX_VALUE);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted");
        }
    }
}
