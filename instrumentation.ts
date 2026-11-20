// Runs once when the server starts. On the live site, warm the seasonal trackers
// (loaded from the last saved result, then refreshed in the background).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.RENDER_SERVICE_ID !== 'srv-db3ufoad0e5s73f5dudg') return;
  const port = process.env.PORT || '10000';
  setTimeout(() => {
    for (const event of ['christmas', 'black-friday']) fetch(`http://127.0.0.1:${port}/api/seasonal?event=${event}`, {cache: 'no-store'}).catch(() => {});
  }, 8000);
}
