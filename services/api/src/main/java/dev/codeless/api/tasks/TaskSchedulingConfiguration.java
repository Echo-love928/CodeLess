package dev.codeless.api.tasks;

import dev.codeless.api.data.PlatformModels.TaskStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class TaskSchedulingConfiguration {
    @Bean
    @ConditionalOnMissingBean(TaskStageRunner.class)
    TaskStageRunner unavailableRunner() {
        return (taskId, stage) -> new TaskStageRunner.StageResult(TaskStatus.FAILED,
                "Generation runner is unavailable", "RUNNER_UNAVAILABLE");
    }
}
