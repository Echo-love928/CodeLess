package d22.joint;
import dev.codeless.api.model.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.prompt.Prompt;
/** Exercises the exact Java guard with a zero-network fake delegate, not a mirrored implementation. */
public final class GuardSelfTest {
    public static void main(String[] args)throws Exception{
        Path out=Path.of(args[0]);Files.createDirectory(out);
        var count=new AtomicInteger();var reply=new ModelProvider.Reply("unchanged",ModelProvider.Evidence.unknown());
        ModelProvider fake=new ModelProvider(){public String id(){return "deepseek";}public String model(){return "deepseek-flash";}
            public Reply call(Prompt p,int tokens,Duration timeout){count.incrementAndGet();return reply;}};
        var prompt=new Prompt(List.of(new SystemMessage("test"),new UserMessage("x".repeat(40000))));
        Path ledger=out.resolve("budget.jsonl");int accepted=0;
        try(var guard=new JointApplication.Guard(fake,ledger,out,true)){
            while(true){try{if(guard.call(prompt,4096,Duration.ofSeconds(1))!=reply)throw new AssertionError("reply changed");accepted++;}
                catch(ModelFailure failure){if(!failure.code().equals("MODEL_BUDGET_EXCEEDED"))throw failure;break;}}
            if(accepted!=17||count.get()!=17)throw new AssertionError("budget did not stop before next delegate");
            try{new JointApplication.Guard(fake,ledger,out,true);throw new AssertionError("Concurrent ledger owner accepted");}
            catch(IllegalStateException expected){}
        }
        try(var restarted=new JointApplication.Guard(fake,ledger,out,true)){
            try{restarted.call(prompt,4096,Duration.ofSeconds(1));throw new AssertionError("restart refunded budget");}
            catch(ModelFailure expected){if(!expected.code().equals("MODEL_BUDGET_EXCEEDED"))throw expected;}
        }
        Path corrupt=out.resolve("corrupt.jsonl");Files.writeString(corrupt,"{\"attempt\":1,\"mode\":\"REAL\",\"reservedMicroRmb\":-1}\n");
        try{new JointApplication.Guard(fake,corrupt,out,true);throw new AssertionError("invalid ledger accepted");}catch(IllegalStateException expected){}
        if(count.get()!=17)throw new AssertionError("extra delegate invocation");
        System.out.println("{\"status\":\"PASSED\",\"checks\":5,\"networkCalls\":0,\"fakeDelegateCalls\":17}");
    }
}
