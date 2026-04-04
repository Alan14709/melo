const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const ROOT = path.join(__dirname, '..')
const REPORT_PATH = path.join(ROOT, 'test-results', 'smoke-report.json')
const NODE_BIN = process.execPath
const LAUNCHER_SCRIPT = path.join(ROOT, 'scripts', 'electron-launcher.js')

function removeOldReport() {
  try {
    fs.unlinkSync(REPORT_PATH)
  } catch (_) {}
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
}

function waitForReport(timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (fs.existsSync(REPORT_PATH)) {
        clearInterval(timer)
        try {
          const raw = fs.readFileSync(REPORT_PATH, 'utf8')
          resolve(JSON.parse(raw))
        } catch (error) {
          reject(error)
        }
        return
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer)
        reject(new Error('smoke_report_timeout'))
      }
    }, 1000)
  })
}

async function main() {
  removeOldReport()
  const testProfileSuffix = process.env.MELO_TEST_PROFILE_SUFFIX || `smoke-${Date.now().toString(36)}`

  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  if (!hasDisplay) {
    writeReport({
      verdict: 'INVALID_ENVIRONMENT',
      success: false,
      reason: 'no_graphical_display',
      timestamp: new Date().toISOString(),
    })
    process.exit(2)
  }

  const child = spawn(
    NODE_BIN,
    [LAUNCHER_SCRIPT, '.'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        MELO_RUN_SMOKE: '1',
        MELO_TEST_PROFILE_SUFFIX: testProfileSuffix,
      },
      stdio: 'inherit',
    }
  )

  try {
    const report = await waitForReport(180000)
    console.log('\n[smoke-report]')
    console.log(JSON.stringify(report, null, 2))

    if (!report.success) {
      process.exitCode = 2
    }
  } catch (error) {
    console.error('[smoke-test] failed:', error.message)
    process.exitCode = 1
  } finally {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
}

main()
