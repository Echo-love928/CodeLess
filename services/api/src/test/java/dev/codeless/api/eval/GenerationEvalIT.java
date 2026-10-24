package dev.codeless.api.eval;

import dev.codeless.api.agent.*;
import dev.codeless.api.data.*;
import dev.codeless.api.data.PlatformModels.*;
import dev.codeless.api.model.*;
import dev.codeless.api.tasks.*;
import dev.codeless.api.tools.*;
import dev.codeless.api.versions.SnapshotStore;
import java.io.File;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.regex.*;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * D21-A evaluation harness: exactly one frozen sample per JVM, driven by scripts/eval/run-batch.mjs.
 * Never discovered by default Surefire. It records raw truth only; it never asserts READY, because a
 * failed generation is a valid evaluation outcome. A nonzero exit means the harness itself failed.
 */
@SpringBootTest(properties={"codeless.model.provider=deterministic-mock","codeless.agent.enabled=true","codeless.agent.repository-root=../.."})
class GenerationEvalIT extends PostgresTestBase {
    static final Path ROOT=Path.of("target","d21-eval",UUID.randomUUID().toString()).toAbsolutePath().normalize();
    static final String MISSING="d21-eval-mock-mode-no-credential";
    @DynamicPropertySource static void roots(DynamicPropertyRegistry registry) {
        registry.add("codeless.agent.private-root",()->ROOT.resolve("private").toString());
        registry.add("CODELESS_FILE_WORKSPACE_ROOT",()->ROOT.resolve("workspaces").toString());
        registry.add("CODELESS_FILE_AUDIT_ROOT",()->ROOT.resolve("file-audit").toString());
        registry.add("codeless.model.audit-root",()->ROOT.resolve("models").toString());
    }
    @Autowired PlatformRepository repository;@Autowired TaskQueueService queue;@Autowired AgentRunStore store;
    @Autowired AgentJournal journal;@Autowired AgentEvidence evidence;@Autowired PlanValidator validator;
    @Autowired FileToolRegistry registry;@Autowired FileToolService files;@Autowired ModelCallRepository calls;
    @Autowired ModelCallAudit audit;@Autowired BuildGateway gateway;@Autowired JdbcClient jdbc;@Autowired SnapshotStore snapshots;
    final JsonMapper json=JsonMapper.builder().build();

