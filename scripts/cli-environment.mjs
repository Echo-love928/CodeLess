// Optional Redocly network probes can trigger Node's Windows exit/uv_async race.
// Keep contract linting and its exit code intact; disable only telemetry/update notices.
export function redoclyEnvironment(parent = process.env) {
  return { ...parent, REDOCLY_TELEMETRY: 'off', REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true' };
}