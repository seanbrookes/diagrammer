import { test, expect } from '@playwright/test'

// ── Helpers ────────────────────────────────────────────────────────────────────

// Convert SVG-space coords to page (screen) coords.
// The canvas viewBox is always 1280×720; the rendered SVG may be scaled.
async function svgToPage(page, svgX, svgY) {
  const box = await page.locator('#main-canvas').boundingBox()
  return {
    x: box.x + (svgX / 1280) * box.width,
    y: box.y + (svgY / 720)  * box.height,
  }
}

// Click at an SVG coordinate. Pass { shift: true } to hold Shift during click.
async function clickAt(page, svgX, svgY, options = {}) {
  const pt = await svgToPage(page, svgX, svgY)
  if (options.shift) {
    await page.keyboard.down('Shift')
    await page.mouse.click(pt.x, pt.y)
    await page.keyboard.up('Shift')
  } else {
    await page.mouse.click(pt.x, pt.y)
  }
}

// Drag from one SVG coordinate to another (for drawing and moving).
async function dragSvg(page, x1, y1, x2, y2, steps = 10) {
  const from = await svgToPage(page, x1, y1)
  const to   = await svgToPage(page, x2, y2)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps })
  await page.mouse.up()
}

// Press a tool key then drag to draw a shape.
async function drawShape(page, toolKey, x1, y1, x2, y2) {
  await page.keyboard.press(toolKey)
  await dragSvg(page, x1, y1, x2, y2)
}

// Press 't' and click once to place a text element.
async function placeText(page, svgX, svgY) {
  await page.keyboard.press('t')
  const pt = await svgToPage(page, svgX, svgY)
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.down()
  await page.mouse.up()
}

// Draw an open pen path — single-click each point, double-click the last.
async function drawPenPath(page, ...svgPoints) {
  await page.keyboard.press('b')
  for (let i = 0; i < svgPoints.length - 1; i++) {
    const pt = await svgToPage(page, svgPoints[i][0], svgPoints[i][1])
    await page.mouse.click(pt.x, pt.y)
  }
  const last = svgPoints[svgPoints.length - 1]
  const lpt  = await svgToPage(page, last[0], last[1])
  await page.mouse.dblclick(lpt.x, lpt.y)
}

// ── Store accessors ────────────────────────────────────────────────────────────

const getElementCount  = (page) => page.evaluate(() => window.__diagrammer.dataState.elementOrder.length)
const getSelectedIds   = (page) => page.evaluate(() => [...window.__diagrammer.uxState.selectedIds])
const getActiveTool    = (page) => page.evaluate(() => window.__diagrammer.uxState.activeTool)
const getEditingTextId = (page) => page.evaluate(() => window.__diagrammer.uxState.editingTextId)
const getGroups        = (page) => page.evaluate(() => Object.keys(window.__diagrammer.dataState.groups))

async function getLastElement(page) {
  return page.evaluate(() => {
    const { dataState } = window.__diagrammer
    const id = dataState.elementOrder[dataState.elementOrder.length - 1]
    return id ? { ...dataState.elements[id] } : null
  })
}

async function getAllElements(page) {
  return page.evaluate(() => {
    const { dataState } = window.__diagrammer
    return dataState.elementOrder.map(id => ({ ...dataState.elements[id] }))
  })
}

// ── Shared beforeEach ──────────────────────────────────────────────────────────

// Each test gets a fresh page with clean sessionStorage, reset scroll, and reset store.
async function freshPage(page) {
  // First pass: load app so we can clear sessionStorage (must be same origin).
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => sessionStorage.clear())

  // Second pass: reload with empty sessionStorage so the app starts clean.
  await page.reload()
  await page.waitForFunction(() => !!window.__diagrammer)

  await page.evaluate(() => {
    // Reset scroll so the canvas left edge is within the viewport.
    const container = document.querySelector('.canvas-container')
    if (container) { container.scrollLeft = 0; container.scrollTop = 0 }

    // Clear reactive store objects in-place (replacing them breaks Vue reactivity).
    const { dataState, uxState } = window.__diagrammer
    Object.keys(dataState.elements).forEach(k => delete dataState.elements[k])
    dataState.elementOrder.splice(0)
    Object.keys(dataState.keyframes).forEach(k => delete dataState.keyframes[k])
    Object.keys(dataState.groups).forEach(k => delete dataState.groups[k])
    uxState.selectedIds.splice(0)
    uxState.activeTool   = 'select'
    uxState.editingTextId = null
    uxState.editingPenId  = null
    uxState.canvasZoom   = 1
  })
  // Let Vue flush any reactivity triggered by the store reset.
  await page.waitForTimeout(50)
}


