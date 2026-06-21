// Load .env (DB_TEST_*) if present — for integration tests against the test DB.
// In CI without .env we use the defaults from core/db.js (bobe_agent_test on localhost).
try {
  process.loadEnvFile('.env');
} catch {
  // .env may be absent — that's fine
}
