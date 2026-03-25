const test = require('node:test')
const assert = require('node:assert/strict')

const { playbackState } = require('../services/adapters/PlaybackState')

test('PlaybackState getCurrent expone timestamp y estado derivado', () => {
  playbackState.reset()
  playbackState.update({ isPlaying: true, title: 'Song' })

  const snapshot = playbackState.getCurrent()

  assert.equal(snapshot.isPlaying, true)
  assert.equal(snapshot.status, 'playing')
  assert.ok(Number.isFinite(snapshot.timestamp))
})