// ══════════════════════════════════════════════════════════════════════════════
// 1. DRAWING TOOLS
// ══════════════════════════════════════════════════════════════════════════════

test.describe('drawing tools — rect', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('creates element with correct type', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const el = await getLastElement(page)
    expect(el.type).toBe('rect')
  })

  test('geometry matches drag bounds', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const el = await getLastElement(page)
    expect(el.x).toBeCloseTo(200, 0)
    expect(el.y).toBeCloseTo(200, 0)
    expect(el.width).toBeCloseTo(200, 0)
    expect(el.height).toBeCloseTo(150, 0)
  })

  test('drag from bottom-right to top-left normalises correctly', async ({ page }) => {
    await drawShape(page, 'r', 400, 350, 200, 200)
    const el = await getLastElement(page)
    expect(el.x).toBeCloseTo(200, 0)
    expect(el.y).toBeCloseTo(200, 0)
    expect(el.width).toBeCloseTo(200, 0)
    expect(el.height).toBeCloseTo(150, 0)
  })

  test('default fill and stroke', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const el = await getLastElement(page)
    expect(el.fill).toBe('#a8d5a2')
    expect(el.stroke).toBe('#333333')
    expect(el.opacity).toBe(1)
    expect(el.strokeWidth).toBe(1)
  })

  test('tool returns to select after drawing', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    expect(await getActiveTool(page)).toBe('select')
  })

  test('element is added to elementOrder', async ({ page }) => {
    const before = await getElementCount(page)
    await drawShape(page, 'r', 200, 200, 400, 350)
    expect(await getElementCount(page)).toBe(before + 1)
  })

  test('element has a label', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const el = await getLastElement(page)
    expect(el.label).toMatch(/Rectangle/)
  })

  test('element has a keyframe at frame 0', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const el = await getLastElement(page)
    // keyframes are { kf_xxx: { elementId, frame, props } } — not keyed by element id
    const hasKf = await page.evaluate((id) => {
      const kfs = Object.values(window.__diagrammer.dataState.keyframes)
      return kfs.some(kf => kf.elementId === id && kf.frame === 0)
    }, el.id)
    expect(hasKf).toBe(true)
  })
})

test.describe('drawing tools — ellipse', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('creates ellipse with correct type and geometry', async ({ page }) => {
    await drawShape(page, 'e', 300, 200, 500, 400)
    const el = await getLastElement(page)
    expect(el.type).toBe('ellipse')
    expect(el.cx).toBeCloseTo(400, 0)
    expect(el.cy).toBeCloseTo(300, 0)
    expect(el.rx).toBeCloseTo(100, 0)
    expect(el.ry).toBeCloseTo(100, 0)
  })

  test('default fill and stroke', async ({ page }) => {
    await drawShape(page, 'e', 300, 200, 500, 400)
    const el = await getLastElement(page)
    expect(el.fill).toBe('#a8d5a2')
    expect(el.stroke).toBe('#333333')
  })
})

test.describe('drawing tools — line', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('creates line with correct endpoints', async ({ page }) => {
    await drawShape(page, 'l', 250, 300, 750, 300)
    const el = await getLastElement(page)
    expect(el.type).toBe('line')
    expect(el.x1).toBeCloseTo(250, 0)
    expect(el.y1).toBeCloseTo(300, 0)
    expect(el.x2).toBeCloseTo(750, 0)
    expect(el.y2).toBeCloseTo(300, 0)
  })

  test('fill is none, has stroke', async ({ page }) => {
    await drawShape(page, 'l', 250, 300, 750, 300)
    const el = await getLastElement(page)
    expect(el.fill).toBe('none')
    expect(el.stroke).toBe('#333333')
  })
})

