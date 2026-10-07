// Public diagnostics retain cleanup outcomes, never filesystem error messages.
export function buildCleanupEvidence(value) {
  if(!value)return null
  return {containerRemoved:typeof value.containerRemoved==='boolean'?value.containerRemoved:null,
    workspaceRemoved:typeof value.workspaceRemoved==='boolean'?value.workspaceRemoved:null,
    errorCount:Array.isArray(value.errors)?value.errors.length:null,rawErrorsShared:false}
}
export function browserCleanupEvidence(value) {
  if(!value)return null
  return {browserClosed:typeof value.browserClosed==='boolean'?value.browserClosed:null,
    processTreeTerminated:typeof value.processTreeTerminated==='boolean'?value.processTreeTerminated:null}
}
