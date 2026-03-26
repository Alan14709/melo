const fs = require('fs')
const os = require('os')
const path = require('path')

function getAutostartDesktopPath() {
  return path.join(os.homedir(), '.config', 'autostart', 'melo.desktop')
}

function buildDesktopEntry({ execPath }) {
  // TODO: Si en el futuro se agrega un modo headless dedicado, anexar su flag aqui.
  const safeExecPath = String(execPath || '').replace(/"/g, '\\"')
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Melo',
    `Exec="${safeExecPath}" --autostart`,
    'Categories=AudioVideo;Player;Music;',
    'Icon=melo',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n')
}

function enableAutostart({ execPath, startMinimized }) {
  const desktopPath = getAutostartDesktopPath()
  const autostartDir = path.dirname(desktopPath)
  fs.mkdirSync(autostartDir, { recursive: true })

  // TODO: startMinimized se usa al iniciar la app; no modifica el .desktop por ahora.
  const content = buildDesktopEntry({ execPath, startMinimized })
  fs.writeFileSync(desktopPath, content, 'utf8')

  return desktopPath
}

function disableAutostart() {
  const desktopPath = getAutostartDesktopPath()
  if (!fs.existsSync(desktopPath)) return false
  fs.unlinkSync(desktopPath)
  return true
}

function isAutostartEnabled() {
  return fs.existsSync(getAutostartDesktopPath())
}

module.exports = {
  getAutostartDesktopPath,
  enableAutostart,
  disableAutostart,
  isAutostartEnabled,
}
