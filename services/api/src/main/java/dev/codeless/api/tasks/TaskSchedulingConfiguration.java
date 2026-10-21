package dev.codeless.api.tasks;

import dev.codeless.api.data.PlatformModels.TaskStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
@EnableScheduling
public class TaskSchedulingConfiguration {
    @Bean
    @ConditionalOnMissingBean(TaskStageRunner.class)
    TaskStageRunner unavailableRunner() {
        return (taskId, stage) -> new TaskStageRunner.StageResult(TaskStatus.FAILED,
                "Generation runner is unavailable", "RUNNER_UNAVAILABLE");
    }

    /**
     * One thread per scheduled job (task queue, deployment worker, storage sweep). Without a scheduler bean Spring
     * runs every @Scheduled method on one shared thread, so a generation stage of up to 12 minutes stalled the
     * deployment worker, including the recovery of a publication interrupted by a restart (D18).
     */
    @Bean
    @ConditionalOnMissingBean(org.springframework.scheduling.TaskScheduler.class)
    ThreadPoolTaskScheduler codelessScheduledJobs() {
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(3);
        scheduler.setThreadNamePrefix("codeless-scheduled-");
        return scheduler;
    }
}
