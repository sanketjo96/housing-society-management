# Backend setup

The backend lives in `server/` — Express + TypeScript, no routes or business logic yet
(that starts in later phases). This doc covers what's here after Task 0.1.

## Running locally

```sh
cd server
npm install
npm run dev     # tsx watch src/server.ts — starts on PORT (default 3000), restarts on change
```

Other scripts:

- `npm test` — run the Vitest suite once (`npm run test:watch` for watch mode).
- `npm run build` — type-check and compile `src/` to `dist/` via `tsc`.
- `npm start` — run the compiled build (`node dist/server.js`) — used in production, not dev.
- `npm run lint` — ESLint over the whole `server/` tree.
- `npm run format` — Prettier, writes in place.

## What each config file does

| File | Purpose |
|---|---|
| `package.json` | Scripts and dependencies. `type: commonjs` — matches `tsconfig.json`'s `module: CommonJS`, keeps things simple with Prisma/node-cron later (no ESM interop concerns). |
| `tsconfig.json` | Strict TypeScript config, compiles `src/` → `dist/`, target ES2022. |
| `eslint.config.js` | Lint rules. See breakdown below. |
| `.prettierrc` | Formatting rules: single quotes, semicolons, trailing commas, 100-char print width. |
| `.gitignore` | Excludes `node_modules/`, `dist/`, `.env`, logs. |

### `eslint.config.js` breakdown

This is ESLint's **flat config** format (the standard since ESLint v9, replacing the old
`.eslintrc.json`). A flat config exports an *array* of config objects, applied in order,
each layering onto what came before. `tseslint.config(...)` is a typed helper that
flattens nested arrays into that list — it adds no behavior of its own.

```js
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
```

1. **`js.configs.recommended`** — ESLint's core JS rules (unreachable code, unused vars,
   etc).
2. **`...tseslint.configs.recommended`** — TypeScript-aware rules on top (unused types,
   unsafe `any` usage, etc). Spread with `...` because, unlike the others, this export is
   itself an array of several config objects (parser setup + rules), not a single object.
3. **`prettier`** (from `eslint-config-prettier`) — disables every ESLint rule that would
   conflict with Prettier's formatting (indentation, quote style, etc). Prettier owns
   formatting, ESLint owns correctness; listed last so it can override anything above it.
4. **`ignores`** — skip build output and dependencies.
5. **The self-referential override block** — the one non-obvious piece. `eslint.config.js`
   itself is written in CommonJS (`require`, `module.exports`), but rule set (2) assumes
   TypeScript/ESM-style code and doesn't recognize `require`/`module` as valid globals —
   so without this block, ESLint flags its *own config file's* `require()` calls as
   errors. This block scopes an exception to just `eslint.config.js`: treat
   `require`/`module`/`__dirname` as valid globals, and turn off the TS rule that bans
   `require()`. Nothing else in the codebase gets this exception — `src/` and `tests/`
   use ES module `import`/`export` throughout.

## Project structure so far

```
server/
  src/
    app.ts       # exports the Express app instance (app.use, middleware go here) — no routes yet
    server.ts    # entry point: imports app, calls app.listen()
  tests/
    app.test.ts  # asserts app.ts exports a valid Express instance
```

`app.ts` and `server.ts` are deliberately split: `app.ts` is what tests import (so tests
never need a real listening port), `server.ts` is only ever run, never imported.

## Test runner

Vitest, chosen (see `CLAUDE.md`) to share one toolchain with the frontend, which needs
Vitest + React Testing Library anyway. Tests live under `server/tests/`.
