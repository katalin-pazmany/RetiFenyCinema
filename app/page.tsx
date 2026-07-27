import { getNowShowing } from '@/lib/db/queries';
import { CinemaHome } from './cinema-home';

// Render on every request. Without this, Next.js prerenders this page at build
// time and bakes the build-time database contents into static HTML, so
// re-seeding the database would have no effect until the next deploy.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const movies = await getNowShowing();
  return <CinemaHome movies={movies} />;
}