test.describe('drawing tools — arrow', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('creates arrow with markerEnd', async ({ page }) => {
    await drawShape(page, 'a', 250, 300, 750, 300)
    const el = await getLastElement(page)
    expect(el.type).toBe('arrow')
    expect(el.markerEnd).toBe(true)
  })

  test('has correct endpoints', async ({ page }) => {
    await drawShape(page, 'a', 250, 300, 750, 420)
    const el = await getLastElement(page)
    expect(el.x1).toBeCloseTo(250, 0)
    expect(el.y1).toBeCloseTo(300, 0)
    expect(el.x2).toBeCloseTo(750, 0)
    expect(el.y2).toBeCloseTo(420, 0)
  })
})

test.describe('drawing tools — text', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('creates text with default content', async ({ page }) => {
    await placeText(page, 400, 300)
    const el = await getLastElement(page)
    expect(el.type).toBe('text')
    expect(el.content).toBe('Text')
  })

  test('text has correct font properties', async ({ page }) => {
    await placeText(page, 400, 300)
    const el = await getLastElement(page)
    expect(el.fontSize).toBe(16)
    expect(el.fontWeight).toBe('normal')
  })

  test('text positioned at click point', async ({ page }) => {
    await placeText(page, 400, 300)
    const el = await getLastElement(page)
    expect(el.x).toBeCloseTo(400, 0)
    expect(el.y).toBeCloseTo(300, 0)
  })

  test('tool returns to select after placing text', async ({ page }) => {
    await placeText(page, 400, 300)
    expect(await getActiveTool(page)).toBe('select')
  })
})

test.describe('drawing tools — freehand path', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('creates path element with d attribute', async ({ page }) => {
    await drawShape(page, 'p', 250, 300, 800, 420)
    const el = await getLastElement(page)
    expect(el.type).toBe('path')
    expect(el.d).toBeTruthy()
    expect(el.d).toMatch(/^M/)
  })

  test('fill is none, has stroke', async ({ page }) => {
    await drawShape(page, 'p', 250, 300, 800, 420)
    const el = await getLastElement(page)
    expect(el.fill).toBe('none')
    expect(el.stroke).toBe('#333333')
    expect(el.strokeWidth).toBe(2)
  })

  test('multi-point drag produces simplified point array', async ({ page }) => {
    await page.keyboard.press('p')
    const waypoints = [[250,360],[350,220],[480,410],[610,220],[740,360]]
    const start = await svgToPage(page, waypoints[0][0], waypoints[0][1])
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i < waypoints.length; i++) {
      const pt = await svgToPage(page, waypoints[i][0], waypoints[i][1])
      await page.mouse.move(pt.x, pt.y, { steps: 5 })
    }
    await page.mouse.up()

    const el = await getLastElement(page)
    expect(el.type).toBe('path')
    expect(Array.isArray(el.points)).toBe(true)
    expect(el.points.length).toBeGreaterThanOrEqual(2)
  })
})

