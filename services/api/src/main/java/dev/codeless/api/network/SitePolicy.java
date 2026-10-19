package dev.codeless.api.network;

import java.io.InputStream;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import tools.jackson.databind.json.JsonMapper;

/** Shared operator-host policy. Only dedicated two-label registrable sites are supported. */
public final class SitePolicy {
    private static final Set<String> SUFFIXES;
    private static final Set<String> BLOCKED;
    static {
        try (InputStream input = SitePolicy.class.getResourceAsStream("/network/site-policy.json")) {
            if (input == null) throw new IllegalStateException("Missing site policy");
            var policy = JsonMapper.builder().build().readTree(input);
            var suffixes = new HashSet<String>();
            var blocked = new HashSet<String>();
            policy.path("supportedSuffixes").forEach(value -> suffixes.add(value.asText()));
            policy.path("blockedSites").forEach(value -> blocked.add(value.asText()));
            if (suffixes.isEmpty() || blocked.isEmpty()) throw new IllegalStateException("Invalid site policy");
            SUFFIXES = Set.copyOf(suffixes);
            BLOCKED = Set.copyOf(blocked);
        } catch (Exception failure) {
            throw new ExceptionInInitializerError(failure);
        }
    }
    private SitePolicy() {}
    public static String site(String hostname) {
        if (hostname == null) throw new IllegalArgumentException("Dedicated supported site required");
        String host = hostname.toLowerCase(Locale.ROOT);
        String[] labels = host.split("\\.", -1);
        if (host.length() > 253 || labels.length < 3 || !SUFFIXES.contains(labels[labels.length - 1]))
            throw new IllegalArgumentException("Dedicated supported site required");
        for (String label : labels) {
            if (!label.matches("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"))
                throw new IllegalArgumentException("Invalid hostname");
        }
        String site = labels[labels.length - 2] + "." + labels[labels.length - 1];
        if (BLOCKED.contains(site)) throw new IllegalArgumentException("Multi-label or shared site unsupported");
        return site;
    }
}
