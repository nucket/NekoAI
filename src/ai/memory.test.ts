import { describe, expect, it } from 'vitest'
import { extractFacts } from './memory'

describe('extractFacts', () => {
  it.each([
    ['Hi! My name is Naudy and I am working on NekoAI', { name: 'Naudy', project: 'NekoAI' }],
    ['me llamo Andrés', { name: 'Andrés' }],
    ['I code in Rust', { language: 'Rust' }],
    ['my project is called Desktop Pet', { project: 'Desktop Pet' }],
  ])('extracts facts from %j', (message, expected) => {
    expect(extractFacts(message)).toEqual(expected)
  })

  it.each([
    'call me later please',
    "I'm working on it right now",
    'I use this a lot',
    'what is the weather?',
    '',
  ])('ignores filler captures in %j', (message) => {
    expect(extractFacts(message)).toEqual({})
  })
})
