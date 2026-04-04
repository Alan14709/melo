const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const ROOT = path.join(__dirname, '..')
const REPORT_PATH = path.join(ROOT, 'test-results', 'stress-report.json')
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

function waitForReport(timeoutMs = 300000) {
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
        reject(new Error('stress_report_timeout'))
      }
    }, 1000)
  })
}

async function main() {
  removeOldReport()
  const testProfileSuffix = process.env.MELO_TEST_PROFILE_SUFFIX || `stress-${Date.now().toString(36)}`

  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  if (!hasDisplay) {
    writeReport({
      verdict: 'INVALID_ENVIRONMENT',
      success: false,
      reason: 'no_graphical_display',
      timestamp: new Date().toISOString(),
      switches: 0,
      successfulSwitches: 0,
      recoveries: 0,
      crashes: 0,
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
        MELO_RUN_STRESS: '1',
        MELO_TEST_PROFILE_SUFFIX: testProfileSuffix,
        MELO_STRESS_SWITCHES: process.env.MELO_STRESS_SWITCHES || '40',
        MELO_STRESS_MIN_DELAY: process.env.MELO_STRESS_MIN_DELAY || '50',
        MELO_STRESS_MAX_DELAY: process.env.MELO_STRESS_MAX_DELAY || '300',
      },
      stdio: 'inherit',
    }
  )

  try {
    const report = await waitForReport(300000)
    console.log('\n[stress-report]')
    console.log(JSON.stringify(report, null, 2))

    if (report.leakDetected) {
      process.exitCode = 2
    }
  } catch (error) {
    console.error('[stress-test] failed:', error.message)
    process.exitCode = 1
  } finally {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
}

main()
