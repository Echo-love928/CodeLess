    @Test @Order(7) void bRealFrozenBridgeAfterOriginalRunnerExit() throws Exception {
        hosting.mode="NODE";
        var previous=artifacts.findPublication(successful).orElseThrow();
        UUID id=request();long started=System.nanoTime();
        publications.process(id);
        long elapsedMs=TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started);
        // This test deliberately has no public DNS/TLS. Production probe must fail
        // closed; earlier A PASS records are explicit fixtures, never public proof.
        var d=publications.deployment(owner,id);
        assertThat(d.phase()).isEqualTo("FAILED");assertThat(d.publication().url()).isNull();
        assertThat(d.latestSuccessful().id()).isEqualTo(successful);
        assertThat(artifacts.findPublication(successful).orElseThrow()).isEqualTo(previous);
        assertThat(elapsedMs).isLessThan(30000);
        var payload=hosting.payloads.get(id);
        Path site=Path.of("target/b-bridge-sites",id.toString());
        for(var asset:payload.assets()) {
            if(asset.path().equals("index.html") || asset.path().matches("assets/.+\\.(js|css|svg|png|jpg|jpeg|webp|ico|woff|woff2)"))
                assertThat(Files.readAllBytes(site.resolve(asset.path()))).isEqualTo(asset.bytes());
        }
        assertThat(Files.exists(site.resolve("ai-component-catalog.json"))).isFalse();
        assertThat(Files.exists(site.resolve("src"))).isFalse();
        var replay=post(body(ready,digest),"b-frozen-replay-0001",login,true);
        var replayAgain=post(body(ready,digest),"b-frozen-replay-0001",login,true);
        assertThat(replay.statusCode()).isEqualTo(202);assertThat(replayAgain.statusCode()).isEqualTo(202);
        assertThat(json.readTree(replay.body()).path("id")).isEqualTo(json.readTree(replayAgain.body()).path("id"));
        var panel=get("applications/"+app+"/publications",login);
        assertThat(json.readTree(panel.body()).path("latestSuccessful").path("id").asText()).isEqualTo(successful.toString());
        var expired=Instant.now().minusSeconds(1);
        assertThatThrownBy(()->hosting.bridge.publish(payload,expired)).hasMessage("DEPLOYMENT_TIMEOUT");
        report("B-frozen-bridge",Map.of("deployment",d,"elapsedMs",elapsedMs,"actualFrozenBytes",true,
            "originalNodeHandleRequired",false,"latestSuccessfulPreserved",true,"productionProbeRejectedMissingPublicDns",true,
            "publicMilestoneReached",false,"seedSuccessProvider","explicit A fixture"));
    }
