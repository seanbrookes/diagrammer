import { test, expect } from '@playwright/test'

// ── Helpers ────────────────────────────────────────────────────────────────────

// Convert SVG-space coordinates to page (screen) coordinates.
// The canvas viewBox is always 1280×720; the rendered SVG element may be
// smaller/larger depending on zoom and container size.
async function svgToPage(page, svgX, svgY) {
  const box = await page.locator('#main-canvas').boundingBox()
  return {
    x: box.x + (svgX / 1280) * box.width,
    y: box.y + (svgY / 720)  * box.height,
  }
}

// Draw an open pen path by single-clicking each point and double-clicking the
// last one to commit.  Points are given as [svgX, svgY] pairs.
// A 3-element call → 3-anchor path (A, B, dblclick-C).
async function drawPenPath(page, ...svgPoints) {
  await page.keyboard.press('b')                  // activate pen tool

  for (let i = 0; i < svgPoints.length - 1; i++) {
    const pt = await svgToPage(page, svgPoints[i][0], svgPoints[i][1])
    await page.mouse.click(pt.x, pt.y)
  }

  // Final double-click: the first mousedown of the dblclick adds the last
  // anchor; the dblclick event pops the duplicate and commits the path.
  const last = svgPoints[svgPoints.length - 1]
  const lpt  = await svgToPage(page, last[0], last[1])
  await page.mouse.dblclick(lpt.x, lpt.y)
  // After commit the tool auto-returns to 'select'
}

// Select the pen element and double-click to enter pen-point edit mode.
// `clickSvgPt` should be on the path (not on a handle).
async function enterPenEditMode(page, clickSvgX, clickSvgY) {
  const pt = await svgToPage(page, clickSvgX, clickSvgY)
  await page.mouse.click(pt.x, pt.y)          // select
  await page.mouse.dblclick(pt.x, pt.y)        // enter edit mode
}

// Read segment count from the exposed dev store.
async function segmentCount(page) {
  return page.evaluate(() => {
    const uxState = window.__diagrammer?.uxState
    const dataState = window.__diagrammer?.dataState
    if (!uxState || !dataState) return -1
    const el = dataState.elements[uxState.editingPenId]
    return el?.segments?.length ?? -1
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('pen tool editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__diagrammer)
  })

  // ── 1. Double-click shows anchor handles ─────────────────────────────────────

  test('double-click pen element shows per-anchor handles', async ({ page }) => {
    // Draw a 3-anchor path: clicks at A(300,300) B(600,300) then dblclick at C(600,500)
    await drawPenPath(page, [300, 300], [600, 300], [600, 500])
    await enterPenEditMode(page, 450, 300)   // click on the AB segment midpoint

    const anchors = page.locator('[data-pen-handle^="anchor-"]')
    await expect(anchors).toHaveCount(3)
  })

  // ── 2. Alt+click anchor removes that point ───────────────────────────────────

  test('alt+click anchor removes the anchor', async ({ page }) => {
    await drawPenPath(page, [300, 300], [600, 300], [600, 500])
    await enterPenEditMode(page, 450, 300)
    await expect(page.locator('[data-pen-handle^="anchor-"]')).toHaveCount(3)

    // Alt+click the middle anchor (anchor-1 at 600,300)
    await page.locator('[data-pen-handle="anchor-1"]').click({ modifiers: ['Alt'] })

    await expect(page.locator('[data-pen-handle^="anchor-"]')).toHaveCount(2)
    // Confirm the store also reflects fewer segments
    const count = await segmentCount(page)
    expect(count).toBe(2)
  })

  // ── 3. Alt+click path body inserts a new anchor ──────────────────────────────

  test('alt+click on path segment inserts a new anchor', async ({ page }) => {
    await drawPenPath(page, [200, 360], [640, 360], [640, 500])
    await enterPenEditMode(page, 420, 360)   // midpoint of first segment

    const before = await segmentCount(page)
    expect(before).toBe(3)

    // Alt+click roughly at the midpoint of the first segment (200,360)→(640,360)
    // That's around SVG (420, 360).  We target the <path> element, not a handle.
    const pathEl = page.locator('path[data-id]')
    const box    = await page.locator('#main-canvas').boundingBox()
    const clickX = box.x + (420 / 1280) * box.width
    const clickY = box.y + (360 / 720)  * box.height
    await page.keyboard.down('Alt')
    await page.mouse.click(clickX, clickY)
    await page.keyboard.up('Alt')

    await expect(page.locator('[data-pen-handle^="anchor-"]')).toHaveCount(before + 1)
    const after = await segmentCount(page)
    expect(after).toBe(before + 1)
  })

  // ── 4. Alt+drag control handle breaks the smooth mirror ──────────────────────

  test('alt+drag control handle moves it independently without mirroring', async ({ page }) => {
    // Draw a 3-anchor straight-line path
    await drawPenPath(page, [200, 360], [640, 360], [900, 360])
    await enterPenEditMode(page, 420, 360)

    // Ctrl+click the middle anchor to add control arms (smooth by default)
    await page.locator('[data-pen-handle="anchor-1"]').click({ modifiers: ['Control'] })

    const cpOut = page.locator('[data-pen-handle="cp-out-1"]')
    const cpIn  = page.locator('[data-pen-handle="cp-in-1"]')
    await expect(cpOut).toBeVisible()
    await expect(cpIn).toBeVisible()

    // Record the initial position of cp-in-1
    const inBoxBefore = await cpIn.boundingBox()
    const inCxBefore  = inBoxBefore.x + inBoxBefore.width  / 2
    const inCyBefore  = inBoxBefore.y + inBoxBefore.height / 2

    // Alt+drag cp-out-1 significantly upward
    const outBox = await cpOut.boundingBox()
    const outCx  = outBox.x + outBox.width  / 2
    const outCy  = outBox.y + outBox.height / 2

    await page.keyboard.down('Alt')
    await page.mouse.move(outCx, outCy)
    await page.mouse.down()
    await page.mouse.move(outCx, outCy - 80, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Alt')

    // If mirroring were active, cp-in-1 would have moved down by ~80px.
    // With alt+drag (broken smooth), cp-in-1 should stay near its original position.
    const inBoxAfter = await cpIn.boundingBox()
    const inCyAfter  = inBoxAfter.y + inBoxAfter.height / 2

    // cp-in moved less than 20px (not mirrored ~80px)
    expect(Math.abs(inCyAfter - inCyBefore)).toBeLessThan(20)
  })
})
