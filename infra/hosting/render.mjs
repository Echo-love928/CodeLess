import { readFile, writeFile } from 'node:fs/promises'
import { publicationSite } from '../../services/runner/src/publish/policy.mjs'

export async function hostingConfig({ publicOrigin, platformOrigin, previewOrigin }) {
  const { site } = publicationSite(publicOrigin, platformOrigin, previewOrigin)
  const template = await readFile(new URL('./nginx.conf.template', import.meta.url), 'utf8')
  // Hostnames were strictly validated; dots must also be literal regex dots.
  return template.replace('${CODELESS_PUBLICATION_HOST_REGEX}', site.hostname.replaceAll('.', '\\.'))
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/hosting/render.mjs')) {
  await writeFile(process.env.CODELESS_HOSTING_CONFIG, await hostingConfig({
    publicOrigin: process.env.CODELESS_PUBLICATION_ORIGIN, platformOrigin: process.env.CODELESS_PLATFORM_ORIGIN,
    previewOrigin: process.env.CODELESS_PREVIEW_ORIGIN,
  }), { mode: 0o600 })
}
