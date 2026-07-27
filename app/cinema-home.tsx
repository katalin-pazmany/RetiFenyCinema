'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Movie } from '@/lib/types';
import { usesScrollScene } from '@/lib/homepage/scroll-scene';
import styles from './cinema-home.module.css';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// The combined pinned scene's scroll progress (0..1) is split into two
// phases: the first CAMERA_PHASE_FRACTION rotates the 3D camera from the
// seats toward the screen (Task 6); the rest scrubs the poster track once
// the camera has settled (Task 7). 0.35 gives the camera turn a shorter
// "establishing" beat and the poster browsing — the actual point of the
// page — the majority of the scroll budget.
const CAMERA_PHASE_FRACTION = 0.35;

// Total scroll distance the pinned scene consumes, as a multiple of the
// viewport height. Tunable: shorter feels abrupt, longer feels sluggish.
const SCENE_HEIGHT_VH = 350;

// A textbook useSyncExternalStore case: subscribing to a mutable value that
// lives outside React (the OS-level motion preference via matchMedia). This
// also happens to be the only form eslint-plugin-react-hooks's
// react-hooks/set-state-in-effect rule accepts for this pattern — a plain
// useState+useEffect that calls setState synchronously in the effect body
// is flagged, since it causes an extra render pass right after mount.
function subscribeToReducedMotionChange(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false; // SSR has no OS preference to read; resolved on the client after hydration.
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToReducedMotionChange, getReducedMotionSnapshot, getReducedMotionServerSnapshot);
}

export function CinemaHome({ movies }: { movies: Movie[] }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  // False whenever reduced motion is preferred OR there are too few movies
  // to make a scroll-scrub meaningful — either way, the poster section
  // should render as a plain static grid instead (see `staticPosterGrid`
  // below). The 3D model is unaffected by movie count either way.
  const showPosterScrub = !prefersReducedMotion && usesScrollScene(movies.length);

  // Mirrored into a ref so Task 6's Sketchfab init effect can read the
  // current value without depending on it — depending on it directly would
  // re-run client.init() (creating a second embedded viewer) if the user's
  // OS-level motion preference changes after the model has already loaded,
  // instead of only affecting the one-time decision of where the camera
  // starts.
  const prefersReducedMotionRef = useRef(prefersReducedMotion);
  useEffect(() => {
    prefersReducedMotionRef.current = prefersReducedMotion;
  }, [prefersReducedMotion]);

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);

  // Placeholders filled in by Task 6 (camera) and Task 7 (posters). Keeping
  // them as no-ops here means this task's ScrollTrigger wiring is fully
  // testable in isolation (via manual scroll) before either phase has real
  // behavior.
  function updateCameraPhase(_progress: number): void {}
  function updatePosterPhase(_progress: number): void {}

  useEffect(() => {
    if (prefersReducedMotion || !sceneRef.current || !pinRef.current) {
      return;
    }

    const trigger = ScrollTrigger.create({
      trigger: sceneRef.current,
      start: 'top top',
      end: () => `+=${window.innerHeight * (SCENE_HEIGHT_VH / 100)}`,
      pin: pinRef.current,
      scrub: true,
      onUpdate: (self) => {
        if (self.progress <= CAMERA_PHASE_FRACTION) {
          const cameraProgress = self.progress / CAMERA_PHASE_FRACTION;
          updateCameraPhase(cameraProgress);
        } else {
          updateCameraPhase(1); // camera phase complete — hold the final pose
          if (showPosterScrub) {
            const posterProgress = (self.progress - CAMERA_PHASE_FRACTION) / (1 - CAMERA_PHASE_FRACTION);
            updatePosterPhase(posterProgress);
          }
        }
      },
    });

    return () => trigger.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running on every movies/showPosterScrub change would tear down and rebuild the trigger mid-scroll; this effect intentionally only depends on prefersReducedMotion. updateCameraPhase/updatePosterPhase are also intentionally omitted — both only ever read from refs/constants, never from props or state, so which render's copy of them gets closed over here doesn't matter.
  }, [prefersReducedMotion]);

  if (movies.length === 0) {
    return (
      <main className={styles.main}>
        <h1>RetfenyMozi</h1>
        <p className={styles.empty}>No movies are scheduled right now — check back soon.</p>
      </main>
    );
  }

  // Shared between the pinned/scroll-driven path and the reduced-motion
  // static path — per the spec, reduced motion removes the *scroll-linked
  // rotation*, not the 3D model itself, so the same embed (title overlay,
  // attribution, error fallback) renders either way. Task 6 fills this in.
  const auditorium = (
    <>{/* Task 6 fills this with the Sketchfab embed + title overlay + attribution. */}</>
  );

  // Also shared: whenever showPosterScrub is false (reduced motion OR too
  // few movies to scroll-scrub), render the plain static grid instead.
  const staticPosterGrid = !showPosterScrub && (
    <div className={styles.static}>
      <ul className={styles.staticGrid}>
        {movies.map((movie) => (
          <li key={movie.id}>
            <Link href={`/movies/${movie.id}`}>{movie.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <main className={styles.main}>
      <div className={styles.scene} ref={sceneRef}>
        <div className={styles.auditorium} ref={pinRef}>
          {auditorium}
          {/* Task 7 fills this with the poster track + glow, as a sibling
              of {auditorium} within this same pinned div, rendered only
              when showPosterScrub is true. */}
        </div>
      </div>
      {staticPosterGrid}
    </main>
  );
}
