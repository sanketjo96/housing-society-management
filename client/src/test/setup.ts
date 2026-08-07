import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no real matchMedia implementation. useIsMobile (lib/use-is-mobile.ts)
// calls it unconditionally, so any test rendering a component that uses that hook
// (directly or via a child) would otherwise crash with "matchMedia is not a
// function" — stubbed globally here rather than per test file. Defaults to
// "desktop" (the query never matches); a test that specifically needs mobile
// behavior can re-stub `window.matchMedia` itself with `matches: true`.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

// Vitest's `globals` mode is deliberately off in this project (tests import
// describe/it/expect explicitly) — React Testing Library's automatic cleanup relies
// on detecting a global afterEach, which doesn't exist without that mode, so it has
// to be registered explicitly here instead. Without this, every test file that
// renders more than once (LoginPage.test.tsx, Task 2.7, is the first) leaks DOM
// nodes between tests — surfaced as spurious "multiple elements found" failures that
// have nothing to do with the component under test.
afterEach(() => {
  cleanup()
})
