import { describe, expect, it } from 'vitest'
import { resolveAnimation, type ResolveAnimationArgs } from './resolveAnimation'

const base: ResolveAnimationArgs = {
  petState: 'IDLE',
  notificationAlert: false,
  hasAlert: true,
  edgeAnimOverride: null,
  clickWakeAnim: null,
  triggerAnim: null,
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
      triggerAnim: 'thinking',
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
      triggerAnim: 'trigger',
      idleAnim: 'idleSeq',
      moodOverride: 'mood',
    }
    expect(resolveAnimation(all)).toBe('edge')
    const noEdge = { ...all, edgeAnimOverride: null }
    expect(resolveAnimation(noEdge)).toBe('click')
    const noClick = { ...noEdge, clickWakeAnim: null }
    expect(resolveAnimation(noClick)).toBe('trigger')
    const noTrigger = { ...noClick, triggerAnim: null }
    expect(resolveAnimation(noTrigger)).toBe('idleSeq')
    expect(resolveAnimation({ ...noTrigger, idleAnim: null })).toBe('mood')
    expect(resolveAnimation(base)).toBe('idle')
  })
})
