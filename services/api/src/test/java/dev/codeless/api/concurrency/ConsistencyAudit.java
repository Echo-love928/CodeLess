package dev.codeless.api.concurrency;

import static java.nio.charset.StandardCharsets.UTF_8;

import dev.codeless.api.deploy.DeploymentGateway;
import dev.codeless.api.deploy.DeploymentRecords;
import dev.codeless.api.versions.LocalVolumeSnapshotStore;
import dev.codeless.api.versions.SnapshotStore;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * D20-A-03: cross-resource invariants over one REPEATABLE READ snapshot of PostgreSQL plus the immutable version
 * store, the deployment ledger and the hosting fixture. It reads every row (the suite owns its database), so any
 * task, version or publication any race produced is checked, not just the ones a test remembered. Each violation
 * names its invariant; an empty list is the only passing result.
 */
final class ConsistencyAudit {
    record Report(Map<String, Object> checked, List<String> violations) {}

    private record TaskRow(UUID id, UUID app, String status, String failureCode, String queueState, boolean leaseCleared, int sequence) {}
    private record EventRow(UUID task, int sequence, String type, String stage, String message) {}
    private record VersionRow(UUID id, UUID app, int number, String status, String sourceDigest, UUID build, UUID task) {}
    private record BuildRow(UUID id, UUID task, UUID version, String status, Integer exitCode, String artifactDigest) {}
    private record PublicationRow(UUID id, UUID app, UUID version, UUID requestedBy, String status, String url, boolean published) {}

    private static final Set<String> TERMINAL = Set.of("READY", "FAILED");
    private static final Map<String, Set<String>> NEXT = Map.of(
            "PLAN", Set.of("GENERATE", "FAILED"), "GENERATE", Set.of("VERIFY", "FAILED"),
            "VERIFY", Set.of("REPAIR", "READY", "FAILED"), "REPAIR", Set.of("GENERATE", "FAILED"));

    private ConsistencyAudit() {}

    static Report run(JdbcClient jdbc, PlatformTransactionManager manager, SnapshotStore snapshots, DeploymentRecords records,
                      ConcurrencyHarness.Hosting hosting, Set<UUID> excludedApplications) {
        var tx = new TransactionTemplate(manager);
        tx.setReadOnly(true);
        tx.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        return tx.execute(status -> audit(jdbc, snapshots, records, hosting, excludedApplications));
    }

