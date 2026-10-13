package dev.codeless.api.edit;

import dev.codeless.api.auth.AuthFailure;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;

public final class EditConflict extends AuthFailure {
    private final Map<String,String> details;
    public EditConflict(UUID app, UUID base, UUID current, String prompt, EditMetadata.Source source) {
        super(HttpStatus.CONFLICT,"EDIT_VERSION_CONFLICT");
        var values=new LinkedHashMap<String,String>();
        values.put("applicationId",app.toString());values.put("baseVersionId",base.toString());
        if(current!=null) values.put("currentVersionId",current.toString());
        values.put("prompt",prompt);values.put("sourceType",source.type());
        if(source.messageId()!=null) values.put("messageId",source.messageId());
        details=Map.copyOf(values);
    }
    public Map<String,String> details() {return details;}
}
