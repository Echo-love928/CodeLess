package dev.codeless.api.agent;

import java.io.IOException;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Test-private preparation: remember owned descendants while waiting; always reclaim with a bounded wait. */
final class PreparationProcess implements AutoCloseable {
    private final Process process;
    private final Map<Long,ProcessHandle> descendants=new LinkedHashMap<>();
    PreparationProcess(ProcessBuilder builder) throws IOException {process=builder.start();}
    Process process(){return process;}
    private void remember() {
        process.descendants().forEach(handle->descendants.putIfAbsent(handle.pid(),handle));
    }
    boolean await(Duration timeout) throws InterruptedException {
        long end=System.nanoTime()+timeout.toNanos();
        try {
            while(true){
                remember();long remaining=end-System.nanoTime();
                if(remaining<=0)return !process.isAlive();
                if(process.waitFor(Math.min(remaining,TimeUnit.MILLISECONDS.toNanos(50)),TimeUnit.NANOSECONDS)){remember();return true;}
            }
        }catch(InterruptedException failure){Thread.currentThread().interrupt();throw failure;}
    }
    public void close() throws IOException {
        boolean interrupted=Thread.interrupted();long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        try {
            remember();
            // Retain handles before destroying parents; do not rediscover by PID after reparenting.
            for(var handle:new ArrayList<>(descendants.values()))if(handle.isAlive())
                handle.descendants().forEach(child->descendants.putIfAbsent(child.pid(),child));
            var owned=new ArrayList<>(descendants.values());Collections.reverse(owned);
            for(var handle:owned)if(handle.isAlive())handle.destroyForcibly();
            long reapUntil=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(250);
            while(owned.stream().anyMatch(ProcessHandle::isAlive)&&System.nanoTime()<reapUntil){
                try{Thread.sleep(10);}catch(InterruptedException failure){interrupted=true;}
            }
            if(process.isAlive())process.destroyForcibly();
            while((process.isAlive()||owned.stream().anyMatch(ProcessHandle::isAlive))&&System.nanoTime()<end){
                try{Thread.sleep(10);}catch(InterruptedException failure){interrupted=true;}
            }
            if(process.isAlive()||owned.stream().anyMatch(ProcessHandle::isAlive))throw new IOException("Preparation process tree cleanup not confirmed");
            // Observe actual root termination without an unbounded join.
            try{if(!process.waitFor(Math.max(0,end-System.nanoTime()),TimeUnit.NANOSECONDS))throw new IOException("Preparation root wait timed out");}
            catch(InterruptedException failure){interrupted=true;if(process.isAlive())throw new IOException("Preparation root wait interrupted");}
        }finally{if(interrupted)Thread.currentThread().interrupt();}
    }
}
