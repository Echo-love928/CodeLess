// Developer-only harness: copy into A's isolated test checkout, never production API sources.
package dev.codeless.api.export;
import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;

class BSourceExportInteropTest extends SourceExportIntegrationTest {
    @Test @Order(6) void bAdapterConsumesRealOwnerStreamAndRejectsOtherSessions() throws Exception {
        assertThat(System.getenv("CODELESS_D16_B_ROOT")).isNotBlank();
        assertThat(System.getenv("CODELESS_D16_B_INTEROP_OUT")).isNotBlank();
        Path b = Path.of(System.getenv("CODELESS_D16_B_ROOT")).toAbsolutePath().normalize();
        Path out = Files.createDirectories(Path.of(System.getenv("CODELESS_D16_B_INTEROP_OUT")));
        var builder = new ProcessBuilder("node", b.resolve("tests/e2e/share/source-export-interop.mjs").toString());
        builder.directory(b.toFile());
        builder.environment().put("CODELESS_D16_B_ROOT", b.toString());
        builder.environment().put("CODELESS_D16_A_INTEROP_URL", "http://127.0.0.1:" + port);
        builder.environment().put("CODELESS_D16_A_INTEROP_COOKIE", login.cookie());
        builder.environment().put("CODELESS_D16_A_INTEROP_OTHER_COOKIE", other.cookie());
        builder.environment().put("CODELESS_D16_A_INTEROP_VERSION", ready.toString());
        builder.environment().put("CODELESS_D16_A_INTEROP_OUT", out.toString());
        var process = builder.redirectErrorStream(true).redirectOutput(out.resolve("interop.log").toFile()).start();
        assertThat(process.waitFor(90, TimeUnit.SECONDS)).isTrue();
        assertThat(process.exitValue()).as(Files.readString(out.resolve("interop.log"))).isZero();
    }
}
