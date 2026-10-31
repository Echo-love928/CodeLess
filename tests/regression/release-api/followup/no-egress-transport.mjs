// Explicit private test transport. The Chromium process and the worker remain real.
import https from 'node:https'
import { EventEmitter } from 'node:events'
https.request = () => {
  const request = new EventEmitter()
  request.end = () => queueMicrotask(() => { request.emit('error', Error('EXPLICIT_NO_EGRESS_TRANSPORT')); request.emit('close') })
  request.destroy = error => { queueMicrotask(() => { if (error) request.emit('error', error); request.emit('close') }); return request }
  return request
}
