import policy from '../../../api/src/main/resources/network/site-policy.json' with { type: 'json' }

const suffixes = new Set(policy.supportedSuffixes), blocked = new Set(policy.blockedSites)
// Callers validate configured hosts first. Bare site keys also support the local
// platform hostname used by browser development; they never authorize an origin.
export const siteKey = hostname => hostname.toLowerCase().split('.').slice(-2).join('.')
export function dedicatedHostname(hostname) {
  if (typeof hostname !== 'string') return false
  const host = hostname.toLowerCase()
  if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return false
  const labels = host.split('.')
  return labels.length >= 3 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    suffixes.has(labels.at(-1)) && !blocked.has(siteKey(hostname))
}
