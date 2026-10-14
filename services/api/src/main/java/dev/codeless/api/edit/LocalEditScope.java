package dev.codeless.api.edit;

import dev.codeless.api.agent.AgentFailure;
import dev.codeless.api.mapping.ComponentMapping;
import dev.codeless.api.versions.SnapshotStore;
import java.util.*;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** A server-resolved whole-file boundary. Source text and import hints never grant access. */
public final class LocalEditScope {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private static final Pattern IMPORT=Pattern.compile("(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\bimport\\s*)['\"]([^'\"\\r\\n]{1,240})['\"]");
    public static final String NOTICE="ALL_INSTANCES_OF_SELECTED_SOURCE_FILE";
    private LocalEditScope() {}
    public static boolean component(JsonNode context) {return context!=null && "COMPONENT".equals(context.path("source").path("type").asText());}
    public static String target(JsonNode context) {return context.path("source").path("sourceFile").asText();}
    public static void verify(EditMetadata.Link link, SnapshotStore.Source source, JsonNode mapping) {
        var selected=ComponentMapping.select(mapping,link.baseVersionId(),source.manifest().digest(),link.source().componentId());
        var entry=source.manifest().files().stream().filter(f -> f.path().equals(link.source().sourceFile())).findFirst();
        if(!link.baseVersionId().equals(link.source().versionId()) || !source.manifest().digest().equals(link.source().sourceDigest())
                || !selected.path("selectable").asBoolean() || !selected.path("sourceFile").asText().equals(link.source().sourceFile())
                || entry.isEmpty() || !entry.get().digest().equals(selected.path("fileDigest").asText()))
            throw new AgentFailure("COMPONENT_SELECTION_INVALID");
    }
    public static JsonNode context(EditMetadata.Link link,SnapshotStore.Source source,String content) {
        String path=link.source().sourceFile();
        var target=source.manifest().files().stream().filter(f -> f.path().equals(path)).findFirst().orElseThrow();
        var dependencies=new LinkedHashMap<String,Object>();var matcher=IMPORT.matcher(content);
        while(matcher.find() && dependencies.size()<40) {
            String specifier=matcher.group(1);
            String resolved=resolve(path,specifier);
            var entry=source.manifest().files().stream().filter(f -> f.path().equals(resolved)).findFirst();
            dependencies.putIfAbsent(specifier,entry.<Object>map(f -> Map.of("path",f.path(),"digest",f.digest(),"bytes",f.bytes(),"access","SUMMARY_ONLY"))
                    .orElse(Map.of("specifier",specifier,"access","NOT_AUTHORIZED")));
        }
        return JSON.valueToTree(Map.of("baseVersionId",link.baseVersionId(),"source",link.source(),
                "sourceFiles",List.of(Map.of("path",path,"digest",target.digest(),"content",content)),
                "dependencySummaries",dependencies.values(),"allowedWriteFiles",List.of(path),
                "impact",Map.of("scope","SOURCE_FILE","shared",true,"notice",NOTICE),"trust","UNTRUSTED_SOURCE_DATA"));
    }
    private static String resolve(String path,String specifier) {
        // Resolve logical import hints without touching the filesystem or interpreting platform paths.
        if(!specifier.matches("[A-Za-z0-9_@./-]+")) return "";
        String value=specifier.startsWith(".")?path.substring(0,path.lastIndexOf('/')+1)+specifier:
                specifier.startsWith("@/")?"src/"+specifier.substring(2):specifier;
        var parts=new ArrayList<String>();
        for(String part:value.split("/")) {
            if(part.equals("..")) {if(parts.isEmpty()) return "";parts.removeLast();}
            else if(!part.equals(".") && !part.isEmpty()) parts.add(part);
        }
        return String.join("/",parts);
    }
    public static String denial(String target,String tool,String path) {
        if("files.list".equals(tool)) return null;
        if(!target.equals(path)) return path!=null && (path.equals("package.json") || !path.startsWith("src/"))?
                "PROTECTED_OR_INVALID_FILE":"OUTSIDE_SELECTED_SOURCE_FILE";
        if(!Set.of("files.read","files.update").contains(tool)) return "CREATE_DELETE_NOT_AUTHORIZED";
        return null;
    }
    public static JsonNode files(JsonNode entries,String target) {
        var out=JSON.createArrayNode();entries.forEach(f -> {if(target.equals(f.path("path").asText()))out.add(f);});return out;
    }
    public static JsonNode observation(JsonNode actual,String target) {
        var out=(tools.jackson.databind.node.ObjectNode)actual.deepCopy();
        if(out.path("source").isObject()) ((tools.jackson.databind.node.ObjectNode)out.path("source")).set("files",files(out.path("source").path("files"),target));
        return out;
    }
    public static void unchanged(SnapshotStore.Manifest base,JsonNode candidate,String target) {
        var actual=new TreeMap<String,String>();candidate.forEach(f -> actual.put(f.path("path").asText(),f.path("digest").asText()));
        var expected=new TreeSet<String>();base.files().forEach(f -> expected.add(f.path()));
        if(!expected.equals(actual.keySet())) throw new AgentFailure("COMPONENT_SCOPE_REJECTED");
        for(var file:base.files()) if(!file.path().equals(target) && !file.digest().equals(actual.get(file.path())))
            throw new AgentFailure("COMPONENT_UNCHANGED_FILE_MISMATCH");
    }
}
