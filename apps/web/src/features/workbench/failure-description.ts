// Explain only authoritative codes. Unknown codes retain their identity and never imply success.
const reasons: Record<string, string> = {
  CANCELLED: '你已取消本次任务。可以调整需求后重新生成。',
  INTERRUPTED: '服务重启、执行中断或超时导致本次任务停止；具体原因请核对诊断。重新生成会创建新任务，旧记录和已有可用版本保留。',
  BUILD_FAILED: '源码未通过构建。请查看构建退出码与文件变更。',
  AGENT_BUILD_FAILED: '源码未通过构建。请查看构建退出码与文件变更。',
  AGENT_BUILD_EXIT: '源码未通过构建。请查看构建退出码与文件变更。',
  AGENT_REPAIR_NO_PROGRESS: '修复后仍出现相同错误，且源码没有变化，本次任务已停止。',
  AGENT_REPAIR_LIMIT_EXCEEDED: '已达到最多 3 轮修复，本次任务已停止。请查看诊断后调整需求。',
  AGENT_REPAIR_ACCEPTANCE_CHANGED: '修复方案改变了原有页面验收要求，本次任务已停止。请联系维护者检查诊断。',
  AGENT_ACTION_FAILED: '页面未通过浏览器验收；构建成功或模型声称完成不能代替页面检查。',
  AGENT_RUNNER_TIMEOUT: '构建或浏览器检查超时，本次结果未被验证。',
  MODEL_TIMEOUT: '模型请求超时，本次任务已停止。',
  MODEL_NETWORK: '模型服务连接失败，本次任务已停止。',
  MODEL_AUTHENTICATION: '模型服务鉴权失败，本次任务已停止。请联系维护者检查凭据。',
  MODEL_RATE_LIMITED: '模型服务请求受限，本次任务已停止。请稍后重新提交。',
  MODEL_UNAVAILABLE: '模型服务暂时不可用，本次任务已停止。请稍后重新提交。',
  MODEL_HTTP_ERROR: '模型服务返回错误，本次任务已停止。请保留诊断并联系维护者。',
  MODEL_INTERNAL_ERROR: '模型调用发生内部错误，本次任务已停止。请联系维护者检查诊断。',
  MODEL_INVALID_RESPONSE: '模型返回内容无法解析，本次任务已停止。请查看诊断。',
  MODEL_RESPONSE_LIMIT: '模型响应超过允许大小，本次任务已停止。请缩小需求后重新提交。',
  MODEL_INVALID_USAGE: '模型返回的用量无法确认，本次任务已停止；未知用量不能视为零。',
  MODEL_INTERRUPTED: '模型调用已中断，本次任务已停止。请先核对任务状态与诊断。',
  MODEL_AUDIT_UNAVAILABLE: '模型调用记录服务不可用，本次任务已停止。请联系维护者。',
  AGENT_RUNNER_INTERRUPTED: '构建或浏览器检查已中断，本次结果未被验证。请核对诊断后重新提交。',
  MODEL_CONFIGURATION: '模型服务尚未正确配置，请联系维护者检查配置。',
  MODEL_BUDGET_UNKNOWN: '模型用量无法确认；任务已停止，不将未知用量视为零。',
  AGENT_MODEL_PROTOCOL_INVALID: '模型返回内容不符合受控生成协议，本次任务已停止。',
  MODEL_BUDGET_EXCEEDED: '模型请求或 token 预算已耗尽，本次任务已停止。',
  AGENT_MODEL_BUDGET_EXCEEDED: '模型请求或 token 预算已耗尽，本次任务已停止。',
  AGENT_TOOL_BUDGET_EXCEEDED: '工具调用预算已耗尽，本次任务已停止。',
}

export const publicationFailureDescription = '发布失败。上次成功版本和地址仍然保留。请检查托管服务后重新确认发布。'
export const publicationUnknownDescription = '提交结果未知，暂停再次发布；请核对服务端发布记录。'

export function failureDescription(code?: string | null): string {
  return code && Object.hasOwn(reasons, code) ? reasons[code]! : '服务端未提供可解释的失败原因。请保留任务 ID 和诊断信息，联系维护者确认。'
}
