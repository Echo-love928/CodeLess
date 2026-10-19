package dev.codeless.api.export;

import static org.assertj.core.api.Assertions.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.Test;

class ExportArchiveTest {
    static final LocalDateTime TIME = LocalDateTime.of(2026, 10, 19, 8, 30, 14);
    record Central(String name, int madeBy, int flags, int method, long external, int extra, int comment, long offset) {}

    static List<ExportArchive.Entry> sample() {
        return List.of(new ExportArchive.Entry("README.md", "说明\n".getBytes(StandardCharsets.UTF_8)),
                new ExportArchive.Entry("package.json", "{\"name\":\"x\"}\n".getBytes(StandardCharsets.UTF_8)),
                new ExportArchive.Entry("src/pages/HomePage.vue", "<template><main>Ada</main></template>\n".repeat(50).getBytes(StandardCharsets.UTF_8)));
    }
    static byte[] zip(List<ExportArchive.Entry> entries) throws Exception {
        var out = new ByteArrayOutputStream();
        long written = ExportArchive.write(out, "codeless-root", entries, TIME);
        assertThat(written).isEqualTo(out.size());
        return out.toByteArray();
    }
    /** Independent central-directory parse: the JDK reader does not expose Unix mode or "made by". */
    static List<Central> central(byte[] zip) {
        var b = ByteBuffer.wrap(zip).order(ByteOrder.LITTLE_ENDIAN);
        int end = zip.length - 22;
        assertThat(b.getInt(end)).isEqualTo(0x06054b50);
        assertThat(b.getShort(end + 20)).isZero();
        int count = b.getShort(end + 10) & 0xffff, size = b.getInt(end + 12), offset = b.getInt(end + 16);
        assertThat(offset + size).isEqualTo(end);
        var result = new ArrayList<Central>();
        for (int i = 0, p = offset; i < count; i++) {
            assertThat(b.getInt(p)).isEqualTo(0x02014b50);
            int nameLength = b.getShort(p + 28) & 0xffff, extra = b.getShort(p + 30) & 0xffff, comment = b.getShort(p + 32) & 0xffff;
            result.add(new Central(new String(zip, p + 46, nameLength, StandardCharsets.US_ASCII), b.getShort(p + 4) & 0xffff,
                    b.getShort(p + 8) & 0xffff, b.getShort(p + 10) & 0xffff, b.getInt(p + 38) & 0xffffffffL, extra, comment,
                    b.getInt(p + 42) & 0xffffffffL));
            p += 46 + nameLength + extra + comment;
        }
        return result;
    }

    @Test void membersRoundTripAsRegularNonExecutableFilesBelowOneRoot() throws Exception {
        byte[] zip = zip(sample());
        var read = new LinkedHashMap<String, byte[]>();
        try (var in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            for (var entry = in.getNextEntry(); entry != null; entry = in.getNextEntry()) {
                assertThat(entry.isDirectory()).isFalse();
                assertThat(entry.getTimeLocal()).isEqualTo(TIME.withSecond(14));
                read.put(entry.getName(), in.readAllBytes());
            }
        }
        assertThat(read.keySet()).containsExactly("codeless-root/README.md", "codeless-root/package.json", "codeless-root/src/pages/HomePage.vue");
        for (var entry : sample()) assertThat(read.get("codeless-root/" + entry.path())).isEqualTo(entry.bytes());
        for (var entry : central(zip)) {
            assertThat(entry.madeBy() >> 8).as("Unix host").isEqualTo(3);
            assertThat(entry.external() >>> 16).as("regular 0644 file").isEqualTo(0100644);
            assertThat(entry.external() & 0xffff).isZero();
            assertThat(entry.flags()).as("UTF-8 names, no data descriptor or encryption").isEqualTo(0x0800);
            assertThat(entry.method()).isEqualTo(8);
            assertThat(entry.extra() + entry.comment()).isZero();
        }
    }

    @Test void identicalInputProducesIdenticalArchiveBytes() throws Exception {
        assertThat(zip(sample())).isEqualTo(zip(sample()));
    }

    @Test void unsafePathsAreRejectedBeforeAnyByteIsWritten() {
        for (String path : List.of("../escape", "a/../b", "/etc/passwd", "a//b", "a/./b", "C:/x", "C:x", "a\\b", "CON", "con.txt",
                "src/pages/NUL.vue", "lpt1", "COM9.log", "trailing.", "src/pages/Home.vue.", ".env", "src/.env", ".npmrc",
                ".git/config", "node_modules/vue/index.js", "x/NODE_MODULES/y", "源码.vue", "a b", "a:b", "", "a/", "x".repeat(241))) {
            var out = new ByteArrayOutputStream();
            assertThatThrownBy(() -> ExportArchive.write(out, "codeless-root", List.of(new ExportArchive.Entry(path, new byte[1])), TIME))
                    .as(path).isInstanceOf(ExportFailure.class).hasMessage("EXPORT_PATH_REJECTED");
            assertThat(out.size()).as(path).isZero();
        }
        for (var conflict : List.of(List.of("README.md", "readme.md"), List.of("src", "src/main.ts"), List.of("SRC", "src/main.ts")))
            assertThatThrownBy(() -> ExportArchive.check("codeless-root", conflict.stream().map(p -> new ExportArchive.Entry(p, new byte[1])).toList()))
                    .as(conflict.toString()).hasMessage("EXPORT_PATH_REJECTED");
        for (String root : List.of("a/b", "..", ".hidden", "node_modules"))
            assertThatThrownBy(() -> ExportArchive.check(root, sample())).as(root).isInstanceOf(ExportFailure.class);
    }

    @Test void sizeAndCountLimitsFailClosed() {
        var big = new byte[ExportArchive.MAX_ENTRY_BYTES + 1];
        assertThatThrownBy(() -> ExportArchive.check("r", List.of(new ExportArchive.Entry("a.txt", big)))).hasMessage("EXPORT_LIMIT_EXCEEDED");
        var total = new ArrayList<ExportArchive.Entry>();
        for (int i = 0; i < 5; i++) total.add(new ExportArchive.Entry("f" + i + ".txt", new byte[ExportArchive.MAX_ENTRY_BYTES]));
        assertThatThrownBy(() -> ExportArchive.check("r", total)).hasMessage("EXPORT_LIMIT_EXCEEDED");
        var many = new ArrayList<ExportArchive.Entry>();
        for (int i = 0; i <= ExportArchive.MAX_ENTRIES; i++) many.add(new ExportArchive.Entry("f" + i + ".txt", new byte[1]));
        assertThatThrownBy(() -> ExportArchive.check("r", many)).hasMessage("EXPORT_LIMIT_EXCEEDED");
        assertThatThrownBy(() -> ExportArchive.check("r", List.of())).hasMessage("EXPORT_LIMIT_EXCEEDED");
    }
}
