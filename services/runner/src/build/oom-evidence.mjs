// Only host-read Docker daemon events can supply this evidence. Generated logs
// and exit 137 alone are never evidence of an OOM kill.
export function oomEventEvidence(raw, containerId) {
  const unavailable = { status: 'UNAVAILABLE', events: [] }
  if (!/^[a-f0-9]{64}$/.test(containerId) || typeof raw !== 'string' || Buffer.byteLength(raw) > 32768) return unavailable
  const lines = raw.split(/\r?\n/).filter(Boolean)
  if (lines.length > 8) return unavailable
  const events = []
  try {
    for (const line of lines) {
      const event = JSON.parse(line)
      if (event.Type !== 'container' || event.Action !== 'oom' || event.Actor?.ID !== containerId || !Number.isSafeInteger(event.time)) return unavailable
      // Drop daemon attributes (including host mount paths) from public reports.
      events.push({ containerId, action: 'oom', time: event.time })
    }
  } catch { return unavailable }
  return { status: events.length ? 'OBSERVED' : 'NO_OOM_EVENT', events }
}