    private static Report audit(JdbcClient jdbc, SnapshotStore snapshots, DeploymentRecords records,
                                ConcurrencyHarness.Hosting hosting, Set<UUID> excluded) {
        var violations = new ArrayList<String>();
        Map<UUID, UUID> owners = new HashMap<>();
        Map<UUID, UUID> latest = new HashMap<>();
        jdbc.sql("SELECT id, owner_id, latest_ready_version_id FROM applications").query((rs, n) -> {
            UUID id = rs.getObject(1, UUID.class);
            owners.put(id, rs.getObject(2, UUID.class));
            if (rs.getObject(3, UUID.class) != null) latest.put(id, rs.getObject(3, UUID.class));
            return id;
        }).list();
        var tasks = jdbc.sql("SELECT id, application_id, status, failure_code, queue_state, lease_token IS NULL AND lease_expires_at IS NULL, event_sequence FROM generation_tasks")
                .query((rs, n) -> new TaskRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getBoolean(6), rs.getInt(7))).list().stream().filter(t -> !excluded.contains(t.app())).toList();
        Map<UUID, List<EventRow>> events = new HashMap<>();
        jdbc.sql("SELECT task_id, sequence, type, stage, message FROM task_events ORDER BY task_id, sequence")
                .query((rs, n) -> new EventRow(rs.getObject(1, UUID.class), rs.getInt(2), rs.getString(3), rs.getString(4), rs.getString(5)))
                .list().forEach(e -> events.computeIfAbsent(e.task(), k -> new ArrayList<>()).add(e));
        var versions = jdbc.sql("SELECT id, application_id, number, status, source_digest, build_id, source_task_id FROM application_versions")
                .query((rs, n) -> new VersionRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getInt(3), rs.getString(4),
                        rs.getString(5), rs.getObject(6, UUID.class), rs.getObject(7, UUID.class))).list()
                .stream().filter(v -> !excluded.contains(v.app())).toList();
        Map<UUID, BuildRow> builds = new HashMap<>();
        jdbc.sql("SELECT id, task_id, version_id, status, exit_code, artifact_digest FROM builds")
                .query((rs, n) -> new BuildRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class),
                        rs.getString(4), (Integer) rs.getObject(5), rs.getString(6))).list().forEach(b -> builds.put(b.id(), b));
        var publications = jdbc.sql("SELECT id, application_id, version_id, requested_by, status, url, published_at IS NOT NULL FROM publications")
                .query((rs, n) -> new PublicationRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class),
                        rs.getObject(4, UUID.class), rs.getString(5), rs.getString(6), rs.getBoolean(7))).list()
                .stream().filter(p -> !excluded.contains(p.app())).toList();

        Map<UUID, TaskRow> taskById = new HashMap<>();
        tasks.forEach(t -> taskById.put(t.id(), t));
        Map<UUID, VersionRow> versionById = new HashMap<>();
        versions.forEach(v -> versionById.put(v.id(), v));

        // E: task rows and their durable event history.
        for (TaskRow task : tasks) {
            String id = "task " + task.id();
            List<EventRow> history = events.getOrDefault(task.id(), List.of());
            for (int i = 0; i < history.size(); i++)
                if (history.get(i).sequence() != i + 1) violations.add("E1 " + id + ": event sequence is not 1..n");
            if (history.size() != task.sequence()) violations.add("E1 " + id + ": event_sequence " + task.sequence() + " but " + history.size() + " events");
            if (history.isEmpty() || !"STAGE_STARTED".equals(history.getFirst().type()) || !"PLAN".equals(history.getFirst().stage()))
                violations.add("E2 " + id + ": first event is not STAGE_STARTED/PLAN");
            long terminalEvents = history.stream().filter(ConsistencyAudit::terminalEvent).count();
            boolean terminal = TERMINAL.contains(task.status());
            if (terminal != (terminalEvents == 1) || terminalEvents > 1)
                violations.add("E3 " + id + ": status " + task.status() + " with " + terminalEvents + " terminal events");
            if (terminal && !history.isEmpty() && !(terminalEvent(history.getLast()) && history.getLast().stage().equals(task.status())))
                violations.add("E3 " + id + ": last event does not record the terminal " + task.status());
            if ("FAILED".equals(task.status()) && (task.failureCode() == null || task.failureCode().isBlank()))
                violations.add("E3 " + id + ": FAILED without failure code");
            if (terminal && (!"FINISHED".equals(task.queueState()) || !task.leaseCleared()))
                violations.add("E4 " + id + ": terminal task still " + task.queueState() + " or leased");
            if (!terminal && "FINISHED".equals(task.queueState()))
                violations.add("E4 " + id + ": nonterminal task " + task.status() + " left the queue");
            String stage = "PLAN";
            for (EventRow event : history.subList(Math.min(1, history.size()), history.size())) {
                if ("TOOL_RESULT".equals(event.type())) {
                    if (!event.stage().equals(stage)) violations.add("E5 " + id + ": tool result outside the current stage");
                    continue;
                }
                if (!NEXT.getOrDefault(stage, Set.of()).contains(event.stage()))
                    violations.add("E5 " + id + ": illegal stage change " + stage + " -> " + event.stage());
                stage = event.stage();
            }
        }

        // V: version state, its build and the frozen immutable store agree; terminal tasks leave no pending candidate.
        Map<UUID, Integer> verifiedPerTask = new HashMap<>();
        for (VersionRow version : versions) {
            String id = "version " + version.id();
            TaskRow source = version.task() == null ? null : taskById.get(version.task());
            if (version.task() != null && source == null) violations.add("V4 " + id + ": source task missing");
            if (source != null && !source.app().equals(version.app())) violations.add("V4 " + id + ": source task of another application");
            switch (version.status()) {
                case "VERIFIED" -> {
                    BuildRow build = builds.get(version.build());
                    if (build == null || !"SUCCEEDED".equals(build.status()) || !Objects.equals(build.exitCode(), 0) || build.artifactDigest() == null
                            || !build.version().equals(version.id()) || !build.task().equals(version.task()))
                        violations.add("V1 " + id + ": VERIFIED without its own successful build");
                    else {
                        try {
                            var outcome = snapshots.outcome(version.id(), version.sourceDigest(), "VERIFIED");
                            if (!build.artifactDigest().equals(outcome.artifactDigest()) || !build.id().toString().equals(outcome.report().path("buildId").asText()))
                                violations.add("V1 " + id + ": frozen outcome does not match build " + build.id());
                        } catch (RuntimeException unreadable) {
                            violations.add("V1 " + id + ": VERIFIED outcome unreadable: " + unreadable.getMessage());
                        }
                    }
                    if (version.task() != null) verifiedPerTask.merge(version.task(), 1, Integer::sum);
                    if (source != null && !"READY".equals(source.status()))
                        violations.add("V5 " + id + ": VERIFIED from a task that is " + source.status());
                }
                case "FAILED" -> {
                    if (readable(snapshots, version, "VERIFIED")) violations.add("V2 " + id + ": FAILED version has a usable VERIFIED outcome");
                    if (version.task() != null && !readable(snapshots, version, "FAILED"))
                        violations.add("V2 " + id + ": FAILED version without a frozen FAILED report");
                }
                case "DRAFT" -> {
                    if (readable(snapshots, version, "VERIFIED") || readable(snapshots, version, "FAILED"))
                        violations.add("V3 " + id + ": DRAFT already has a frozen outcome");
                    if (source != null && TERMINAL.contains(source.status()))
                        violations.add("V3 " + id + ": DRAFT left behind by " + source.status() + " task " + source.id());
                }
                default -> violations.add("V1 " + id + ": unknown status " + version.status());
            }
        }
        for (TaskRow task : tasks) {
            int verified = verifiedPerTask.getOrDefault(task.id(), 0);
            if ("READY".equals(task.status()) && verified != 1) violations.add("V5 task " + task.id() + ": READY with " + verified + " VERIFIED versions");
            if ("READY".equals(task.status()) && verified == 1) {
                VersionRow version = versions.stream().filter(v -> task.id().equals(v.task()) && "VERIFIED".equals(v.status())).findFirst().orElseThrow();
                String message = events.get(task.id()).getLast().message();
                if (!message.contains("versionId=" + version.id()) || !message.contains("buildId=" + version.build()))
                    violations.add("V5 task " + task.id() + ": READY event does not name version " + version.id());
            }
        }
        latest.forEach((app, version) -> {
            if (excluded.contains(app)) return;
            VersionRow row = versionById.get(version);
            if (row == null || !row.app().equals(app) || !"VERIFIED".equals(row.status()))
                violations.add("V6 application " + app + ": latest pointer " + version + " is not its VERIFIED version");
        });

        // P: publication rows, the binding/ledger on the private volume and what the hosting fixture served.
        var phases = new TreeMap<String, Integer>();
        for (PublicationRow publication : publications) {
            String id = "publication " + publication.id();
            if (!publication.requestedBy().equals(owners.get(publication.app()))) violations.add("P5 " + id + ": requested by a non-owner");
            VersionRow version = versionById.get(publication.version());
            BuildRow build = version == null ? null : builds.get(version.build());
            DeploymentRecords.Binding binding;
            List<DeploymentRecords.Event> ledger;
            try {
                binding = records.binding(publication.id());
                ledger = records.events(publication.id());
            } catch (RuntimeException unreadable) {
                violations.add("P1 " + id + ": binding or ledger unreadable");
                continue;
            }
            if (version == null || build == null || !"VERIFIED".equals(version.status()))
                violations.add("P1 " + id + ": bound version is not VERIFIED");
            else if (!binding.applicationId().equals(publication.app()) || !binding.versionId().equals(publication.version())
                    || !binding.ownerId().equals(publication.requestedBy()) || !binding.buildId().equals(version.build())
                    || !binding.sourceDigest().equals(version.sourceDigest()) || !binding.artifactDigest().equals(build.artifactDigest()))
                violations.add("P1 " + id + ": binding disagrees with the SQL row, version or build");
            String last = ledger.isEmpty() ? "NONE" : ledger.getLast().phase();
            phases.merge(publication.status() + "/" + last, 1, Integer::sum);
            boolean agrees = switch (publication.status()) {
                case "PUBLISHED" -> "SUCCEEDED".equals(last) && ledger.size() == 4 && publication.url() != null
                        && publication.url().startsWith("https://") && publication.published();
                case "FAILED" -> "FAILED".equals(last) && ledger.getLast().failureCode() != null && publication.url() == null && !publication.published();
                case "REQUESTED" -> Set.of("PREPARING", "PUBLISHING", "PROBING").contains(last) && publication.url() == null;
                default -> false;
            };
            if (!agrees) violations.add("P2 " + id + ": SQL " + publication.status() + " but ledger " + last);
            if (hosting == null) continue;
            int calls = hosting.calls(publication.id());
            boolean reachedHosting = ledger.stream().anyMatch(e -> "PUBLISHING".equals(e.phase()));
            if (calls > 1) violations.add("P3 " + id + ": hosted " + calls + " times");
            if (calls != (reachedHosting ? 1 : 0)) violations.add("P3 " + id + ": " + calls + " hosting calls but ledger " + ledger.stream().map(DeploymentRecords.Event::phase).toList());
            DeploymentGateway.Payload payload = hosting.payloads.get(publication.id());
            if (payload != null && (!payload.versionId().equals(publication.version()) || !payload.artifactDigest().equals(binding.artifactDigest())))
                violations.add("P4 " + id + ": hosting request names another version or digest");
            // What the location serves now, not the request that once reached the gateway (D20-B review).
            String location = ConcurrencyHarness.Hosting.location(publication.id());
            if ("PUBLISHED".equals(publication.status()) && !location.equals(publication.url()))
                violations.add("P4 " + id + ": published URL is not its own hosted location");
            Map<String, byte[]> bytes = hosting.served.get(location);
            if (bytes == null) {
                if ("PUBLISHED".equals(publication.status())) violations.add("P4 " + id + ": nothing is served at its published location");
                continue;
            }
            if (!ConcurrencyHarness.manifestDigest(bytes).equals(binding.artifactDigest()))
                violations.add("P4 " + id + ": served bytes do not hash to the bound artifact digest");
            if (version != null) {
                try {
                    var manifest = snapshots.outcome(version.id(), version.sourceDigest(), "VERIFIED").artifact().files();
                    for (var entry : manifest)
                        if (!bytes.containsKey(entry.path()) || !LocalVolumeSnapshotStore.hash(bytes.get(entry.path())).equals(entry.digest()))
                            violations.add("P4 " + id + ": served " + entry.path() + " differs from the frozen artifact");
                    if (bytes.size() != manifest.size()) violations.add("P4 " + id + ": served file set differs from the frozen artifact");
                } catch (RuntimeException unreadable) {
                    violations.add("P4 " + id + ": frozen artifact unreadable");
                }
            }
            String html = new String(bytes.getOrDefault("index.html", new byte[0]), UTF_8);
            if (html.contains("data-owner") && !html.contains("data-owner=&quot;" + publication.requestedBy()) && !html.contains("data-owner=\"" + publication.requestedBy()))
                violations.add("X1 " + id + ": served page belongs to another owner");
            for (UUID other : owners.values())
                if (!other.equals(publication.requestedBy()) && html.contains(other.toString()))
                    violations.add("X1 " + id + ": served page contains another user's id");
        }
        if (hosting != null && !hosting.overwrites.isEmpty()) violations.add("P3 hosting locations overwritten: " + hosting.overwrites);

        var checked = new LinkedHashMap<String, Object>();
        checked.put("tasks", count(tasks.stream().map(TaskRow::status).toList()));
        checked.put("events", tasks.stream().mapToInt(t -> events.getOrDefault(t.id(), List.of()).size()).sum());
        checked.put("versions", count(versions.stream().map(VersionRow::status).toList()));
        checked.put("builds", builds.size());
        checked.put("publications", phases);
        checked.put("hostingCalls", hosting == null ? null : hosting.publishes.values().stream().mapToInt(java.util.concurrent.atomic.AtomicInteger::get).sum());
        checked.put("excludedApplications", excluded.size());
        return new Report(checked, List.copyOf(violations));
    }

    private static boolean terminalEvent(EventRow event) {
        return ("STAGE_COMPLETED".equals(event.type()) && "READY".equals(event.stage()))
                || ("TASK_FAILED".equals(event.type()) && "FAILED".equals(event.stage()));
    }

    private static boolean readable(SnapshotStore snapshots, VersionRow version, String status) {
        try {
            snapshots.outcome(version.id(), version.sourceDigest(), status);
            return true;
        } catch (RuntimeException absentOrOther) {
            return false;
        }
    }

    private static Map<String, Integer> count(List<String> values) {
        var result = new TreeMap<String, Integer>();
        values.forEach(v -> result.merge(v, 1, Integer::sum));
        return result;
    }
}
