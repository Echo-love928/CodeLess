package dev.codeless.api.export;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import java.util.zip.CRC32;
import java.util.zip.Deflater;

/**
 * Deterministic streaming ZIP writer. Every member is a regular 0644 file below one root folder:
 * no directories, links, executable bits, extra fields, comments, data descriptors or ZIP64.
 */
final class ExportArchive {
    record Entry(String path, byte[] bytes) {}
    static final int MAX_ENTRIES = 64;
    static final int MAX_ENTRY_BYTES = 1024 * 1024;
    static final long MAX_TOTAL_BYTES = 4L * 1024 * 1024;
    static final long MAX_ARCHIVE_BYTES = 8L * 1024 * 1024;
    static final int FILE_MODE = 0100644;
    private static final int VERSION = 20, MADE_BY_UNIX = (3 << 8) | VERSION, UTF8 = 0x0800, DEFLATED = 8;

    private ExportArchive() {}

    /**
     * Portable relative member path; rejects traversal, absolute/drive paths, device names, non-ASCII,
     * hidden segments (.env, .npmrc, .git) and dependency folders even if a caller's allowlist regressed.
     */
    static void path(String path) {
        if (path == null || path.isEmpty() || path.length() > 240 || !path.matches("[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*"))
            throw new ExportFailure("EXPORT_PATH_REJECTED");
        for (String part : path.split("/", -1))
            if (part.startsWith(".") || part.endsWith(".") || part.equalsIgnoreCase("node_modules")
                    || part.matches("(?i)(?:CON|PRN|AUX|NUL|CONIN\\$|CONOUT\\$|COM[0-9]|LPT[0-9])(?:\\..*)?"))
                throw new ExportFailure("EXPORT_PATH_REJECTED");
    }

    /** Validates the complete member set before the first byte is written, so failures never yield a partial ZIP. */
    static void check(String root, List<Entry> entries) {
        path(root);
        if (root.contains("/") || entries.isEmpty() || entries.size() > MAX_ENTRIES) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
        var names = new HashSet<String>();
        long total = 0;
        for (var entry : entries) {
            path(entry.path());
            if (!names.add(entry.path().toLowerCase(Locale.ROOT))) throw new ExportFailure("EXPORT_PATH_REJECTED");
            if (entry.bytes().length > MAX_ENTRY_BYTES) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
            total += entry.bytes().length;
        }
        // A file may not also be used as a parent folder, e.g. "src" beside "src/main.ts".
        for (var entry : entries) {
            String lower = entry.path().toLowerCase(Locale.ROOT);
            for (int slash = lower.indexOf('/'); slash > 0; slash = lower.indexOf('/', slash + 1))
                if (names.contains(lower.substring(0, slash))) throw new ExportFailure("EXPORT_PATH_REJECTED");
        }
        if (total > MAX_TOTAL_BYTES) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
    }

    /** Writes entries in the given order; returns archive bytes written. Each member is compressed just before it is sent. */
    static long write(OutputStream target, String root, List<Entry> entries, LocalDateTime modified) throws IOException {
        check(root, entries);
        var out = new Counter(target);
        int time = dosTime(modified), date = dosDate(modified);
        var central = new ByteArrayOutputStream();
        for (var entry : entries) {
            byte[] name = (root + "/" + entry.path()).getBytes(StandardCharsets.US_ASCII);
            if (name.length > 255) throw new ExportFailure("EXPORT_PATH_REJECTED");
            var crc = new CRC32(); crc.update(entry.bytes());
            byte[] data = deflate(entry.bytes());
            long offset = out.count;
            int32(out, 0x04034b50); int16(out, VERSION); int16(out, UTF8); int16(out, DEFLATED);
            int16(out, time); int16(out, date); int32(out, crc.getValue());
            int32(out, data.length); int32(out, entry.bytes().length);
            int16(out, name.length); int16(out, 0); out.write(name); out.write(data);
            int32(central, 0x02014b50); int16(central, MADE_BY_UNIX); int16(central, VERSION); int16(central, UTF8);
            int16(central, DEFLATED); int16(central, time); int16(central, date); int32(central, crc.getValue());
            int32(central, data.length); int32(central, entry.bytes().length); int16(central, name.length);
            int16(central, 0); int16(central, 0); int16(central, 0); int16(central, 0);
            int32(central, (long) FILE_MODE << 16); int32(central, offset); central.write(name);
        }
        long start = out.count;
        central.writeTo(out);
        int32(out, 0x06054b50); int16(out, 0); int16(out, 0); int16(out, entries.size()); int16(out, entries.size());
        int32(out, central.size()); int32(out, start); int16(out, 0);
        out.flush();
        return out.count;
    }

    private static byte[] deflate(byte[] bytes) {
        var deflater = new Deflater(Deflater.BEST_COMPRESSION, true);
        try {
            deflater.setInput(bytes); deflater.finish();
            var result = new ByteArrayOutputStream(Math.max(64, bytes.length / 2));
            byte[] buffer = new byte[8192];
            while (!deflater.finished()) result.write(buffer, 0, deflater.deflate(buffer));
            return result.toByteArray();
        } finally { deflater.end(); }
    }

    private static int dosTime(LocalDateTime t) {
        var c = clamp(t);
        return (c.getHour() << 11) | (c.getMinute() << 5) | (c.getSecond() / 2);
    }
    private static int dosDate(LocalDateTime t) {
        var c = clamp(t);
        return ((c.getYear() - 1980) << 9) | (c.getMonthValue() << 5) | c.getDayOfMonth();
    }
    private static LocalDateTime clamp(LocalDateTime t) {
        var min = LocalDateTime.of(1980, 1, 1, 0, 0);
        var max = LocalDateTime.of(2107, 12, 31, 23, 59, 58);
        return t.isBefore(min) ? min : t.isAfter(max) ? max : t;
    }
    private static void int16(OutputStream out, int value) throws IOException {
        out.write(value & 0xff); out.write((value >>> 8) & 0xff);
    }
    private static void int32(OutputStream out, long value) throws IOException {
        if (value < 0 || value > 0xffffffffL) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
        out.write((int) (value & 0xff)); out.write((int) ((value >>> 8) & 0xff));
        out.write((int) ((value >>> 16) & 0xff)); out.write((int) ((value >>> 24) & 0xff));
    }

    /** Counts output and fails closed if the archive would exceed its fixed bound. */
    private static final class Counter extends OutputStream {
        private final OutputStream target;
        long count;
        Counter(OutputStream target) { this.target = target; }
        private void add(long bytes) {
            count += bytes;
            if (count > MAX_ARCHIVE_BYTES) throw new ExportFailure("EXPORT_LIMIT_EXCEEDED");
        }
        @Override public void write(int b) throws IOException { add(1); target.write(b); }
        @Override public void write(byte[] b, int off, int len) throws IOException { add(len); target.write(b, off, len); }
        @Override public void flush() throws IOException { target.flush(); }
    }
}
