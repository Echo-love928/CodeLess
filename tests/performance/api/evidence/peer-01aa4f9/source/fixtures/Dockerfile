FROM codeless-vue-build:d05
COPY tests/runner/build/fixtures/fault-entry.mjs /opt/codeless/fault-entry.mjs
COPY tests/performance/runner/fixtures/pressure-entry.mjs /opt/codeless/pressure-entry.mjs
ENTRYPOINT ["node", "/opt/codeless/pressure-entry.mjs"]
