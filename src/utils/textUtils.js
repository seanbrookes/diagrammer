const BULLET = ['•', '◦', '▪', '–']
const CHAR_WIDTH_EM = 0.58

// Parse a text element's content into renderable lines with indent and display text.
// Lines matching /^(\s*)-\s/ are treated as bullets; indent level is 2-space groups.
export function parseTextLines(el) {
  const fs = el.fontSize ?? 16
  return (el.content ?? '').split('\n').map(raw => {
    const m = raw.match(/^(\s*)-\s(.*)$/)
    if (m) {
      const level = Math.floor(m[1].length / 2) + 1
      const bullet = BULLET[(level - 1) % BULLET.length]
      const indent = fs * 1.2 * level
      return { indent, text: bullet + ' ' + m[2] }
    }
    return { indent: 0, text: raw }
  })
}

// Approximate bounding box for a text element based on parsed line widths.
export function getTextBBox(el) {
  const fs = el.fontSize ?? 16
  const lh = fs * 1.4
  const lines = parseTextLines(el)
  const maxW = Math.max(40, ...lines.map(l => l.indent + l.text.length * fs * CHAR_WIDTH_EM))
  return {
    x: el.x,
    y: el.y - fs,
    width: maxW + fs * 0.5,
    height: lines.length * lh + fs * 0.3,
  }
}
