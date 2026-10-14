// Serialized by the trusted preview gateway before generated application scripts.
// Keep this function self-contained: no generated code, paths or credentials are inputs.
export function installPreviewSelector({ platformOrigin, versionId, sourceDigest }) {
  const protocol = 'codeless-selector/v1'
  const challenge = crypto.randomUUID()
  let nonce = null, enabled = false, selected = null, hovered = null, overlay = null
  const exact = (data, keys) => data && typeof data === 'object' && !Array.isArray(data) &&
    Object.keys(data).length === keys.length && keys.every(key => Object.hasOwn(data, key))
  const uuid = value => typeof value === 'string' && value.length === 36 && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value)
  const base = ['protocol', 'type', 'versionId', 'sourceDigest', 'nonce']
  const send = (type, extra = {}) => parent.postMessage({ protocol, type, versionId, sourceDigest, nonce, ...extra }, platformOrigin)
  const ready = () => parent.postMessage({ protocol, type: 'ready', versionId, sourceDigest, challenge }, platformOrigin)
  const root = target => target instanceof Element ? target.closest('[data-ai-component]') : null
  const id = node => {
    const value = node?.getAttribute('data-ai-component')
    return typeof value === 'string' && value.length <= 64 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) ? value : null
  }
  function paint() {
    const node = hovered?.isConnected ? hovered : selected?.isConnected ? selected : null
    if (!enabled || !node) { overlay?.remove(); overlay = null; return }
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.setAttribute('data-codeless-selector-overlay', '')
      overlay.setAttribute('aria-hidden', 'true')
      document.documentElement.append(overlay)
    }
    const box = node.getBoundingClientRect()
    Object.assign(overlay.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483647',
      boxSizing: 'border-box', border: selected === node ? '3px solid #2563eb' : '2px dashed #2563eb',
      background: '#2563eb14', left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' })
  }
  function clear() { selected = null; hovered = null; paint() }
  addEventListener('message', event => {
    const data = event.data
    if (event.source !== parent || event.origin !== platformOrigin || !data ||
        data.protocol !== protocol || data.versionId !== versionId) return
    if (data.type === 'probe' && exact(data, ['protocol', 'type', 'versionId'])) { if (document.readyState === 'complete') ready(); return }
    if (data.sourceDigest !== sourceDigest) return
    if (data.type === 'init') {
      if (nonce !== null || !exact(data, [...base, 'challenge']) || data.challenge !== challenge || !uuid(data.nonce)) return
      nonce = data.nonce; send('ack'); return
    }
    if (nonce === null || data.nonce !== nonce) return
    if (data.type === 'mode' && exact(data, [...base, 'enabled']) && typeof data.enabled === 'boolean') {
      enabled = data.enabled; clear()
    } else if (data.type === 'clear' && exact(data, base)) { clear(); send('selection', { componentId: null, instance: null }) }
  })
  addEventListener('pointermove', event => { if (enabled) { hovered = root(event.target); paint() } }, true)
  addEventListener('pointerout', event => { if (enabled && !event.relatedTarget) { hovered = null; paint() } }, true)
  addEventListener('scroll', paint, true)
  addEventListener('resize', paint)
  // Block pointer-down handlers too; normal preview has no intercepted input.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick'])
    addEventListener(type, event => { if (enabled) { event.preventDefault(); event.stopImmediatePropagation() } }, true)
  addEventListener('click', event => {
    if (!enabled) return
    event.preventDefault(); event.stopImmediatePropagation()
    selected = root(event.target); hovered = null
    const componentId = id(selected)
    if (!componentId) selected = null
    paint()
    const instances = componentId ? [...document.querySelectorAll('[data-ai-component]')].filter(node => id(node) === componentId) : []
    send('selection', { componentId, instance: componentId ? { index: instances.indexOf(selected) + 1, count: instances.length } : null })
  }, true)
  addEventListener('keydown', event => {
    if (!enabled) return
    // Keyboard activation must not navigate while selecting; Tab remains usable.
    if (['Enter', ' ', 'Escape'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation() }
    if (event.key === 'Escape') { enabled = false; clear(); send('exit') }
  }, true)
  addEventListener('load', ready, { once: true })
}

export function renderPreviewSelector(options) {
  // Escape HTML delimiters even though values are trusted server bindings.
  const json = JSON.stringify(options).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
  return '(' + installPreviewSelector.toString() + ')(' + json + ');'
}
