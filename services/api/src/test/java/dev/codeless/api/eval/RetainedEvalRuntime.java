package dev.codeless.api.eval;

import dev.codeless.api.auth.AuthAccountRepository;
import org.springframework.boot.SpringApplication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** Evaluation-only launcher. Login credentials bind the original owner row by its exported email. */
public final class RetainedEvalRuntime {
    public static void main(String[] args) throws Exception {
        var app=new SpringApplication(Class.forName("dev.codeless.api.CodeLessApiApplication"));
        var context=app.run(args);
        var accounts=context.getBean(AuthAccountRepository.class);
        var encoder=new BCryptPasswordEncoder();
        accounts.seed(required("CODELESS_EVAL_OWNER_EMAIL"),"D21 evaluation",encoder.encode(required("CODELESS_EVAL_OWNER_PASSWORD")),"USER");
        accounts.seed("d21-audit@eval.codeless.test","D21 evaluation audit",encoder.encode(required("CODELESS_EVAL_ADMIN_PASSWORD")),"ADMIN");
    }
    private static String required(String name) {String value=System.getenv(name);if(value==null||value.length()<12)throw new IllegalStateException(name+" is required");return value;}
}
