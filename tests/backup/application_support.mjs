// Reuse the existing full-product runtime preparation and exact locked tooling.
export { root, run, start, stop, windows } from '../e2e/full/support.mjs'
import { environment } from '../e2e/full/support.mjs'
import { prepare } from '../e2e/full/prepare.mjs'
export const prepareEnvironment = () => environment()
export function prepareRuntime() { return prepare() }
