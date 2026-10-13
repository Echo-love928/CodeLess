package dev.codeless.api.mapping;

import dev.codeless.api.versions.*;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Host-only catalog binding. Mirrors the runner contract; never accepts a client catalog/path. */
public final class ComponentMapping {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private static final Set<String> REASONS=Set.of("UNSUPPORTED_TEMPLATE","UNSUPPORTED_ROOT","UNSAFE_MARKER",
            "MISSING_COMPONENT_ID","INVALID_COMPONENT_ID","DUPLICATE_COMPONENT_ID");
    private ComponentMapping() {}
    public static boolean id(String value) {return value!=null && value.matches("[a-z][a-z0-9]*(?:-[a-z0-9]+)*") && value.length()<=64;}
    private static boolean sha(String value) {return value!=null && value.matches("sha256:[a-f0-9]{64}");}
    private static boolean keys(JsonNode value,Set<String> keys) {return value!=null && value.isObject() && keys.equals(value.propertyNames());}
    private static void invalid() {throw new SnapshotFailure("INVALID_BUILD_CATALOG");}
    private static void path(String value) {
        LocalVolumeSnapshotStore.sourcePath(value);
        if(!value.matches("src/(?:pages|components)/[A-Za-z][A-Za-z0-9_-]*\\.vue")) invalid();
    }
    public static JsonNode bind(JsonNode catalog,SnapshotStore.Manifest source,UUID version) {
        if(!keys(catalog,Set.of("protocol","files")) || !"codeless-component-catalog/v1".equals(catalog.path("protocol").asText())
                || !catalog.path("files").isArray() || catalog.path("files").size()>43 || !sha(source.digest())) invalid();
        var paths=new HashSet<String>();var ids=new HashMap<String,Integer>();boolean unsafe=false;
        for(var file:catalog.path("files")) {
            if(!keys(file,Set.of("sourceFile","fileDigest","componentId","disabledReason")) || !file.path("sourceFile").isTextual()
                    || !file.path("fileDigest").isTextual() || !sha(file.path("fileDigest").asText())) invalid();
            path(file.path("sourceFile").asText());
            if(!paths.add(file.path("sourceFile").asText().toLowerCase(Locale.ROOT))) invalid();
            var id=file.path("componentId");var reason=file.path("disabledReason");
            if(!id.isNull() && (!id.isTextual() || !id(id.asText())) || !reason.isNull() && (!reason.isTextual() || !REASONS.contains(reason.asText()))
                    || id.isNull() && reason.isNull()) invalid();
            if(!id.isNull()) ids.merge(id.asText(),1,Integer::sum);
            unsafe|=Set.of("UNSAFE_MARKER","UNSUPPORTED_ROOT").contains(reason.asText());
        }
        var components=new ArrayList<Map<String,Object>>();var disabled=new ArrayList<Map<String,Object>>();
        for(var entry:source.files().stream().sorted(Comparator.comparing(SnapshotStore.Entry::path)).toList()) {
            if(!entry.path().endsWith(".vue")) continue;
            path(entry.path());
            var file=catalog.path("files").valueStream().filter(f -> entry.path().equals(f.path("sourceFile").asText())).findFirst()
                    .orElseThrow(() -> new SnapshotFailure("CATALOG_SOURCE_MISMATCH"));
            if(!entry.digest().equals(file.path("fileDigest").asText())) throw new SnapshotFailure("CATALOG_SOURCE_MISMATCH");
            String id=file.path("componentId").isNull()?null:file.path("componentId").asText();
            String reason=ids.getOrDefault(id,0)>1?"DUPLICATE_COMPONENT_ID":file.path("disabledReason").isNull()?null:file.path("disabledReason").asText();
            if(reason==null && unsafe) reason="UNSAFE_MARKER";
            if(reason!=null) {
                var row=new LinkedHashMap<String,Object>();row.put("sourceFile",entry.path());row.put("componentId",id);row.put("reason",reason);disabled.add(row);
            } else components.add(Map.of("componentId",id,"sourceFile",entry.path(),"fileDigest",entry.digest(),"scope","SOURCE_FILE"));
        }
        return JSON.valueToTree(Map.of("protocol","codeless-component-mapping/v1","versionId",version,"sourceDigest",source.digest(),"components",components,"disabled",disabled));
    }
    public static JsonNode select(JsonNode manifest,UUID version,String digest,String id) {
        if(!manifest.path("versionId").asText().equals(version.toString())) return denied("VERSION_MISMATCH");
        if(!manifest.path("sourceDigest").asText().equals(digest)) return denied("SOURCE_DIGEST_MISMATCH");
        if(id==null || id.isEmpty()) return denied("MISSING_COMPONENT_ID");
        if(!id(id)) return denied("INVALID_COMPONENT_ID");
        for(var file:manifest.path("disabled")) if(!file.path("componentId").isNull() && id.equals(file.path("componentId").asText())) return denied(file.path("reason").asText());
        for(var file:manifest.path("components")) if(id.equals(file.path("componentId").asText())) {
            var result=JSON.createObjectNode();result.put("selectable",true);result.put("versionId",version.toString());result.put("sourceDigest",digest);
            file.properties().forEach(e -> result.set(e.getKey(),e.getValue()));result.put("shared",true);
            result.put("notice","修改此源码组件会影响该版本中的所有实例；不支持仅修改某个 DOM 实例。");return result;
        }
        return denied("UNKNOWN_COMPONENT_ID");
    }
    private static JsonNode denied(String reason) {return JSON.valueToTree(Map.of("selectable",false,"reason",reason));}
}
