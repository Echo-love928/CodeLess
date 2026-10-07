package dev.codeless.api.agent;

import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Independent byte checks before accepting a real worker result, repeated at the READY commit. */
public final class AgentEvidence {
    private final Path root;
    private final JsonMapper json=JsonMapper.builder().build();
    public AgentEvidence(Path root) {this.root=root.toAbsolutePath().normalize();}
    static String hash(byte[] bytes) throws Exception {return "sha256:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    private byte[] bytes(Path path,long limit) throws Exception {
        Path current=path.toAbsolutePath().normalize().getParent();
        while(current!=null) {
            if(Files.isSymbolicLink(current) || !current.equals(current.toRealPath())) throw new AgentFailure("AGENT_PATH_REJECTED");
            current=current.getParent();
        }
        AgentJournal.safeFile(path);
        if(Files.size(path)>limit) throw new AgentFailure("AGENT_EVIDENCE_LIMIT");
        try(var stream=Files.newInputStream(path)) {
            byte[] value=stream.readNBytes((int)limit+1);
            if(value.length>limit) throw new AgentFailure("AGENT_EVIDENCE_LIMIT");return value;
        }
    }
    private String manifest(Path directory,JsonNode expected,boolean source) throws Exception {
        Path base=directory.toAbsolutePath().normalize();
        if(!Files.isDirectory(base,LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(base) || !base.equals(base.toRealPath()))
            throw new AgentFailure("AGENT_PATH_REJECTED");
        List<Map<String,Object>> files=new ArrayList<>();
        long total=0;
        try(var stream=Files.walk(base)) {
            for(Path file:stream.toList()) {
                if(Files.isDirectory(file,LinkOption.NOFOLLOW_LINKS)) continue;
                String name=base.relativize(file).toString().replace('\\','/');
                if(!name.matches("[A-Za-z0-9_./-]+") || Arrays.stream(name.split("/")).anyMatch(p -> p.equals(".") || p.equals(".."))
                        || source && !name.matches("src/(?:pages|components)/[A-Za-z][A-Za-z0-9_-]*\\.vue|src/data/[A-Za-z][A-Za-z0-9_-]*\\.ts"))
                    throw new AgentFailure("AGENT_PATH_REJECTED");
                byte[] content=bytes(file,source?131072:32*1024*1024);
                total+=content.length;
                if(total>(source?524288:32*1024*1024) || files.size()>=(source?40:2000)) throw new AgentFailure("AGENT_EVIDENCE_LIMIT");
                // Preserve the exact manifest key order used by both D08-A and D07/D08-B.
                Map<String,Object> entry=new LinkedHashMap<>();entry.put("path",name);entry.put("bytes",content.length);entry.put("digest",hash(content));files.add(entry);
            }
        }
        files.sort(Comparator.comparing(f -> (String)f.get("path")));
        JsonNode actual=json.valueToTree(files);
        if(!actual.equals(expected)) throw new AgentFailure("AGENT_MANIFEST_MISMATCH");
        return hash(json.writeValueAsBytes(files));
    }
    public void validate(JsonNode draft,JsonNode result) {
        try {
            UUID execution=UUID.fromString(result.path("executionId").asText());
            JsonNode receipt=json.readTree(bytes(root.resolve("receipts").resolve(execution+".json"),2*1024*1024));
            if(!receipt.equals(result)) throw new AgentFailure("AGENT_RUNNER_RECEIPT_MISMATCH");
            String source=draft.path("sourceDigest").asText();
            if(!source.matches("sha256:[a-f0-9]{64}") || !source.equals(result.path("sourceDigest").asText())
                    || !source.equals(manifest(Path.of(draft.path("sourceDirectory").asText()),draft.path("files"),true)))
                throw new AgentFailure("AGENT_SOURCE_DIGEST_MISMATCH");
            String status=result.path("status").asText();
            if(!List.of("VERIFIED","FAILED").contains(status)) throw new AgentFailure("AGENT_RUNNER_RESULT_INVALID");
            if(status.equals("FAILED")) return;
            JsonNode build=result.path("build"),v=result.path("verification"),artifact=build.path("artifact");
            UUID buildId=UUID.fromString(build.path("id").asText()),verificationId=UUID.fromString(v.path("id").asText());
            if(!build.path("status").asText().equals("SUCCEEDED") || !build.path("exitCode").isIntegralNumber() || build.path("exitCode").asInt()!=0
                    || !build.path("failure").isNull() || !build.path("completedAt").isString() || build.path("timedOut").asBoolean(true)
                    || !build.path("imageId").asText().matches("sha256:[a-f0-9]{64}")
                    || !build.path("cleanup").path("containerRemoved").asBoolean() || !build.path("cleanup").path("workspaceRemoved").asBoolean()
                    || !build.path("cleanup").path("errors").isArray() || !build.path("cleanup").path("errors").isEmpty())
                throw new AgentFailure("AGENT_BUILD_EVIDENCE_INVALID");
            Path artifactDirectory=root.resolve("artifacts").resolve(buildId.toString());
            if(!artifactDirectory.equals(Path.of(artifact.path("directory").asText()).toAbsolutePath().normalize())
                    || !artifact.path("digest").asText().equals(manifest(artifactDirectory,artifact.path("files"),false)))
                throw new AgentFailure("AGENT_ARTIFACT_DIGEST_MISMATCH");
            if(!v.path("buildId").asText().equals(buildId.toString()) || !v.path("sourceDigest").asText().equals(source)
                    || !v.path("artifactDigest").asText().equals(artifact.path("digest").asText()) || !v.path("status").asText().equals("PASSED")
                    || !v.path("workerExitCode").isIntegralNumber() || v.path("workerExitCode").asInt()!=0 || !v.path("failure").isNull()
                    || v.path("timedOut").asBoolean(true) || !v.path("completedAt").isString() || !v.path("cleanup").path("browserClosed").asBoolean())
                throw new AgentFailure("AGENT_BROWSER_EVIDENCE_INVALID");
            Path directory=root.resolve("evidence").resolve(verificationId.toString());
            if(!directory.resolve("result.json").equals(Path.of(v.path("reportPath").asText()).toAbsolutePath().normalize())
                    || !json.readTree(bytes(directory.resolve("result.json"),2*1024*1024)).equals(v))
                throw new AgentFailure("AGENT_BROWSER_RECEIPT_MISMATCH");
            var screenshot=v.path("screenshot");
            byte[] png=bytes(directory.resolve("page.png"),6*1024*1024);
            if(!directory.resolve("page.png").equals(Path.of(screenshot.path("path").asText()).toAbsolutePath().normalize())
                    || png.length<8 || !Arrays.equals(Arrays.copyOf(png,8),new byte[]{(byte)137,80,78,71,13,10,26,10})
                    || !hash(png).equals(screenshot.path("digest").asText()) || png.length!=screenshot.path("bytes").asInt()
                    || screenshot.path("width").asInt()!=1280 || screenshot.path("height").asInt()!=720)
                throw new AgentFailure("AGENT_SCREENSHOT_DIGEST_MISMATCH");
        } catch(AgentFailure failure) {throw failure;}
        catch(Exception failure) {throw new AgentFailure("AGENT_RUNNER_EVIDENCE_INVALID");}
    }
}