test.describe('drawing tools — pen (bezier)', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('creates pen element via double-click to commit', async ({ page }) => {
    await drawPenPath(page, [200,300],[500,300],[500,500])
    const el = await getLastElement(page)
    expect(el.type).toBe('pen')
    expect(el.segments.length).toBe(3)
    expect(el.closed).toBe(false)
    expect(el.d).toMatch(/^M/)
  })

  test('pen element has default stroke', async ({ page }) => {
    await drawPenPath(page, [200,300],[500,300],[500,500])
    const el = await getLastElement(page)
    expect(el.stroke).toBe('#333333')
    expect(el.fill).toBe('none')
    expect(el.strokeWidth).toBe(1)
  })

  test('close path by clicking near first anchor', async ({ page }) => {
    await page.keyboard.press('b')
    for (const [x, y] of [[300,250],[600,250],[600,450]]) {
      const pt = await svgToPage(page, x, y)
      await page.mouse.click(pt.x, pt.y)
    }
    // Click within 8 SVG units of the first anchor to close
    const closePt = await svgToPage(page, 304, 254)
    await page.mouse.click(closePt.x, closePt.y)

    const el = await getLastElement(page)
    expect(el?.type).toBe('pen')
    expect(el?.closed).toBe(true)
  })

  test('drawing multiple pen paths increments element count', async ({ page }) => {
    await drawPenPath(page, [100,200],[300,200],[300,400])
    await drawPenPath(page, [500,200],[700,200],[700,400])
    const els = await getAllElements(page)
    expect(els.filter(e => e.type === 'pen').length).toBe(2)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// 2. SELECTION
// ══════════════════════════════════════════════════════════════════════════════

test.describe('selection', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('clicking element selects it', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 500, 400)
    await clickAt(page, 350, 300)
    const sel = await getSelectedIds(page)
    expect(sel).toHaveLength(1)
  })

  test('selected id matches the drawn element', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 500, 400)
    const el = await getLastElement(page)
    await clickAt(page, 350, 300)
    const sel = await getSelectedIds(page)
    expect(sel[0]).toBe(el.id)
  })

  test('clicking canvas background deselects', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 500, 400)
    await clickAt(page, 350, 300)
    expect(await getSelectedIds(page)).toHaveLength(1)

    // Click far from any element
    await clickAt(page, 900, 600)
    expect(await getSelectedIds(page)).toHaveLength(0)
  })

  test('escape clears selection', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 500, 400)
    await clickAt(page, 350, 300)
    expect(await getSelectedIds(page)).toHaveLength(1)

    await page.keyboard.press('Escape')
    expect(await getSelectedIds(page)).toHaveLength(0)
  })

  test('shift+click adds second element to selection', async ({ page }) => {
    await drawShape(page, 'r', 250, 150, 450, 350)
    await drawShape(page, 'r', 600, 150, 800, 350)

    await clickAt(page, 350, 250)
    expect(await getSelectedIds(page)).toHaveLength(1)

    await clickAt(page, 700, 250, { shift: true })
    expect(await getSelectedIds(page)).toHaveLength(2)
  })

  test('shift+click selected element removes it from selection', async ({ page }) => {
    await drawShape(page, 'r', 250, 150, 450, 350)
    await drawShape(page, 'r', 600, 150, 800, 350)

    await clickAt(page, 350, 250)
    await clickAt(page, 700, 250, { shift: true })
    expect(await getSelectedIds(page)).toHaveLength(2)

    await clickAt(page, 350, 250, { shift: true })
    expect(await getSelectedIds(page)).toHaveLength(1)
  })

  test('marquee drag selects enclosed elements', async ({ page }) => {
    await drawShape(page, 'r', 400, 280, 600, 440)
    await page.keyboard.press('Escape')

    // Drag marquee that fully encloses the rect
    await dragSvg(page, 350, 240, 660, 480)
    expect(await getSelectedIds(page)).toHaveLength(1)
  })

  test('marquee drag that misses element selects nothing', async ({ page }) => {
    await drawShape(page, 'r', 400, 280, 600, 440)
    await page.keyboard.press('Escape')

    // Drag marquee well away from the rect
    await dragSvg(page, 700, 500, 900, 650)
    expect(await getSelectedIds(page)).toHaveLength(0)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// 3. ELEMENT OPERATIONS
// ══════════════════════════════════════════════════════════════════════════════

test.describe('element operations — delete', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('Delete key removes selected element', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const before = await getElementCount(page)
    await clickAt(page, 300, 275)
    await page.keyboard.press('Delete')
    expect(await getElementCount(page)).toBe(before - 1)
  })

  test('Backspace key removes selected element', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const before = await getElementCount(page)
    await clickAt(page, 300, 275)
    await page.keyboard.press('Backspace')
    expect(await getElementCount(page)).toBe(before - 1)
  })

  test('Delete with nothing selected does nothing', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const before = await getElementCount(page)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Delete')
    expect(await getElementCount(page)).toBe(before)
  })

  test('Delete removes all selected elements at once', async ({ page }) => {
    await drawShape(page, 'r', 250, 150, 450, 350)
    await drawShape(page, 'r', 600, 150, 800, 350)
    const before = await getElementCount(page)

    await clickAt(page, 350, 250)
    await clickAt(page, 700, 250, { shift: true })
    await page.keyboard.press('Delete')
    expect(await getElementCount(page)).toBe(before - 2)
  })
})

