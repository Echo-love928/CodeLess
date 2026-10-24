// Only used before login or any business operation in the isolated full-flow fixture.
export async function openInitialLogin(page, attempts = [], { now = Date.now } = {}) {
  const deadline = now() + 15_000
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await page.goto('/login', { timeout: Math.max(1, deadline - now()) })
      attempts.push({ attempt, status: 'SUCCEEDED', httpStatus: response?.status() ?? null })
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      attempts.push({ attempt, status: 'FAILED', error: message })
      // Chromium can invalidate its first GET while observing a host network change.
      // Never retry login submission, task creation, assertions or other network failures.
      if (!/\bnet::ERR_NETWORK_CHANGED\b/.test(message) || attempt === 3 || now() >= deadline) throw error
      await new Promise(resolve => setTimeout(resolve, Math.min(200, deadline - now())))
      if (now() >= deadline) throw error
    }
  }
}