    @Test void oneFrozenSample() throws Exception {
        Path output=Path.of(required("CODELESS_EVAL_OUTPUT_DIR")).toAbsolutePath().normalize();
        JsonNode spec=json.readTree(Files.readString(Path.of(required("CODELESS_EVAL_SAMPLE_FILE")),StandardCharsets.UTF_8));
        var record=new LinkedHashMap<String,Object>();
        record.put("schemaVersion",1);record.put("sampleId",spec.path("sampleId").asText());record.put("kind",spec.path("kind").asText());
        record.put("batchId",spec.path("batchId").asText());record.put("mode",spec.path("mode").asText());record.put("attempt",1);
        var harness=new LinkedHashMap<String,Object>();record.put("harness",harness);
        harness.put("java",System.getProperty("java.version"));harness.put("os",System.getProperty("os.name"));
        harness.put("runtimeBudget",Map.of("repairRounds",RuntimeBudget.REPAIRS,"modelRequests",RuntimeBudget.MODEL_CALLS,
                "toolSlots",RuntimeBudget.TOOL_CALLS,"chargedTokens",RuntimeBudget.TOKENS,"outputTokensPerRequest",RuntimeBudget.OUTPUT_TOKENS,
                "framingTokensPerRequest",RuntimeBudget.FRAMING_TOKENS));
        EvalProvider provider=null;UUID task=null;UUID app=null;Throwable failure=null;
        Instant started=Instant.now();
        try {
            String mode=spec.path("mode").asText();
            if(!Set.of("REAL","MOCK").contains(mode)) throw new IllegalStateException("mode must be REAL or MOCK");
            if(mode.equals("REAL") && !"1".equals(System.getenv("CODELESS_EVAL_REAL_APPROVED")))
                throw new IllegalStateException("REAL samples require CODELESS_EVAL_REAL_APPROVED=1");
            checkBudget(spec.path("runConfig").path("runtimeBudget"));
            JsonNode requirement=spec.path("requirement"),fault=spec.path("fault");
            String injection=fault.path("injection").asText("");
            harness.put("environment",environment(injection));
            boolean deadRoute=injection.equals("MODEL_ENDPOINT_UNREACHABLE");
            // A MOCK dry run of the dead-route fault still exercises the real DeepSeek transport, with no credential;
            // its calls are labelled as the mock provider so a dry run can never be mistaken for model evidence.
            ModelProvider base=mode.equals("MOCK") && !deadRoute?new SyntheticCounters(new MockModelProvider()):
                    new DeepSeekModelProvider(mode.equals("REAL")?System.getenv("CODELESS_MODEL_API_KEY"):MISSING,
                            mode.equals("REAL")?System.getenv("CODELESS_MODEL_NAME"):"d21-eval-unreachable");
            // Private diagnosis only (D24-A): a REAL sample's complete request/reply bytes go to the batch's private root,
            // never into the committed record. Requests, replies, budget and the absence of retries are unchanged.
            String capture=System.getenv("CODELESS_EVAL_PRIVATE_CAPTURE_DIR");
            ModelProvider wire=mode.equals("REAL") && !deadRoute && capture!=null && !capture.isBlank()
                    ?new PrivateModelCapture((DeepSeekModelProvider)base,Path.of(capture)):base;
            provider=new EvalProvider(wire,fault.path("class").asText().equals("CODE")?fault:null,requirement.path("category").asText(),
                    mode.equals("MOCK") && deadRoute?"deterministic-mock":null);
            harness.put("provider",Map.of("id",provider.id(),"model",provider.model(),"transport",base.getClass().getSimpleName(),
                    "privateCapture",wire!=base));
            UUID owner=UUID.randomUUID();app=UUID.randomUUID();
            repository.createUser(owner,"d21-eval-"+spec.path("sampleId").asText().toLowerCase(Locale.ROOT)+"@eval.codeless.test","D21 evaluation");
            repository.createApplication(app,owner,requirement.path("applicationName").asText(),DataMode.valueOf(requirement.path("dataMode").asText()));
            task=queue.create(owner,app,requirement.path("prompt").asText(),null).id();
            harness.put("taskId",task.toString());
            var loop=new AgentLoop(store,new AgentModel(provider,calls,audit,store),validator,registry,files,gateway,evidence);
            new TaskScheduler(queue,loop).tick();
        } catch(Throwable error) {
            failure=error;
        } finally {
            Instant finished=Instant.now();
            harness.put("startedAt",started.toString());harness.put("finishedAt",finished.toString());
            harness.put("wallClockMs",Duration.between(started,finished).toMillis());
            System.clearProperty("https.proxyHost");System.clearProperty("https.proxyPort");
            try {collect(record,output,task,app,provider);}
            catch(Throwable error) {if(failure==null) failure=error; else failure.addSuppressed(error);}
            if(failure!=null) record.put("harnessError",Map.of("type",failure.getClass().getName(),"message",String.valueOf(failure.getMessage())));
            else record.put("harnessError",null);
            write(output.resolve("record.json"),pretty(record));
        }
        if(failure instanceof Exception error) throw error;
        if(failure!=null) throw new IllegalStateException(failure);
    }

    /** Detects config drift between the frozen run configuration and the platform constants. */
    static void checkBudget(JsonNode frozen) {
        var actual=Map.of("repairRounds",RuntimeBudget.REPAIRS,"modelRequests",RuntimeBudget.MODEL_CALLS,"toolSlots",RuntimeBudget.TOOL_CALLS,
                "chargedTokens",RuntimeBudget.TOKENS,"outputTokensPerRequest",RuntimeBudget.OUTPUT_TOKENS,"framingTokensPerRequest",RuntimeBudget.FRAMING_TOKENS);
        for(var entry:actual.entrySet())
            if(frozen.path(entry.getKey()).asInt(-1)!=entry.getValue())
                throw new IllegalStateException("Frozen runtime budget drifted: "+entry.getKey());
    }

