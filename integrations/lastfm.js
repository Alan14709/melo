const crypto = require('crypto')

const API_URL = 'https://ws.audioscrobbler.com/2.0/'
let config = { apiKey: '', apiSecret: '', sessionKey: '' }

function configure(cfg) {
  config = { ...config, ...cfg }
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex')
}

function sign(params) {
  const sorted = Object.keys(params)
    .filter((k) => k !== 'format')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
  return md5(sorted + config.apiSecret)
}

async function apiCall(params) {
  const allParams = {
    ...params,
    api_key: config.apiKey,
    format: 'json'
  }
  allParams.api_sig = sign(allParams)

  const body = new URLSearchParams(allParams)
  const res = await fetch(API_URL, { method: 'POST', body })
  return res.json()
}

async function getAuthToken() {
  const res = await fetch(
    `${API_URL}?method=auth.getToken&api_key=${config.apiKey}&format=json`
  )
  const data = await res.json()
  return data.token
}

async function getAuthUrl(token) {
  return `https://www.last.fm/api/auth/?api_key=${config.apiKey}&token=${token}`
}

async function getSession(token) {
  const res = await apiCall({ method: 'auth.getSession', token })
  return res.session?.key || null
}

async function scrobble({ title, artist, album }) {
  if (!config.apiKey || !config.sessionKey) return
  if (!title || !artist) return

  return apiCall({
    method: 'track.scrobble',
    track: title,
    artist,
    album: album || '',
    timestamp: Math.floor(Date.now() / 1000),
    sk: config.sessionKey,
  })
}

async function updateNowPlaying({ title, artist, album }) {
  if (!config.apiKey || !config.sessionKey) return
  if (!title || !artist) return

  return apiCall({
    method: 'track.updateNowPlaying',
    track: title,
    artist,
    album: album || '',
    sk: config.sessionKey,
  })
}

module.exports = {
  configure,
  scrobble,
  updateNowPlaying,
  getAuthToken,
  getAuthUrl,
  getSession
}
