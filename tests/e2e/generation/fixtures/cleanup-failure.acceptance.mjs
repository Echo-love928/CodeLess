import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
assert.equal(process.env.CODELESS_PREVIEW_ACCEPTANCE_MODEL,'deterministic-mock','This fault fixture cannot run paid evaluation')
const launch=chromium.launch.bind(chromium)
chromium.launch=async options=>{
  const browser=await launch(options),close=browser.close.bind(browser)
  browser.close=async()=>{await close();throw new Error('B_BROWSER_CLEANUP_FAULT')}
  return browser
}
await import('../../preview/platform.acceptance.mjs')
