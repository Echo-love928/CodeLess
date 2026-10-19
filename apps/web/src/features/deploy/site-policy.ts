import policy from '../../../../../services/api/src/main/resources/network/site-policy.json'

const suffixes = new Set(policy.supportedSuffixes), blocked = new Set(policy.blockedSites)
// Computing a key does not authorize a hostname. It also handles the local
// platform's development hostname when comparing it with a validated public site.
export const siteKey = (hostname: string): string => hostname.toLowerCase().split('.').slice(-2).join('.')
export function dedicatedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return false
  const labels = host.split('.')
  return labels.length >= 3 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    suffixes.has(labels.at(-1) ?? '') && !blocked.has(siteKey(hostname))
}
