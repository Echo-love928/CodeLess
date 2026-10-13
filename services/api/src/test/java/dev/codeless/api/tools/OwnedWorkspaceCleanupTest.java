package dev.codeless.api.tools;

import static org.assertj.core.api.Assertions.*;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class OwnedWorkspaceCleanupTest {
    @TempDir Path parent;

    @Test void realAuditTreeDeletionBeginsOnlyAfterEnumerationIsClosed() throws Exception {
        Path root=Files.createTempDirectory(parent,"task-");
        Path audit=Files.createDirectories(root.resolve("audit/call"));
        for(String phase:new String[]{"request","observed","committed"})Files.writeString(audit.resolve(phase+".json"),"{}");
        Files.createDirectories(root.resolve("workspaces/src/pages"));
        Files.writeString(root.resolve("workspaces/src/pages/HomePage.vue"),"<template>Owned fixture</template>");
        var closed=new AtomicBoolean();
        OwnedWorkspaceCleanup.delete(root,parent,p->Files.walk(p).onClose(()->closed.set(true)),p->{
            assertThat(closed).as("No directory enumeration may still own handles at deletion").isTrue();
            Files.delete(p);
        });
        assertThat(root).doesNotExist();
    }

    @Test void foreignOwnershipRejectsBeforeWalkingOrDeleting() throws Exception {
        Path root=Files.createTempDirectory(parent,"task-");
        Path file=Files.writeString(root.resolve("keep.txt"),"keep");
        assertThatThrownBy(()->OwnedWorkspaceCleanup.delete(root,parent.resolve("foreign"),
                p->{throw new AssertionError("Must not enumerate foreign roots");},
                p->{throw new AssertionError("Must not delete foreign roots");}))
                .isInstanceOf(IOException.class).hasMessageContaining("ownership");
        assertThat(Files.readString(file)).isEqualTo("keep");
    }

    @Test void actualDeletionFailureIsPropagatedWithoutRetryOrSuccess() throws Exception {
        Path root=Files.createTempDirectory(parent,"task-");
        Files.writeString(root.resolve("keep.txt"),"keep");
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        assertThatThrownBy(()->OwnedWorkspaceCleanup.delete(root,parent,Files::walk,p->{
            calls.incrementAndGet();throw new IOException("Observed deletion failure");
        })).isInstanceOf(IOException.class).hasMessage("Observed deletion failure");
        assertThat(calls).hasValue(1);assertThat(root.resolve("keep.txt")).exists();
    }

    @Test void realDirectoryLinkIsRemovedWithoutDeletingItsForeignTarget() throws Exception {
        Path root=Files.createTempDirectory(parent,"task-");
        Path outside=Files.createDirectories(parent.resolve("foreign"));
        Path keep=Files.writeString(outside.resolve("keep.txt"),"outside owned root");
        FileToolsIntegrationTest.directoryLink(root.resolve("link"),outside);
        OwnedWorkspaceCleanup.delete(root,parent);
        assertThat(root).doesNotExist();assertThat(Files.readString(keep)).isEqualTo("outside owned root");
    }
    @Test void realDirectoryNotEmptyCapturesRemainingStateAndKeepsOriginalFailureWithoutRetry() throws Exception {
        Path root=Files.createTempDirectory(parent,"task-");
        Path audit=Files.createDirectories(root.resolve("audit/call"));
        Path before=Files.writeString(audit.resolve("before.json"),"{}");
        var injected=new AtomicBoolean();
        Throwable failure=catchThrowable(()->OwnedWorkspaceCleanup.delete(root,parent,Files::walk,p->{
            Files.delete(p);
            // Deterministic competing writer after the enumeration snapshot.
            if(p.equals(before) && injected.compareAndSet(false,true)) Files.writeString(audit.resolve("late.json"),"{}");
        }));
        assertThat(failure).isInstanceOf(java.nio.file.DirectoryNotEmptyException.class);
        assertThat(failure.getSuppressed()).hasSize(1);
        assertThat(failure.getSuppressed()[0].getMessage()).contains("ENTRIES_AT_FAILURE","remaining=1","retries=0");
        assertThat(audit.resolve("late.json")).exists();
    }
}
