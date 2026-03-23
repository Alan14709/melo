let DiscordRPC = null
try {
  // Dependencia opcional: si no esta instalada, no se rompe la app.
  // eslint-disable-next-line global-require
  DiscordRPC = require('discord-rpc')
} catch (_) {
  DiscordRPC = null
}

const CLIENT_ID = '1234567890'

let rpc = null
let connected = false

async function connectDiscord(clientId) {
  if (!DiscordRPC) return false

  try {
    rpc = new DiscordRPC.Client({ transport: 'ipc' })

    rpc.on('ready', () => {
      connected = true
      console.log('Discord RPC conectado')
    })

    await rpc.login({ clientId: clientId || CLIENT_ID })
    return true
  } catch (_) {
    connected = false
    rpc = null
    return false
  }
}

async function updatePresence({ title, artist, serviceName }) {
  if (!rpc || !connected) return

  try {
    await rpc.setActivity({
      details: title ? title.slice(0, 128) : 'Melo',
      state: artist
        ? `por ${artist}`.slice(0, 128)
        : 'Reproduciendo musica',
      largeImageKey: 'melo_logo',
      largeImageText: `Melo - ${serviceName || 'Musica'}`,
      startTimestamp: new Date(),
      instance: false,
    })
  } catch (_) {
    connected = false
  }
}

async function clearPresence() {
  if (!rpc || !connected) return
  try {
    await rpc.clearActivity()
  } catch (_) {}
}

async function disconnectDiscord() {
  if (!rpc) return
  try {
    await rpc.destroy()
  } catch (_) {}
  rpc = null
  connected = false
}

module.exports = {
  connectDiscord,
  updatePresence,
  clearPresence,
  disconnectDiscord,
  isConnected: () => connected,
}
