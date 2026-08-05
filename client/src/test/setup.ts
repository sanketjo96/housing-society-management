import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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
