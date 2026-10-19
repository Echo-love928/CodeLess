import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { previewOrigins } from '../../services/runner/src/preview/credentials.mjs'
import { publicationSite } from '../../services/runner/src/publish/policy.mjs'
import { hostingConfig } from '../hosting/render.mjs'

export async function publicConfiguration(env) {
  const { platform, preview } = previewOrigins(env.CODELESS_PREVIEW_ORIGIN, env.CODELESS_PLATFORM_ORIGIN)
  const { site } = publicationSite(env.CODELESS_PUBLICATION_ORIGIN, env.CODELESS_PLATFORM_ORIGIN, env.CODELESS_PREVIEW_ORIGIN)
  if ([platform, preview, site].some(value => value.port)) throw new Error('standard HTTPS 443 required')
  const escape = host => host.replaceAll('.', '\\.')
  const edge = `pid /var/run/nginx.pid;
error_log /dev/stderr crit;
events { worker_connections 256; }
stream {
  resolver 127.0.0.11 valid=10s ipv6=off;
  map $ssl_preread_server_name $destination {
    default 127.0.0.1:9;
    ${platform.hostname} platform:8443;
    ${preview.hostname} platform:8443;
    "~^v[a-f0-9]{32}\\.${escape(preview.hostname)}$" platform:8443;
    ${site.hostname} hosting:8443;
    "~^d[a-f0-9]{32}\\.${escape(site.hostname)}$" hosting:8443;
  }
  server {
    listen 8443;
    ssl_preread on;
    proxy_connect_timeout 2s;
    proxy_timeout 600s;
    proxy_pass $destination;
  }
}
`
  const values = { CODELESS_PLATFORM_HOST: platform.hostname, CODELESS_PREVIEW_HOST: preview.hostname,
    CODELESS_API_PORT: '8080', CODELESS_PREVIEW_GATEWAY_PORT: '8788' }
  const template = await readFile(new URL('../preview/nginx.conf.template', import.meta.url), 'utf8')
  const platformConfig = template.replace(/\$\{(CODELESS_[A-Z_]+)\}/g, (_, name) => {
    if (!values[name]) throw new Error('Unknown template field')
    return values[name]
  })
  return { edge, platform: platformConfig, hosting: await hostingConfig({ publicOrigin: site.origin,
    platformOrigin: platform.origin, previewOrigin: preview.origin }), publicOrigin: site.origin }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.env.CODELESS_PUBLIC_CONFIG_ROOT
  const web = process.env.CODELESS_WEB_DIST
  if (![output, web].every(value => typeof value === 'string' && isAbsolute(value))) throw new Error('Absolute output directories required')
  await mkdir(output, { recursive: true })
  const result = await publicConfiguration(process.env)
  for (const name of ['edge', 'platform', 'hosting']) await writeFile(join(output, name + '.conf'), result[name], { mode: 0o644 })
  await writeFile(join(web, 'codeless-publication-config.json'), JSON.stringify({ publicOrigin: result.publicOrigin }) + '\n')
}
