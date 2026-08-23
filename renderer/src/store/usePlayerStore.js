import { create } from 'zustand'

export const usePlayerStore = create((set) => ({
  // Estado del player
  currentTrack: null,
  isPlaying: false,
  volumeLevel: 1,

  // Servicios
  activeServiceId: null,
  activeServiceColor: '#fc3c44',
  activeServiceName: null,
  connectedServices: [],

  // UI
  currentView: 'picker',
  pendingService: null,
  settingsOpen: false,
  settingsTab: 'servicios',
  commandPaletteOpen: false,
  miniPlayerOpen: false,
  theme: 'dark',
  accentColor: '#fc3c44',
  dynamicThemeEnabled: false,
  customTheme: null,

  // Integraciones (v0.3)
  discordEnabled: false,
  discordClientId: '',
  lastfmEnabled: false,
  lastfmApiKey: '',
  lastfmApiSecret: '',
  lastfmSessionKey: '',
  mediaKeysEnabled: true,
  notificationsEnabled: true,

  // UI/Immersive (Fase 5)
  immersiveEnabled: false,
  overlayControlsEnabled: true,
  overlayPosition: 'bottom',

  // Stats (v0.5)
  statsEnabled: true,
  autoUpdateEnabled: false,

  // Focus Mode
  focusMode: false,

  // UI State System (Fase 1 - UX Feedback)
  // Estructura: { [feature]: 'idle' | 'loading' | 'success' | 'error' }
  uiState: {
    settings: 'idle',      // carga/guardado de settings
    playback: 'idle',      // operaciones de playback
    connection: 'idle',    // conexión a servicios
    sync: 'idle',          // sincronización
  },

  // Acciones
  setTrack: (track) => set({ currentTrack: track }),
  setPlaying: (v) => set({ isPlaying: v }),
  // El progreso lo lleva PlayerBar con estado local desde `player:getProgress`:
  // en el store obligaba a re-renderizar el arbol entero cada segundo.
  setVolumeLevel: (v) => set({ volumeLevel: v }),

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
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  // Abre el panel directamente en una pestaña, para las acciones del palette.
  openSettingsAt: (settingsTab) => set({ settingsOpen: true, settingsTab }),
  setTheme: (theme) => set({ theme }),
  setAccentColor: (accentColor) => set({ accentColor }),
  setDynamicTheme: (v) => set({ dynamicThemeEnabled: v }),
  setCustomTheme: (customTheme) => set({ customTheme }),

  setDiscord: (v) => set({ discordEnabled: v }),
  setDiscordClientId: (v) => set({ discordClientId: v }),
  setLastfm: (v) => set({ lastfmEnabled: v }),
  setLastfmApiKey: (k) => set({ lastfmApiKey: k }),
  setLastfmApiSecret: (k) => set({ lastfmApiSecret: k }),
  setLastfmSessionKey: (k) => set({ lastfmSessionKey: k }),
  setMediaKeys: (v) => set({ mediaKeysEnabled: v }),
  setNotifications: (v) => set({ notificationsEnabled: v }),
  setImmersive: (v) => set({ immersiveEnabled: v }),
  setOverlayControls: (v) => set({ overlayControlsEnabled: v }),
  setOverlayPosition: (pos) => set({ overlayPosition: pos }),
  setStats: (v) => set({ statsEnabled: v }),
  setAutoUpdate: (v) => set({ autoUpdateEnabled: v }),
  setFocusMode: (v) => set({ focusMode: v }),

  hydrateSettings: (settings) => set((s) => ({
    ...s,
    theme: settings.theme ?? s.theme,
    accentColor: settings.accentColor ?? s.accentColor,
    dynamicThemeEnabled: settings.dynamicTheme ?? s.dynamicThemeEnabled,
    customTheme: settings.customTheme ?? s.customTheme,
    notificationsEnabled: settings.notificationsEnabled ?? s.notificationsEnabled,
    discordEnabled: settings.discordEnabled ?? s.discordEnabled,
    discordClientId: settings.discordClientId ?? s.discordClientId,
    lastfmEnabled: settings.lastfmEnabled ?? s.lastfmEnabled,
    lastfmApiKey: settings.lastfm?.apiKey ?? s.lastfmApiKey,
    lastfmApiSecret: settings.lastfm?.apiSecret ?? s.lastfmApiSecret,
    lastfmSessionKey: settings.lastfm?.sessionKey ?? s.lastfmSessionKey,
    mediaKeysEnabled: settings.mediaKeysEnabled ?? s.mediaKeysEnabled,
    immersiveEnabled: settings.immersiveEnabled ?? s.immersiveEnabled,
    overlayControlsEnabled: settings.overlayControlsEnabled ?? s.overlayControlsEnabled,
    overlayPosition: settings.overlayPosition ?? s.overlayPosition,
    statsEnabled: settings.statsEnabled ?? s.statsEnabled,
    volumeLevel: settings.volumeLevel ?? s.volumeLevel,
    autoUpdateEnabled: settings.autoUpdateEnabled ?? s.autoUpdateEnabled,
  })),

  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setMiniPlayerOpen: (v) => set({ miniPlayerOpen: v }),

  // UI State management (Fase 1)
  setUIState: (feature, state) => set((s) => ({
    uiState: { ...s.uiState, [feature]: state }
  })),
}))
