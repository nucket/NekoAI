import { describe, expect, it } from 'vitest'
import { resolveAnimation, type ResolveAnimationArgs } from './resolveAnimation'

const base: ResolveAnimationArgs = {
  petState: 'IDLE',
  notificationAlert: false,
  hasAlert: true,
  edgeAnimOverride: null,
  clickWakeAnim: null,
  idleAnim: null,
  moodOverride: null,
  currentAnimation: 'idle',
}

describe('resolveAnimation', () => {
  it('lets the notification alert win over everything', () => {
    const args = { ...base, notificationAlert: true, edgeAnimOverride: 'scratch', idleAnim: 'wash' }
    expect(resolveAnimation(args)).toBe('alert')
    // Pets without an alert sprite fall back to idle.
    expect(resolveAnimation({ ...args, hasAlert: false })).toBe('idle')
  })

  it('keeps walk_* sacred while WALKING: only the edge scratch may override', () => {
    const walking = {
      ...base,
      petState: 'WALKING' as const,
      currentAnimation: 'walk_left',
      clickWakeAnim: 'awaken',
      idleAnim: 'wash',
      moodOverride: 'yawn',
    }
    expect(resolveAnimation(walking)).toBe('walk_left')
    expect(resolveAnimation({ ...walking, edgeAnimOverride: 'scratch_left' })).toBe('scratch_left')
  })

  it('applies overrides in priority order when not walking', () => {
    const all = {
      ...base,
      edgeAnimOverride: 'edge',
      clickWakeAnim: 'click',
      idleAnim: 'idleSeq',
      moodOverride: 'mood',
    }
    expect(resolveAnimation(all)).toBe('edge')
    expect(resolveAnimation({ ...all, edgeAnimOverride: null })).toBe('click')
    expect(resolveAnimation({ ...all, edgeAnimOverride: null, clickWakeAnim: null })).toBe(
      'idleSeq'
    )
    expect(
      resolveAnimation({ ...all, edgeAnimOverride: null, clickWakeAnim: null, idleAnim: null })
    ).toBe('mood')
    expect(resolveAnimation(base)).toBe('idle')
  })
})
