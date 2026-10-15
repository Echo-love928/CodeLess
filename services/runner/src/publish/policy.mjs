import { previewOrigins, uuid } from '../preview/credentials.mjs'
export { publicFile, publicAddress } from './probe-policy.mjs'

export function publicationSite(publicOrigin, platformOrigin, previewOrigin) {
  const { preview: site, platform } = previewOrigins(publicOrigin, platformOrigin)
  if (previewOrigin) {
    const preview = new URL(previewOrigin)
    if (site.hostname.split('.').slice(-2).join('.') === preview.hostname.split('.').slice(-2).join('.'))
      throw new Error('publication requires a separate site from preview')
  }
  return { site, platform }
}
export function deploymentUrl(id, site) {
  if (!uuid.test(id ?? '')) throw new Error('invalid deployment ID')
  return `https://d${id.replaceAll('-', '')}.${site.host}/`
}
