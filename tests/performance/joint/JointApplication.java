package d22.joint;

import dev.codeless.api.CodeLessApiApplication;
import dev.codeless.api.agent.*;
import dev.codeless.api.deploy.*;
import dev.codeless.api.model.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.SpringApplication;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in acceptance composition, compiled outside the API JAR. No response rewriting or manual claim. */
@Configuration
public class JointApplication {
    public static void main(String[] args) {
        SpringApplication.run(new Class<?>[]{CodeLessApiApplication.class,JointApplication.class,Clock.class},args);
    }
    @Bean org.springframework.boot.ApplicationRunner secondUser(dev.codeless.api.auth.AuthAccountRepository accounts,
            org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder) {
        return args -> accounts.seed("second@codeless.local","Joint second user",encoder.encode("demo-password-for-test-only"),"USER");
    }
    @Bean @Primary ModelProvider jointBudget(@Qualifier("modelProvider") ModelProvider production,Environment env) {
        String mode=env.getRequiredProperty("CODELESS_JOINT_MODE");
        if(!Set.of("REAL","MOCK").contains(mode) || !(production instanceof BoundedModelProvider)) throw new IllegalStateException("Unexpected provider");
        if(mode.equals("REAL") && (!production.id().equals("deepseek") || !production.model().equals("deepseek-flash")
                || !env.getRequiredProperty("CODELESS_JOINT_APPROVAL").equals("USER_APPROVED_NEW_BATCH_RMB_2")))
            throw new IllegalStateException("Missing joint batch authorization");
        return new Guard(production,Path.of(env.getRequiredProperty("CODELESS_JOINT_BUDGET_LEDGER")),
                Path.of(env.getRequiredProperty("CODELESS_JOINT_OUTPUT")),mode.equals("REAL"));
    }
    public static final class Guard implements ModelProvider,AutoCloseable {
        private final ModelProvider production;
        private final Path ledger,events;
        private final boolean paid;
        private final JsonMapper json=JsonMapper.builder().build();
        private java.nio.channels.FileChannel ownership;
        private java.nio.channels.FileLock ownershipLock;
        private long reservedMicroRmb;
        private int attempts;
        public Guard(ModelProvider provider,Path ledger,Path output,boolean paid) {
            this.production=provider;this.ledger=ledger;this.events=output.resolve("provider-events.jsonl");this.paid=paid;
            try {
                Files.createDirectories(ledger.getParent());Files.createDirectories(output);
                ownership=java.nio.channels.FileChannel.open(ledger.resolveSibling(ledger.getFileName()+".lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE);
                ownershipLock=ownership.tryLock();if(ownershipLock==null)throw new IllegalStateException("Budget already in use");
                Runtime.getRuntime().addShutdownHook(new Thread(() -> {try{ownership.close();}catch(Exception ignored){}}));
                if(Files.exists(ledger)) for(String line:Files.readAllLines(ledger)) {
                    JsonNode value=json.readTree(line);
                    if(!value.has("reservedMicroRmb") || !value.path("reservedMicroRmb").isIntegralNumber()
                            || value.path("reservedMicroRmb").asLong()<0 || value.path("reservedMicroRmb").asLong()>2000000
                            || paid&&!value.path("mode").asText().equals("REAL") || value.path("attempt").asInt()!=attempts+1)
                        throw new IllegalStateException("Invalid budget ledger");
                    reservedMicroRmb=Math.addExact(reservedMicroRmb,value.path("reservedMicroRmb").asLong());
                    attempts++;
                }
                if(reservedMicroRmb>2000000 || attempts>64)throw new IllegalStateException("Exhausted budget ledger");
            } catch(Exception failure) {throw new IllegalStateException("Budget ledger unavailable");}
        }
        public String id(){return production.id();}
        public void close(){try{ownership.close();}catch(Exception failure){throw new IllegalStateException("Budget lock close failed");}}
        public String model(){return production.model();}
        public Map<String,Object> requestMetadata(Prompt p,int limit){return production.requestMetadata(p,limit);}
        private synchronized int reserve(Prompt p,int limit) {
            long bytes=p.getInstructions().stream().mapToLong(m -> m.getText().getBytes(StandardCharsets.UTF_8).length).sum()+512;
            if(bytes<1 || bytes>50000 || limit<256 || limit>4096)throw new ModelFailure("MODEL_BUDGET_EXCEEDED");
            // Dated official high-peak cache-miss input/output rates: 2/8 RMB per million tokens.
            // Never refund a reservation, including cancellation, local rejection, failures or timeout.
            long next=paid?Math.addExact(Math.multiplyExact(bytes,2),Math.multiplyExact((long)limit,8)):0;
            if(attempts>=64 || Math.addExact(reservedMicroRmb,next)>2000000)throw new ModelFailure("MODEL_BUDGET_EXCEEDED");
            var entry=new LinkedHashMap<String,Object>();entry.put("attempt",attempts+1);entry.put("at",Instant.now().toString());
            entry.put("reservedMicroRmb",next);entry.put("inputByteReservation",bytes);entry.put("maxOutputTokens",limit);entry.put("mode",paid?"REAL":"MOCK");
            append(ledger,entry);reservedMicroRmb+=next;return ++attempts;
        }
        private synchronized void append(Path path,Object record) {
            try (var channel=java.nio.channels.FileChannel.open(path,StandardOpenOption.CREATE,StandardOpenOption.WRITE,StandardOpenOption.APPEND)) {
                var bytes=java.nio.ByteBuffer.wrap((json.writeValueAsString(record)+"\n").getBytes(StandardCharsets.UTF_8));
                while(bytes.hasRemaining())channel.write(bytes);channel.force(true);
            }
            catch(Exception unavailable){throw new ModelFailure("MODEL_AUDIT_UNAVAILABLE");}
        }
        public Reply call(Prompt p,int limit,Duration timeout) {
            int n=reserve(p,limit);long begin=System.nanoTime();
            String text=p.getUserMessage().getText();String marker="OTHER";
            for(String value:List.of("FIRST","SECOND","CANCEL","FAIL"))if(text.contains("D22_JOINT_"+value)){marker=value;break;}
            append(events,Map.of("kind","START","attempt",n,"marker",marker,"monotonicNs",Long.toString(begin),"at",Instant.now().toString()));
            Evidence evidence=Evidence.unknown();String error="";
            try {
                if(!paid)try{Thread.sleep(1800);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new ModelFailure("MODEL_INTERRUPTED");}
                Reply reply=production.call(p,limit,timeout);evidence=reply.evidence();return reply;
            }
            catch(ModelFailure failure){error=failure.code();evidence=failure.evidence();throw failure;}
            finally {
                var end=new LinkedHashMap<String,Object>();end.put("kind","END");end.put("attempt",n);end.put("marker",marker);
                end.put("monotonicNs",Long.toString(System.nanoTime()));end.put("at",Instant.now().toString());end.put("errorCode",error);
                end.put("actualModel",evidence.actualModel());end.put("usage",evidence.usage());append(events,end);
            }
        }
    }
    @RestController public static class Clock {
        @GetMapping("/api/v0/d22-joint-clock") Map<String,String> clock(){return Map.of("monotonicNs",Long.toString(System.nanoTime()),"utc",Instant.now().toString());}
    }
    @Bean @Primary BuildGateway faultBoundary(@Qualifier("agentBuildGateway") BuildGateway real,Environment env) {
        Path out=Path.of(env.getRequiredProperty("CODELESS_JOINT_OUTPUT"));
        return new BuildGateway() {
            public JsonNode run(JsonNode draft,OffsetDateTime deadline){return real.run(draft,deadline);}
            public JsonNode run(UUID task,JsonNode draft,OffsetDateTime deadline) {
                try {
                    Path marker=out.resolve("fail-task");
                    if(Files.exists(marker) && Files.readString(marker).strip().equals(task.toString())) {
                        Files.writeString(out.resolve("host-fault.json"),"{\"kind\":\"EXPLICIT_TRUSTED_HOST_RUNNER_UNAVAILABLE\",\"taskId\":\""+task+"\"}\n",StandardOpenOption.CREATE_NEW);
                        throw new AgentFailure("AGENT_RUNNER_UNAVAILABLE");
                    }
                } catch(java.io.IOException failure){throw new AgentFailure("AGENT_CONFIGURATION");}
                return real.run(task,draft,deadline);
            }
        };
    }
    @Bean @Primary DeploymentGateway localHttpsHosting(Environment env) {
        Path repo=Path.of(env.getRequiredProperty("codeless.agent.repository-root"));
        return new NodeDeploymentGateway(Path.of(env.getRequiredProperty("codeless.agent.node")),repo.resolve("tests/e2e/full/hosting-cli.mjs"),
                Path.of(env.getRequiredProperty("CODELESS_HOSTING_ROOT")),env.getRequiredProperty("CODELESS_PUBLICATION_ORIGIN"),
                env.getRequiredProperty("CODELESS_PLATFORM_ORIGIN"),env.getRequiredProperty("CODELESS_PREVIEW_ORIGIN"));
    }
}
