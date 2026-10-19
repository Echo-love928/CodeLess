import { expect, it } from 'vitest'
import cases from '../../../../../services/api/src/test/resources/network/site-cases.json'
import { dedicatedHostname, siteKey } from './site-policy'

it('matches the shared API/runner hostname boundaries', () => {
  for (const { host, site } of cases) {
    expect(dedicatedHostname(host), host).toBe(site !== null)
    if (site !== null) expect(siteKey(host), host).toBe(site)
  }
  expect(dedicatedHostname('app.' + 'a'.repeat(64) + '.cn')).toBe(false)
})