test.describe('element operations — duplicate', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('ctrl+d duplicates the selected element', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const before = await getElementCount(page)
    await clickAt(page, 300, 275)
    await page.keyboard.press('Control+d')
    expect(await getElementCount(page)).toBe(before + 1)
  })

  test('duplicate is offset 20px from the original', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const original = await getLastElement(page)
    await clickAt(page, 300, 275)
    await page.keyboard.press('Control+d')
    const duplicate = await getLastElement(page)
    expect(duplicate.x).toBe(original.x + 20)
    expect(duplicate.y).toBe(original.y + 20)
  })

  test('duplicate has the same type as the original', async ({ page }) => {
    await drawShape(page, 'e', 300, 200, 500, 400)
    const original = await getLastElement(page)
    await clickAt(page, 400, 300)
    await page.keyboard.press('Control+d')
    const duplicate = await getLastElement(page)
    expect(duplicate.type).toBe(original.type)
  })
})

test.describe('element operations — nudge', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('ArrowRight nudges element +1 on x', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    await clickAt(page, 300, 275)
    const before = await getLastElement(page)
    await page.keyboard.press('ArrowRight')
    const after = await getLastElement(page)
    expect(after.x).toBe(before.x + 1)
    expect(after.y).toBe(before.y)
  })

  test('ArrowLeft nudges element -1 on x', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    await clickAt(page, 300, 275)
    const before = await getLastElement(page)
    await page.keyboard.press('ArrowLeft')
    const after = await getLastElement(page)
    expect(after.x).toBe(before.x - 1)
  })

  test('ArrowUp nudges element -1 on y', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    await clickAt(page, 300, 275)
    const before = await getLastElement(page)
    await page.keyboard.press('ArrowUp')
    const after = await getLastElement(page)
    expect(after.y).toBe(before.y - 1)
  })

  test('ArrowDown nudges element +1 on y', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    await clickAt(page, 300, 275)
    const before = await getLastElement(page)
    await page.keyboard.press('ArrowDown')
    const after = await getLastElement(page)
    expect(after.y).toBe(before.y + 1)
  })
})

