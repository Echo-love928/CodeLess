import { previewOrigins, uuid } from '../preview/credentials.mjs'
import { siteKey } from '../preview/site-policy.mjs'
export { publicFile, publicAddress } from './probe-policy.mjs'

export function publicationSite(publicOrigin, platformOrigin, previewOrigin) {
  const { preview: site, platform } = previewOrigins(publicOrigin, platformOrigin)
  if (previewOrigin) {
    const { preview } = previewOrigins(previewOrigin, platformOrigin)
    if (siteKey(site.hostname) === siteKey(preview.hostname))
      throw new Error('publication requires a separate site from preview')
  }
  return { site, platform }
}
export function deploymentUrl(id, site) {
  if (!uuid.test(id ?? '')) throw new Error('invalid deployment ID')
  return `https://d${id.replaceAll('-', '')}.${site.host}/`
}
