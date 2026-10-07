// Explain only authoritative codes. Unknown codes retain their identity and never imply success.
const reasons: Record<string, string> = {
  CANCELLED: '你已取消本次任务。可以调整需求后重新生成。',
  INTERRUPTED: '任务执行已中断或超时。请检查诊断后重新生成。',
  BUILD_FAILED: '源码未通过构建。请查看构建退出码与文件变更。',
  AGENT_BUILD_FAILED: '源码未通过构建。请查看构建退出码与文件变更。',
  AGENT_ACTION_FAILED: '页面未通过浏览器验收；构建成功或模型声称完成不能代替页面检查。',
  AGENT_RUNNER_TIMEOUT: '构建或浏览器检查超时，本次结果未被验证。',
  MODEL_TIMEOUT: '模型请求超时，本次任务已停止。',
  MODEL_NETWORK: '模型服务连接失败，本次任务已停止。',
  MODEL_CONFIGURATION: '模型服务尚未正确配置，请联系维护者检查配置。',
  MODEL_BUDGET_UNKNOWN: '模型用量无法确认；任务已停止，不将未知用量视为零。',
  AGENT_MODEL_PROTOCOL_INVALID: '模型返回内容不符合受控生成协议，本次任务已停止。',
  MODEL_BUDGET_EXCEEDED: '模型请求或 token 预算已耗尽，本次任务已停止。',
  AGENT_MODEL_BUDGET_EXCEEDED: '模型请求预算已耗尽，本次任务已停止。',
  AGENT_TOOL_BUDGET_EXCEEDED: '工具调用预算已耗尽，本次任务已停止。',
}

export function failureDescription(code?: string | null): string {
  return code && reasons[code] || '服务端未提供可解释的失败原因。请保留任务 ID 和诊断信息，联系维护者确认。'
}