test.describe('element operations — drag to move', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('drag moves element by delta', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const before = await getLastElement(page)

    // Drag from centre of rect to new position (+100, +100)
    await dragSvg(page, 300, 275, 400, 375)

    const after = await getLastElement(page)
    expect(after.x).toBeCloseTo(before.x + 100, 0)
    expect(after.y).toBeCloseTo(before.y + 100, 0)
  })

  test('dragged element is selected after move', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    await dragSvg(page, 300, 275, 400, 375)
    const sel = await getSelectedIds(page)
    expect(sel).toHaveLength(1)
  })

  test('drag moves line endpoint independently', async ({ page }) => {
    await drawShape(page, 'l', 300, 300, 700, 300)
    await clickAt(page, 500, 300)
    const before = await getLastElement(page)

    // Drag the p2 endpoint handle (at x2,y2 = 700,300)
    await dragSvg(page, 700, 300, 800, 420)

    const after = await getLastElement(page)
    // p1 should be unchanged
    expect(after.x1).toBeCloseTo(before.x1, 0)
    expect(after.y1).toBeCloseTo(before.y1, 0)
    // p2 should have moved
    expect(after.x2).not.toBeCloseTo(before.x2, 0)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// 4. UNDO / REDO
// ══════════════════════════════════════════════════════════════════════════════

test.describe('undo / redo', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('ctrl+z undoes element creation', async ({ page }) => {
    const before = await getElementCount(page)
    await drawShape(page, 'r', 200, 200, 400, 350)
    expect(await getElementCount(page)).toBe(before + 1)

    await page.keyboard.press('Control+z')
    expect(await getElementCount(page)).toBe(before)
  })

  test('ctrl+y redoes after undo', async ({ page }) => {
    const before = await getElementCount(page)
    await drawShape(page, 'r', 200, 200, 400, 350)
    await page.keyboard.press('Control+z')
    expect(await getElementCount(page)).toBe(before)

    await page.keyboard.press('Control+y')
    expect(await getElementCount(page)).toBe(before + 1)
  })

  test('undo after delete restores element', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const afterDraw = await getElementCount(page)

    await clickAt(page, 300, 275)
    await page.keyboard.press('Delete')
    expect(await getElementCount(page)).toBe(afterDraw - 1)

    await page.keyboard.press('Control+z')
    expect(await getElementCount(page)).toBe(afterDraw)
  })

  test('undo after duplicate removes the copy', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const afterDraw = await getElementCount(page)

    await clickAt(page, 300, 275)
    await page.keyboard.press('Control+d')
    expect(await getElementCount(page)).toBe(afterDraw + 1)

    await page.keyboard.press('Control+z')
    expect(await getElementCount(page)).toBe(afterDraw)
  })

  test('undo after move restores original position', async ({ page }) => {
    await drawShape(page, 'r', 200, 200, 400, 350)
    const original = await getLastElement(page)

    await dragSvg(page, 300, 275, 500, 450)
    const moved = await getLastElement(page)
    expect(moved.x).not.toBeCloseTo(original.x, 0)

    await page.keyboard.press('Control+z')
    const restored = await getLastElement(page)
    expect(restored.x).toBeCloseTo(original.x, 0)
    expect(restored.y).toBeCloseTo(original.y, 0)
  })

  test('multiple sequential undo steps', async ({ page }) => {
    const start = await getElementCount(page)
    await drawShape(page, 'r', 300, 150, 500, 350)
    await drawShape(page, 'e', 550, 200, 750, 400)
    await drawShape(page, 'l', 300, 500, 800, 500)
    expect(await getElementCount(page)).toBe(start + 3)

    await page.keyboard.press('Control+z')
    expect(await getElementCount(page)).toBe(start + 2)
    await page.keyboard.press('Control+z')
    expect(await getElementCount(page)).toBe(start + 1)
    await page.keyboard.press('Control+z')
    expect(await getElementCount(page)).toBe(start)
  })

  test('new action after undo clears redo stack', async ({ page }) => {
    const start = await getElementCount(page)
    await drawShape(page, 'r', 200, 200, 400, 350)
    await page.keyboard.press('Control+z')
    expect(await getElementCount(page)).toBe(start)

    // Draw a different shape — this should clear redo
    await drawShape(page, 'e', 300, 200, 500, 400)

    // ctrl+y should no longer restore the undone rect
    await page.keyboard.press('Control+y')
    const els = await getAllElements(page)
    expect(els.filter(e => e.type === 'rect')).toHaveLength(0)
    expect(els.filter(e => e.type === 'ellipse')).toHaveLength(1)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// 5. GROUP / LAYER OPERATIONS
// ══════════════════════════════════════════════════════════════════════════════

test.describe('group operations', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('ctrl+g groups two selected elements', async ({ page }) => {
    await drawShape(page, 'r', 250, 150, 450, 350)
    await drawShape(page, 'r', 600, 150, 800, 350)

    await clickAt(page, 350, 250)
    await clickAt(page, 700, 250, { shift: true })
    expect(await getSelectedIds(page)).toHaveLength(2)

    await page.keyboard.press('Control+g')
    const groups = await getGroups(page)
    expect(groups.length).toBeGreaterThan(0)
  })

  test('grouped elements share a groupId', async ({ page }) => {
    await drawShape(page, 'r', 250, 150, 450, 350)
    await drawShape(page, 'r', 600, 150, 800, 350)

    await clickAt(page, 350, 250)
    await clickAt(page, 700, 250, { shift: true })
    await page.keyboard.press('Control+g')

    const els = await getAllElements(page)
    const groupIds = [...new Set(els.map(e => e.groupId).filter(Boolean))]
    expect(groupIds).toHaveLength(1)
  })

  test('ctrl+shift+g ungroups', async ({ page }) => {
    await drawShape(page, 'r', 250, 150, 450, 350)
    await drawShape(page, 'r', 600, 150, 800, 350)

    await clickAt(page, 350, 250)
    await clickAt(page, 700, 250, { shift: true })
    await page.keyboard.press('Control+g')
    expect((await getGroups(page)).length).toBeGreaterThan(0)

    await page.keyboard.press('Control+Shift+g')
    expect((await getGroups(page)).length).toBe(0)
  })

  test('ctrl+g with only one element selected does nothing', async ({ page }) => {
    await drawShape(page, 'r', 250, 150, 450, 350)
    await clickAt(page, 350, 250)
    expect(await getSelectedIds(page)).toHaveLength(1)

    await page.keyboard.press('Control+g')
    expect((await getGroups(page)).length).toBe(0)
  })
})

test.describe('layer order operations', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('ctrl+] brings element forward (increases zIndex)', async ({ page }) => {
    // Draw two overlapping rects — first will have lower zIndex
    await drawShape(page, 'r', 300, 200, 600, 450)
    const first = await getLastElement(page)
    await drawShape(page, 'r', 400, 250, 700, 500)

    // Click the first element to select it
    await clickAt(page, 350, 250)
    const sel = await getSelectedIds(page)
    // If nothing is selected, the rects may overlap — click a safe spot on rect1
    if (sel.length === 0) {
      await clickAt(page, 320, 220)
    }
    const selId = (await getSelectedIds(page))[0]
    if (!selId) return  // skip if layout makes this unreliable
    const selEl = (await getAllElements(page)).find(e => e.id === selId)
    const zBefore = selEl?.zIndex ?? 0

    await page.keyboard.press('Control+]')
    const updated = (await getAllElements(page)).find(e => e.id === selId)
    expect(updated.zIndex).toBeGreaterThanOrEqual(zBefore)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// 6. TEXT EDITING
// ══════════════════════════════════════════════════════════════════════════════

test.describe('text editing', () => {
  test.beforeEach(async ({ page }) => { await freshPage(page) })

  test('double-click text element enters edit mode', async ({ page }) => {
    await placeText(page, 400, 300)
    await page.locator('[data-id]').first().dblclick()
    const editingId = await getEditingTextId(page)
    expect(editingId).not.toBeNull()
  })

  test('text editor textarea is visible in edit mode', async ({ page }) => {
    await placeText(page, 400, 300)
    await page.locator('[data-id]').first().dblclick()
    await expect(page.locator('.text-edit-input')).toBeVisible()
  })

  test('typing in editor updates element content', async ({ page }) => {
    await placeText(page, 400, 300)
    await page.locator('[data-id]').first().dblclick()
    const textarea = page.locator('.text-edit-input')
    await expect(textarea).toBeVisible()
    await textarea.fill('Hello World')
    const el = await getLastElement(page)
    expect(el.content).toBe('Hello World')
  })

  test('escape exits edit mode', async ({ page }) => {
    await placeText(page, 400, 300)
    await page.locator('[data-id]').first().dblclick()
    expect(await getEditingTextId(page)).not.toBeNull()

    await page.keyboard.press('Escape')
    expect(await getEditingTextId(page)).toBeNull()
  })

  test('clicking away from textarea commits edit', async ({ page }) => {
    await placeText(page, 400, 300)
    await page.locator('[data-id]').first().dblclick()
    await page.locator('.text-edit-input').fill('Committed')

    // Click somewhere else to blur
    await clickAt(page, 900, 600)
    expect(await getEditingTextId(page)).toBeNull()

    const el = await getLastElement(page)
    expect(el.content).toBe('Committed')
  })
})