    /** Proves the labelled environment condition is actually in effect before any model call. */
    static Map<String,Object> environment(String injection) throws Exception {
        var observed=new LinkedHashMap<String,Object>();
        boolean cli=containerCliOnPath();
        observed.put("containerCliOnPath",cli);
        if(injection.equals("CONTAINER_CLI_UNAVAILABLE")==cli)
            throw new IllegalStateException(cli?"Environment fault not in effect: container CLI still on PATH":"Container CLI missing outside the labelled fault");
        if(injection.equals("MODEL_ENDPOINT_UNREACHABLE")) {
            int port;
            try(var socket=new ServerSocket(0,1,InetAddress.getLoopbackAddress())) {port=socket.getLocalPort();}
            System.setProperty("https.proxyHost","127.0.0.1");System.setProperty("https.proxyPort",Integer.toString(port));
            String tcp;
            try(var probe=new Socket()) {probe.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(),port),2000);tcp="CONNECTED";}
            catch(ConnectException refused) {tcp="REFUSED";}
            String route;
            // Credential-free probe through the same default proxy selector the provider uses.
            try {
                int status=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
                        .send(HttpRequest.newBuilder(URI.create("https://api.deepseek.com/")).timeout(Duration.ofSeconds(10)).GET().build(),
                                HttpResponse.BodyHandlers.discarding()).statusCode();
                route="HTTP_"+status;
            } catch(java.io.IOException unreachable) {route="FAILED_"+unreachable.getClass().getSimpleName();}
            observed.put("proxy","127.0.0.1:"+port);observed.put("proxyTcpProbe",tcp);observed.put("providerRouteProbe",route);
            if(!tcp.equals("REFUSED") || route.startsWith("HTTP_")) throw new IllegalStateException("Environment fault not in effect: provider route reachable");
        }
        return observed;
    }
    static boolean containerCliOnPath() {
        String path=Optional.ofNullable(System.getenv("PATH")).orElse("");
        for(String directory:path.split(Pattern.quote(File.pathSeparator))) {
            if(directory.isBlank()) continue;
            for(String name:List.of("docker","docker.exe","docker.cmd","docker.bat"))
                try {if(Files.isRegularFile(Path.of(directory.strip(),name))) return true;} catch(InvalidPathException ignored) { /* not a directory */ }
        }
        return false;
    }

    private void collect(Map<String,Object> record,Path output,UUID task,UUID app,EvalProvider provider) throws Exception {
        record.put("injection",provider==null?null:provider.injection.isEmpty()?null:provider.injection);
        if(task==null) {record.put("task",null);return;}
        record.put("application",row("SELECT id,name,data_mode,status,latest_ready_version_id,created_at,updated_at FROM applications WHERE id=?",app));
        record.put("task",row("SELECT id,application_id,prompt,status,repair_attempts,failure_code,event_sequence,queue_state,deadline_at,created_at,updated_at FROM generation_tasks WHERE id=?",task));
        record.put("taskEvents",rows("SELECT id,sequence,type,stage,message,occurred_at FROM task_events WHERE task_id=? ORDER BY sequence",task));
        record.put("versions",rows("SELECT id,number,source_digest,status,build_id,source_task_id,created_at,updated_at FROM application_versions WHERE application_id=? ORDER BY number",app));
        record.put("builds",rows("SELECT id,version_id,status,exit_code,artifact_digest,created_at,completed_at FROM builds WHERE task_id=? ORDER BY created_at,id",task));
        record.put("modelCalls",rows("SELECT id,stage,provider,model,status,input_tokens,output_tokens,error_code,created_at,completed_at FROM model_calls WHERE task_id=? ORDER BY created_at,id",task));
        var audits=new ArrayList<JsonNode>();
        Path models=ROOT.resolve("models");
        if(Files.isDirectory(models)) try(var list=Files.list(models)) {
            for(Path file:list.sorted().toList()) if(file.getFileName().toString().matches("[0-9a-f-]{36}\\.json")) audits.add(json.readTree(Files.readString(file)));
        }
        audits.sort(Comparator.comparing(node->node.path("createdAt").asText()));
        record.put("modelAudit",audits);
        List<JsonNode> events;
        try {events=journal.read(task);} catch(RuntimeException unavailable) {events=List.of();record.put("journalError",unavailable.getMessage());}
        record.put("journal",events);
        try {record.put("platformMeter",RuntimeBudget.meter(events));} catch(RuntimeException invalid) {record.put("platformMeter",null);}
        var numbers=new HashMap<String,Integer>();
        for(var version:rows("SELECT id,number FROM application_versions WHERE application_id=?",app))
            numbers.put(String.valueOf(version.get("id")),((Number)version.get("number")).intValue());
        var sources=new ArrayList<Map<String,Object>>();
        for(var event:events) {
            if(!event.path("kind").asText().equals("draft")) continue;
            var draft=event.path("payload");String versionId=draft.path("versionId").asText();
            int number=numbers.getOrDefault(versionId,-1);
            var copied=new ArrayList<Map<String,Object>>();
            for(var entry:snapshots.sourceBytes(UUID.fromString(versionId),draft.path("sourceDigest").asText()).entrySet()) {
                Path target=output.resolve("source").resolve("v"+number).resolve(entry.getKey()).normalize();
                if(!target.startsWith(output.resolve("source"))) throw new IllegalStateException("source path escaped output");
                Files.createDirectories(target.getParent());Files.write(target,entry.getValue(),StandardOpenOption.CREATE_NEW);
                copied.add(Map.of("path",entry.getKey(),"bytes",entry.getValue().length,"sha256",sha(entry.getValue())));
            }
            copied.sort(Comparator.comparing(file->String.valueOf(file.get("path"))));
            sources.add(Map.of("versionId",versionId,"number",number,"sourceDigest",draft.path("sourceDigest").asText(),"directory","source/v"+number,"files",copied));
        }
        record.put("sources",sources);
        var screenshots=new ArrayList<Map<String,Object>>();
        for(var event:events) {
            if(!event.path("kind").asText().equals("runner.result")) continue;
            var shot=event.path("payload").path("verification").path("screenshot");
            if(!shot.path("path").isString()) continue;
            byte[] png=Files.readAllBytes(Path.of(shot.path("path").asText()));
            if(!sha(png).equals(shot.path("digest").asText())) throw new IllegalStateException("screenshot digest mismatch");
            String id=event.path("payload").path("verification").path("id").asText();
            Path target=output.resolve("screenshots").resolve(id+".png");
            Files.createDirectories(target.getParent());Files.write(target,png,StandardOpenOption.CREATE_NEW);
            screenshots.add(Map.of("verificationId",id,"path","screenshots/"+id+".png","bytes",png.length,"sha256",sha(png)));
        }
        record.put("screenshots",screenshots);
    }
    private Map<String,Object> row(String sql,UUID id) {var all=rows(sql,id);return all.isEmpty()?null:all.getFirst();}
    private List<Map<String,Object>> rows(String sql,UUID id) {
        return jdbc.sql(sql).param(id).query().listOfRows().stream().map(GenerationEvalIT::plain).toList();
    }
    private static Map<String,Object> plain(Map<String,Object> row) {
        var value=new LinkedHashMap<String,Object>();
        row.forEach((key,cell)->value.put(camel(key),cell==null?null:cell instanceof java.sql.Timestamp time?time.toInstant().toString():
                cell instanceof OffsetDateTime time?time.toInstant().toString():cell instanceof Number || cell instanceof Boolean?cell:cell.toString()));
        return value;
    }
    private static String camel(String column) {
        var out=new StringBuilder();boolean upper=false;
        for(char c:column.toLowerCase(Locale.ROOT).toCharArray()) {if(c=='_'){upper=true;continue;}out.append(upper?Character.toUpperCase(c):c);upper=false;}
        return out.toString();
    }
    private String pretty(Object value) {
        String text=json.writerWithDefaultPrettyPrinter().writeValueAsString(value)+"\n";
        // Local filesystem prefixes are not evaluation data; replace them in every JSON escaping form.
        for(var prefix:List.of(Map.entry(ROOT.toString(),"<run-root>"),Map.entry(Path.of("../..").toAbsolutePath().normalize().toString(),"<repo>"),
                Map.entry(Optional.ofNullable(System.getenv("USERPROFILE")).orElse(System.getProperty("user.home")),"<user-home>"))) {
            if(prefix.getKey()==null || prefix.getKey().length()<4) continue;
            text=text.replace(prefix.getKey().replace("\\","\\\\"),prefix.getValue()).replace(prefix.getKey().replace("\\","/"),prefix.getValue());
        }
        return text;
    }
    private static void write(Path path,String text) throws Exception {
        Files.createDirectories(path.getParent());Files.writeString(path,text,StandardCharsets.UTF_8,StandardOpenOption.CREATE_NEW);
    }
    static String sha(byte[] bytes) throws Exception {return "sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    static String required(String name) {
        String value=System.getenv(name);
        if(value==null || value.isBlank()) throw new IllegalStateException(name+" is required; run scripts/eval/run-batch.mjs");
        return value;
    }

    /** Pass-through provider. A CODE fault is injected once, after the real GENERATE done, through production tools. */
    final class EvalProvider implements ModelProvider {
        final ModelProvider delegate;final JsonNode fault;final String category;final String label;
        final Map<String,Object> injection=new LinkedHashMap<>();
        EvalProvider(ModelProvider delegate,JsonNode fault,String category,String label){
            this.delegate=delegate;this.fault=fault;this.category=category;this.label=label;
        }
        public String id(){return label==null?delegate.id():label;}
        public String model(){return label==null?delegate.model():"dead-route-transport";}
        @Override public Map<String,Object> requestMetadata(Prompt prompt,int max){return delegate.requestMetadata(prompt,max);}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            var reply=delegate.call(prompt,max,timeout);
            if(fault==null || !injection.isEmpty()) return reply;
            JsonNode input=json.readTree(prompt.getUserMessage().getText()),proposal;
            try {proposal=json.readTree(reply.content());} catch(RuntimeException invalid) {return reply;}
            if(!"GENERATE".equals(input.path("phase").asText()) || !"done".equals(proposal.path("type").asText())) return reply;
            try {inject(input.path("plan"),reply.content());}
            catch(AgentFailure budget) {injection.put("status","STOPPED_BY_PLATFORM");injection.put("code",budget.getMessage());throw budget;}
            catch(RuntimeException error) {
                injection.put("status","HARNESS_ERROR");injection.put("error",error.getClass().getSimpleName()+": "+error.getMessage());
                throw new AgentFailure("AGENT_INTERNAL_ERROR");
            }
            return reply; // The provider's done/actions stay byte-for-byte unchanged.
        }
        private void inject(JsonNode plan,String rawDone) {
            injection.put("faultId",fault.path("id").asText());injection.put("injection",fault.path("injection").asText());
            injection.put("origin",fault.path("origin").asText());injection.put("timing",fault.path("timing").asText());
            injection.put("status","STARTED");
            String route=switch(category){case "TASKS"->"/tasks";case "CATALOG"->"/catalog";default->"/";};
            JsonNode page=null;
            for(JsonNode candidate:plan.path("pages")) if(candidate.path("route").asText().equals(route)) page=candidate;
            if(page==null) page=plan.path("pages").path(0);
            String path=page.path("file").asText();
            injection.put("target",path);injection.put("targetRoute",page.path("route").asText());
            var active=jdbc.sql("SELECT id,lease_token FROM generation_tasks WHERE status='GENERATE' AND queue_state='RUNNING'")
                    .query((rs,n)->new TaskQueueService.Claim((UUID)rs.getObject(1),(UUID)rs.getObject(2),TaskStatus.GENERATE)).list();
            if(active.size()!=1) throw new IllegalStateException("expected one running GENERATE task");
            var claim=active.getFirst();
            store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);
            var read=files.execute(claim.taskId(),claim.token(),"files.read",json.writeValueAsString(Map.of("path",path)));
            store.append(claim,TaskStatus.GENERATE,"tool.result",read);
            if(!"SUCCEEDED".equals(read.status())) throw new IllegalStateException("injection read failed: "+read.errorCode());
            var placed=place(read.content(),fault.path("snippet").asText(),fault.path("placement").asText());
            store.reserve(claim,TaskStatus.GENERATE,"tool.request",0);
            var update=files.execute(claim.taskId(),claim.token(),"files.update",json.writeValueAsString(
                    Map.of("path",path,"content",placed.getValue(),"expectedDigest",read.afterDigest())));
            store.append(claim,TaskStatus.GENERATE,"tool.result",update);
            if(!"SUCCEEDED".equals(update.status())) throw new IllegalStateException("injection update failed: "+update.errorCode());
            injection.put("strategy",placed.getKey());injection.put("readCallId",String.valueOf(read.callId()));
            injection.put("updateCallId",String.valueOf(update.callId()));
            injection.put("beforeDigest",read.afterDigest());injection.put("afterDigest",update.afterDigest());
            injection.put("before",read.content());injection.put("after",placed.getValue());
            injection.put("rawProviderDone",rawDone);injection.put("toolSlotsUsed",2);injection.put("status","APPLIED");
        }
    }

    /**
     * MOCK dry runs only: the deterministic mock reports no usage, so conservative charging would exhaust the
     * 50,000-token budget before VERIFY. Fixed, explicitly marked counters let a dry run reach the real build,
     * browser and fault paths. They are synthetic and a MOCK batch is never model or usage evidence.
     */
    static final class SyntheticCounters implements ModelProvider {
        final ModelProvider delegate;
        SyntheticCounters(ModelProvider delegate){this.delegate=delegate;}
        public String id(){return delegate.id();}
        public String model(){return delegate.model();}
        public Reply call(Prompt prompt,int max,Duration timeout) {
            var reply=delegate.call(prompt,max,timeout);
            var raw=JsonMapper.builder().build().readTree("{\"prompt_tokens\":31,\"completion_tokens\":17,\"total_tokens\":48,\"d21Fixture\":\"SYNTHETIC_MOCK_COUNTERS\"}");
            var evidence=reply.evidence();
            return new Reply(reply.content(),new Evidence(evidence.actualModel(),evidence.requestId(),evidence.responseId(),Usage.from(raw)));
        }
    }

    /** Deterministic placement inside the target page's script setup block. */
    static Map.Entry<String,String> place(String source,String snippet,String placement) {
        Matcher open=Pattern.compile("<script\\b[^>]*\\bsetup\\b[^>]*>").matcher(source);
        if(!open.find()) return Map.entry("NEW_SCRIPT_SETUP_BLOCK","<script setup lang=\"ts\">\n"+snippet+"\n</script>\n"+source);
        int start=open.end(),close=source.indexOf("</script>",start);
        if(close<0) throw new IllegalStateException("unterminated script setup block");
        if(placement.equals("FIRST_LINE_OF_SCRIPT_SETUP"))
            return Map.entry(placement,source.substring(0,start)+"\n"+snippet+source.substring(start));
        if(!placement.equals("LAST_LINE_OF_SCRIPT_SETUP")) throw new IllegalStateException("unknown placement "+placement);
        String separator=source.substring(start,close).endsWith("\n")?"":"\n";
        return Map.entry(placement,source.substring(0,close)+separator+snippet+"\n"+source.substring(close));
    }
}
