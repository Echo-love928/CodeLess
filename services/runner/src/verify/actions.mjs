const roles = new Set(['button', 'link', 'textbox', 'checkbox', 'combobox', 'heading', 'listitem', 'tab'])
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))) throw new Error('unexpected action fields')
}
function string(value, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('invalid action text')
}
function target(value) {
  object(value, ['testId', 'role', 'name', 'text'])
  if (Object.hasOwn(value, 'testId')) { object(value, ['testId']); string(value.testId, 100) }
  else if (Object.hasOwn(value, 'text')) { object(value, ['text']); string(value.text) }
  else { object(value, ['role', 'name']); if (!roles.has(value.role)) throw new Error('invalid role'); string(value.name) }
}
export function validateActions(actions = []) {
  if (!Array.isArray(actions) || actions.length > 20) throw new Error('at most twenty controlled actions required')
  const supported = ['click', 'fill', 'select', 'check', 'expectText', 'expectVisible', 'reload', 'navigate']
  for (const action of actions) {
    object(action, ['type', 'target', 'value', 'path'])
    if (!supported.includes(action.type)) throw new Error('unsupported action')
    if (action.type === 'reload') object(action, ['type'])
    else if (action.type === 'navigate') {
      object(action, ['type', 'path'])
      string(action.path, 256)
      if (!/^\/(?:[A-Za-z0-9_/-]*)(?:#[A-Za-z0-9_/-]*)?$/.test(action.path) ||
          action.path.startsWith('//') || action.path.split('/').includes('..')) throw new Error('unsafe navigation')
    } else {
      object(action, ['type', 'target', ...(['fill', 'select', 'expectText'].includes(action.type) ? ['value'] : [])])
      target(action.target)
      if (['fill', 'select', 'expectText'].includes(action.type)) {
        if (action.type === 'fill' && action.value === '') continue
        string(action.value, 2000)
      }
    }
  }
  // Copy validated values so caller mutation cannot change what the worker executes.
  return JSON.parse(JSON.stringify(actions))
}
export function locate(page, target) {
  if (target.testId) return page.getByTestId(target.testId)
  if (target.text) return page.getByText(target.text, { exact: true })
  return page.getByRole(target.role, { name: target.name, exact: true })
}
export const LIMITS = Object.freeze({ runTimeoutMs: 30000, launchTimeoutMs: 8000, navigationTimeoutMs: 8000,
  actionTimeoutMs: 2000, screenshotTimeoutMs: 4000, observationMs: 250, diagnostics: 100 })
export function limits(overrides = {}) {
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(LIMITS, key) || !Number.isSafeInteger(value) || value < 1 || value > LIMITS[key]) {
      throw new Error('unknown or relaxed browser limit: ' + key)
    }
  }
  return { ...LIMITS, ...overrides }
}
