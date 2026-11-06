/*
 * Where the app gets its data.
 *
 * apiBase:
 *   undefined  (default) use the page's own origin, which is where
 *              `npm start` (json-server --static .) serves both the app and
 *              the API. Falls back to db.json in memory if no API answers.
 *   'http://localhost:3001'   a json-server or real backend elsewhere
 *   ''         always use db.json in memory (no API calls)
 *
 * A ?api=<url> query parameter overrides this file.
 */
window.SARAL_CONFIG = {
  // apiBase: 'http://localhost:3001',
  seedUrl: 'db.json',
  seedResetUrl: 'db.seed.json',
};
