import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventLog, connectTaskEvents } from './task-events'
import { SseParser } from './sse'
import taskFixture from '../../../../../contracts/examples/v0/valid/task.json'
import eventFixture from '../../../../../contracts/examples/v0/valid/event.json'

const event = (sequence: number, extra = {}) => ({ ...eventFixture, taskId: taskFixture.id, sequence,
  id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, ...extra })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('SSE framing and durable reducer', () => {
  it('decodes fragmented CRLF, multi-line data and ignores heartbeat comments', () => {
    const frames: unknown[] = []
    const parser = new SseParser(frame => frames.push(frame))
    for (const chunk of [':heartbeat\r', '\nretry:1000\r\n\r\nid: 1\r', '\nevent: task-event\r\ndata: {\r\ndata: }\r\n\r', '\n']) parser.push(chunk)
    expect(frames).toEqual([{ id: '1', event: 'task-event', data: '{\n}' }])
    parser.push('data: partial')
    expect(frames).toHaveLength(1)
  })

  it('deduplicates old sequences without moving state back; retains unknown diagnostics', () => {
    const log = new EventLog(taskFixture.id)
    expect(log.apply(event(1), '1')).toBe(true)
    expect(log.apply(event(2, { type: 'FUTURE_EVENT', stage: 'FUTURE_STAGE' }), '2')).toBe(true)
    expect(log.apply(event(1), '1')).toBe(false)
    expect(log.sequence).toBe(2)
    expect(log.items).toHaveLength(2)
    expect(log.items[1].type).toBe('FUTURE_EVENT')
  })

  it('rejects missing sequences, foreign tasks, conflicting UUIDs and mismatched transport IDs', () => {
    const log = new EventLog(taskFixture.id)
    expect(() => log.apply(event(2))).toThrow('缺口')
    expect(() => log.apply(event(1, { taskId: 'foreign' }))).toThrow('格式')
    expect(() => log.apply(event(1), '01')).toThrow('游标')
    log.apply(event(1))
    expect(() => log.apply(event(2, { id: event(1).id }))).toThrow('冲突')
    expect(log.sequence).toBe(1)
  })
})

describe('resumable transport', () => {
  it('EOF reconciles terminal task and drains history without a terminal reconnect loop', async () => {
    let reads = 0
    let streams = 0
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/events') && (init?.headers as Record<string, string>)?.Accept === 'text/event-stream') {
        streams += 1
        expect((init?.headers as Record<string, string>)['Last-Event-ID']).toBe('1')
        return new Response('event: unknown\ndata: ignored\n\n', { headers: { 'content-type': 'text/event-stream' } })
      }
      if (path.includes('/events?')) return json(reads === 1 ? [event(1)] : [event(1), event(2)])
      reads += 1
      return json({ ...taskFixture, status: reads === 1 ? 'GENERATE' : 'FAILED', failureCode: reads === 1 ? null : 'CANCELLED' })
    })
    vi.stubGlobal('fetch', fetchMock)
    const onTask = vi.fn()
    const onEvents = vi.fn()
    const onConnection = vi.fn()
    const stop = connectTaskEvents({ taskId: taskFixture.id, applicationId: taskFixture.applicationId, onTask, onEvents, onConnection, onError: vi.fn() })
    await vi.waitFor(() => expect(onConnection).toHaveBeenCalledWith('complete'))
    expect(onTask.mock.lastCall?.[0].failureCode).toBe('CANCELLED')
    expect(onEvents.mock.lastCall?.[0]).toHaveLength(2)
    expect(streams).toBe(1)
    stop()
  })

  it('401 blocks recovery and reports authentication loss', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)))
    const onError = vi.fn()
    const onConnection = vi.fn()
    const stop = connectTaskEvents({ taskId: taskFixture.id, applicationId: taskFixture.applicationId, onTask: vi.fn(), onEvents: vi.fn(), onConnection, onError })
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    expect(onConnection.mock.lastCall?.[0]).toBe('blocked')
    stop()
  })

  it('drains more than 1000 events before subscribing with the last applied cursor', async () => {
    let streamCursor = ''
    const first = Array.from({ length: 1000 }, (_, i) => event(i + 1))
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes('afterEventId=0&')) return json(first)
      if (path.includes('afterEventId=1000&')) return json([event(1001)])
      if (path.endsWith('/events')) {
        streamCursor = (init?.headers as Record<string, string>)['Last-Event-ID']
        return new Response(new ReadableStream(), { headers: { 'content-type': 'text/event-stream' } })
      }
      return json({ ...taskFixture, status: 'PLAN' })
    }))
    const stop = connectTaskEvents({ taskId: taskFixture.id, applicationId: taskFixture.applicationId, onTask: vi.fn(), onEvents: vi.fn(), onConnection: vi.fn(), onError: vi.fn() })
    await vi.waitFor(() => expect(streamCursor).toBe('1001'))
    stop()
  })
})
