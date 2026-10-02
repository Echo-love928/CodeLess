export interface SseFrame { id?: string; event: string; data: string }

// Streaming UTF-8 decoding happens before parsing. Comments/heartbeats never dispatch.
export class SseParser {
  private buffer = ''
  private event = 'message'
  private id: string | undefined
  private data: string[] = []
  private size = 0

  constructor(private readonly emit: (frame: SseFrame) => void) {}

  push(chunk: string) {
    this.buffer += chunk
    if (this.buffer.length + this.size > 1_048_576) throw new Error('事件帧超过大小限制。')
    while (true) {
      const index = this.buffer.search(/[\r\n]/)
      if (index < 0 || (this.buffer[index] === '\r' && index === this.buffer.length - 1)) return
      const line = this.buffer.slice(0, index)
      const width = this.buffer[index] === '\r' && this.buffer[index + 1] === '\n' ? 2 : 1
      this.buffer = this.buffer.slice(index + width)
      if (!line) {
        if (this.data.length) this.emit({ id: this.id, event: this.event, data: this.data.join('\n') })
        this.event = 'message'
        this.id = undefined
        this.data = []
        this.size = 0
        continue
      }
      this.size += line.length
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'data') this.data.push(value)
      if (field === 'event') this.event = value
      if (field === 'id' && !value.includes('\0')) this.id = value
    }
  }
}
