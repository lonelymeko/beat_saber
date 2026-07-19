const LOG = []
let _started = false

export function log(label, data) {
  const entry = { t: performance.now() | 0, label, data: typeof data === 'string' ? data : JSON.stringify(data).slice(0, 200) }
  LOG.push(entry)
  if (LOG.length > 200) LOG.shift()
  console.log('[VR]', label, data)
}

export function startLog() {
  if (_started) return
  _started = true
  LOG.length = 0
  log('session', 'started')
  window.addEventListener('error', (e) => log('error', e.message))
}

export function dumpLog() {
  console.table(LOG)
  return LOG
}

export function getLog() {
  return LOG
}
