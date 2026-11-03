// Runs once when the Next.js server starts. The condition must wrap the import so the
// Node-only scheduler (SQLite, fs) is left out of the Edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startT212Scheduler } = await import('./lib/t212-scheduler');
    startT212Scheduler();
  }
}
