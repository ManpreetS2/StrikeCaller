const SESSION_ENTROPY_HEX_LENGTH = 16

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

let fallbackCounter = 0

function sessionIdEntropy(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID().replace(/-/g, '').slice(0, SESSION_ENTROPY_HEX_LENGTH)
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(SESSION_ENTROPY_HEX_LENGTH / 2)
    cryptoObj.getRandomValues(bytes)
    return bytesToHex(bytes)
  }
  fallbackCounter += 1
  const stamp = Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) * 1000)
  return `${fallbackCounter.toString(16).padStart(4, '0')}${stamp.toString(16).padStart(12, '0')}`.slice(
    0,
    SESSION_ENTROPY_HEX_LENGTH,
  )
}

/** Collision-resistant session identity minted once per SessionEngine start. */
export function createSessionId(startedAt: number): string {
  return `session-${startedAt}-${sessionIdEntropy()}`
}
