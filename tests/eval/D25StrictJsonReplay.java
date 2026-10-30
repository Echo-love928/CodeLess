import java.nio.file.Files;
import java.nio.file.Path;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Replays a saved reply using the same strict parser options as AgentModel; no model call. */
public class D25StrictJsonReplay {
    public static void main(String[] args) throws Exception {
        var parser=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
        try { parser.readTree(Files.readString(Path.of(args[0]))); }
        catch(tools.jackson.core.JacksonException rejected) {
            if(!String.valueOf(rejected.getMessage()).contains("Duplicate")) throw new AssertionError("Expected duplicate-key rejection");
            System.out.println("DUPLICATE_KEY_REJECTED"); return;
        }
        throw new AssertionError("Original duplicate-key reply was accepted");
    }
}
