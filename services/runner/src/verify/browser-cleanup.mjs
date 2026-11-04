// Owned, disposable verification browser only; never a user's shared browser.
export async function closeVerificationBrowser(server, { timeoutFailure = false } = {}) {
  // A renderer/protocol timeout cannot rely on that same browser's graceful
  // channel for cleanup. kill() resolves after the owned process exits; errors
  // still propagate, and the parent watchdog/cleanup failure remains in force.
  if (timeoutFailure) await server.kill()
  else await server.close()
}
