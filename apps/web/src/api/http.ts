export class ApiError extends Error {
  constructor(
    public readonly kind: 'unauthorized' | 'forbidden' | 'rate-limited' | 'network' | 'server',
    public readonly status?: number,
  ) {
    super(
      kind === 'unauthorized' ? '账号或密码不正确，请重试。' :
      kind === 'forbidden' ? '你没有权限执行此操作。' :
      kind === 'rate-limited' ? '尝试次数过多，请稍后再试。' :
      kind === 'network' ? '网络连接失败，请检查连接后重试。' :
      '服务暂时不可用，请稍后重试。',
    )
    this.name = 'ApiError'
  }
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...init.headers },
    })
  } catch {
    throw new ApiError('network')
  }
  if (!response.ok) {
    if (response.status === 429) {
      const body = await response.json().catch(() => null)
      if (body?.code === 'USER_DAILY_TASK_LIMIT') {
        const error = new ApiError('rate-limited',429)
        error.message = '今日生成与编辑任务配额已用完，请在北京时间次日 00:00 后重试。失败和取消的任务也计入用量。'
        throw error
      }
    }
    // These error bodies are unused. Release the stream before rejecting so the
    // browser can finish the request (including anonymous session bootstrap).
    try { await response.body?.cancel() } catch { /* Preserve the original HTTP error. */ }
    if (response.status === 401) throw new ApiError('unauthorized', 401)
    if (response.status === 403) throw new ApiError('forbidden', 403)
    if (response.status === 429) throw new ApiError('rate-limited', 429)
    throw new ApiError('server', response.status)
  }
  if (response.status === 204) return undefined as T
  try {
    return await response.json() as T
  } catch {
    throw new ApiError('server', response.status)
  }
}
