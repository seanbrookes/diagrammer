export function generateId(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

// 4-char alphanumeric slug — used for human-readable default scene names
export function generateShortId() {
  return Math.random().toString(36).slice(2, 6)
}
