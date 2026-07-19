import { chromium } from 'playwright'

const test = async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()

  try {
    await page.goto('https://localhost:5175', { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(800)
    await page.click('#cards .card:first-child')
    await page.waitForTimeout(1000)

    // Use toDataURL
    const dataUrl = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      return canvas?.toDataURL()?.slice(0, 50)
    })
    console.log('toDataURL:', dataUrl)

    // Check frame count
    const frames = await page.evaluate(() => {
      if (window.__testFrameCount === undefined) window.__testFrameCount = 0
      return window.__testFrameCount
    })
    console.log('frames tracked:', frames)

    await page.screenshot({ path: '/tmp/beat-fixed.png' })
    console.log('screenshot saved')
  } catch (e) {
    console.log('Error:', e.message)
  } finally {
    await browser.close()
  }
}
test()
