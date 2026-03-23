import { create } from 'zustand'

export const usePlayerStore = create((set) => ({
  // Estado del player
  currentTrack: null,
  isPlaying: false,

  // Servicios
  activeServiceId: null,
  activeServiceColor: '#fc3c44',
  activeServiceName: null,
  connectedServices: [],

  // UI
  currentView: 'picker',
  pendingService: null,
  settingsOpen: false,
  commandPaletteOpen: false,
  miniPlayerOpen: false,
  theme: 'dark',
  accentColor: '#fc3c44',

  // Integraciones (v0.3)
  discordEnabled: false,
  discordClientId: '',
  lastfmEnabled: false,
  lastfmApiKey: '',
  lastfmApiSecret: '',
  lastfmSessionKey: '',
  notificationsEnabled: true,

  // Stats (v0.5)
  statsEnabled: true,
  autoUpdateEnabled: false,
  playHistory: [],

  // Acciones
  setTrack: (track) => set({ currentTrack: track }),
  setPlaying: (v) => set({ isPlaying: v }),

  setActiveService: (id, color, name) => set({
    activeServiceId: id,
    activeServiceColor: color,
    activeServiceName: name,
    accentColor: color,
  }),

  addConnectedService: (id) => set((s) => ({
    connectedServices: s.connectedServices.includes(id)
      ? s.connectedServices
      : [...s.connectedServices, id]
  })),
  setConnectedServices: (connectedServices) => set({ connectedServices }),

  setView: (view) => set({ currentView: view }),
  setPendingService: (service) => set({ pendingService: service }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setTheme: (theme) => set({ theme }),
  setAccentColor: (accentColor) => set({ accentColor }),

  setDiscord: (v) => set({ discordEnabled: v }),
  setDiscordClientId: (v) => set({ discordClientId: v }),
  setLastfm: (v) => set({ lastfmEnabled: v }),
  setLastfmApiKey: (k) => set({ lastfmApiKey: k }),
  setLastfmApiSecret: (k) => set({ lastfmApiSecret: k }),
  setLastfmSessionKey: (k) => set({ lastfmSessionKey: k }),
  setNotifications: (v) => set({ notificationsEnabled: v }),
  setStats: (v) => set({ statsEnabled: v }),
  setAutoUpdate: (v) => set({ autoUpdateEnabled: v }),

  hydrateSettings: (settings) => set((s) => ({
    ...s,
    theme: settings.theme ?? s.theme,
    accentColor: settings.accentColor ?? s.accentColor,
    notificationsEnabled: settings.notificationsEnabled ?? s.notificationsEnabled,
    discordEnabled: settings.discordEnabled ?? s.discordEnabled,
    discordClientId: settings.discordClientId ?? s.discordClientId,
    lastfmEnabled: settings.lastfmEnabled ?? s.lastfmEnabled,
    lastfmApiKey: settings.lastfm?.apiKey ?? s.lastfmApiKey,
    lastfmApiSecret: settings.lastfm?.apiSecret ?? s.lastfmApiSecret,
    lastfmSessionKey: settings.lastfm?.sessionKey ?? s.lastfmSessionKey,
    autoUpdateEnabled: settings.autoUpdateEnabled ?? s.autoUpdateEnabled,
  })),

  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setMiniPlayerOpen: (v) => set({ miniPlayerOpen: v }),

  addToHistory: (track) => set((s) => ({
    playHistory: [
      { ...track, playedAt: Date.now() },
      ...s.playHistory.slice(0, 999)
    ]
  })),
}))
