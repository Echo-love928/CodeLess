import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { parse } from 'vue/compiler-sfc'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Trusted build configuration, never part of the generated source allowlist.
// The compiler AST is used only to recognize component roots, not to edit source.
const markerName = (name: string) => name.toLowerCase() === 'data-ai-component'
function componentCatalog() {
  return {
    name: 'codeless-component-catalog',
    async buildStart(this: { emitFile: (asset: { type: 'asset'; fileName: string; source: string }) => void }) {
      const files = []
      for (const directory of ['pages', 'components']) {
        const base = resolve('src', directory)
        let names: string[]
        try { names = await readdir(base) }
        catch (error) { if ((error as { code?: string }).code === 'ENOENT') continue; throw error }
        for (const name of names.sort()) {
          if (!/^[A-Za-z][A-Za-z0-9_-]*\.vue$/.test(name)) throw new Error('unapproved component source')
          const sourceFile = `src/${directory}/${name}`
          const bytes = await readFile(resolve(base, name))
          const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          const { descriptor, errors } = parse(content, { filename: sourceFile })
          let componentId: string | null = null
          let disabledReason: string | null = null
          const template = descriptor.template
          if (errors.length || !template || template.src || (template.lang && template.lang !== 'html')) {
            disabledReason = 'UNSUPPORTED_TEMPLATE'
          } else {
            const roots = template.ast?.children.filter(node => node.type !== 3 && !(node.type === 2 && !node.content.trim())) ?? []
            const root = roots[0]
            if (roots.length !== 1 || root?.type !== 1 || root.tagType !== 0 || ['template', 'slot'].includes(root.tag)) {
              disabledReason = 'UNSUPPORTED_ROOT'
            } else {
              const attributes = root.props.filter(prop => prop.type === 6 && markerName(prop.name))
              // Vue preserves source casing; native HTML attributes do not. Reject
              // aliases rather than treating their fallthrough as a missing marker.
              const unsafeBinding = root.props.some(prop =>
                (prop.type === 6 && markerName(prop.name) && prop.name !== 'data-ai-component') ||
                (prop.type === 7 &&
                  ((prop.name === 'bind' && (!prop.arg || prop.arg.type !== 4 || !prop.arg.isStatic || markerName(prop.arg.content))) ||
                    ['if', 'else', 'else-if'].includes(prop.name))))
              const nestedMarker = (nodes: typeof root.children): boolean => nodes.some(node => node.type === 1 &&
                (node.props.some(prop => (prop.type === 6 && markerName(prop.name)) ||
                  (prop.type === 7 && prop.name === 'bind' && (!prop.arg || prop.arg.type !== 4 || !prop.arg.isStatic || markerName(prop.arg.content)))) || nestedMarker(node.children)))
              if (attributes.length !== 1) disabledReason = attributes.length ? 'INVALID_COMPONENT_ID' : 'MISSING_COMPONENT_ID'
              else {
                const attribute = attributes[0]
                componentId = attribute.type === 6 ? attribute.value?.content ?? null : null
                if (!componentId || /\s/.test(componentId) || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(componentId) || componentId.length > 64) {
                  componentId = null; disabledReason = 'INVALID_COMPONENT_ID'
                }
              }
              // Retain a valid declared ID even when disabled, so forged candidates
              // receive UNSAFE_MARKER rather than being resolved to another file.
              if (unsafeBinding || nestedMarker(root.children)) disabledReason = 'UNSAFE_MARKER'
            }
          }
          files.push({ sourceFile, fileDigest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), componentId, disabledReason })
        }
      }
      files.sort((a, b) => a.sourceFile < b.sourceFile ? -1 : a.sourceFile > b.sourceFile ? 1 : 0)
      // Duplicate IDs are also rejected across trusted template defaults.
      for (const file of files) {
        if (file.componentId && files.filter(other => other.componentId === file.componentId).length > 1) file.disabledReason = 'DUPLICATE_COMPONENT_ID'
      }
      this.emitFile({ type: 'asset', fileName: 'ai-component-catalog.json', source: JSON.stringify({ protocol: 'codeless-component-catalog/v1', files }) })
    }
  }
}

export default defineConfig({ plugins: [componentCatalog(), vue()], build: { outDir: 'dist', emptyOutDir: true } })
