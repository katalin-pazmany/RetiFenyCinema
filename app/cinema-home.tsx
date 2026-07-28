'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Movie } from '@/lib/types';
import { usesScrollScene } from '@/lib/homepage/scroll-scene';
import { interpolateCamera, type CameraPose } from '@/lib/homepage/sketchfab-camera';
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

const SKETCHFAB_MODEL_UID = 'd680d16468f44cc1aefa90d0d996a26f';
const SKETCHFAB_VIEWER_SRC = 'https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js';
const SKETCHFAB_VIEWER_VERSION = '1.12.1';

// A short but non-zero duration so setCameraLookAt eases toward each new
// target rather than snapping — called on every scroll update, so it must
// stay short enough not to visibly lag behind the scroll position.
const CAMERA_MOVE_DURATION_S = 0.15;

// SEATS_VIEW is captured from the model's own default camera on load (see
// the `viewerready` handling below) — there's no way to know it up front.
// SCREEN_VIEW is a starting guess (pulled back and turned further into the
// scene from wherever SEATS_VIEW turns out to be) that must be tuned by
// hand: run `npm run dev`, scroll through act one, and adjust the numbers
// below until the camera actually ends up facing the screen. See Step 6.
const SCREEN_VIEW_OFFSET: CameraPose = { eye: [0, 1, -6], target: [0, 0, -14] };

function addCameraOffset(base: CameraPose, offset: CameraPose): CameraPose {
  return {
    eye: [base.eye[0] + offset.eye[0], base.eye[1] + offset.eye[1], base.eye[2] + offset.eye[2]],
    target: [base.target[0] + offset.target[0], base.target[1] + offset.target[1], base.target[2] + offset.target[2]],
  };
}

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
  const trackRef = useRef<HTMLDivElement | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sketchfabApiRef = useRef<SketchfabViewerApi | null>(null);
  const seatsViewRef = useRef<CameraPose | null>(null);
  const [sketchfabFailed, setSketchfabFailed] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const settledAtScreenRef = useRef(false);

  useEffect(() => {
    if (!scriptLoaded || !iframeRef.current || !window.Sketchfab) {
      return;
    }

    const client = new window.Sketchfab(SKETCHFAB_VIEWER_VERSION, iframeRef.current);
    client.init(SKETCHFAB_MODEL_UID, {
      success: (api) => {
        sketchfabApiRef.current = api;
        api.start();
        api.addEventListener('viewerready', () => {
          api.getCameraLookAt((err, camera) => {
            if (err) {
              setSketchfabFailed(true);
              return;
            }
            const seatsView: CameraPose = { eye: camera.position, target: camera.target };
            seatsViewRef.current = seatsView;

            if (prefersReducedMotionRef.current) {
              const screenView = addCameraOffset(seatsView, SCREEN_VIEW_OFFSET);
              api.setCameraLookAt(screenView.eye, screenView.target, 0);
            }
          });
        });
      },
      error: () => setSketchfabFailed(true),
    });
    // prefersReducedMotion is read via prefersReducedMotionRef (see above)
    // specifically so this effect does not depend on it — see that ref's
    // comment for why.
  }, [scriptLoaded]);

  function updateCameraPhase(progress: number): void {
    const api = sketchfabApiRef.current;
    const seatsView = seatsViewRef.current;
    if (!api || !seatsView) {
      return;
    }

    if (progress >= 1) {
      if (!settledAtScreenRef.current) {
        const screenView = addCameraOffset(seatsView, SCREEN_VIEW_OFFSET);
        api.setCameraLookAt(screenView.eye, screenView.target, CAMERA_MOVE_DURATION_S);
        settledAtScreenRef.current = true;
      }
      return;
    }

    settledAtScreenRef.current = false;
    const screenView = addCameraOffset(seatsView, SCREEN_VIEW_OFFSET);
    const pose = interpolateCamera(progress, seatsView, screenView);
    api.setCameraLookAt(pose.eye, pose.target, CAMERA_MOVE_DURATION_S);
  }

  function updatePosterPhase(progress: number): void {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const maxTranslate = Math.max(track.scrollWidth - window.innerWidth + 160, 0);
    gsap.set(track, { x: -progress * maxTranslate });
  }

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
  // attribution, error fallback) renders either way.
  const auditorium = sketchfabFailed ? (
    <div className={styles.sketchfabFallback}>
      <h1 className={styles.title}>RetfenyMozi</h1>
    </div>
  ) : (
    <>
      <Script
        src={SKETCHFAB_VIEWER_SRC}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setSketchfabFailed(true)}
      />
      <iframe
        ref={iframeRef}
        title="RetfenyMozi auditorium"
        className={styles.sketchfabFrame}
        allow="autoplay; fullscreen; xr-spatial-tracking"
      />
      <h1 className={styles.title}>RetfenyMozi</h1>
      <p className={styles.attribution}>
        <a
          href="https://sketchfab.com/3d-models/vr-cinema-d680d16468f44cc1aefa90d0d996a26f"
          target="_blank"
          rel="noreferrer"
        >
          VR Cinema
        </a>{' '}
        by{' '}
        <a href="https://sketchfab.com/LeandroN" target="_blank" rel="noreferrer">
          Leandro Nicolas
        </a>{' '}
        on{' '}
        <a href="https://sketchfab.com" target="_blank" rel="noreferrer">
          Sketchfab
        </a>
      </p>
    </>
  );

  // Also shared: whenever showPosterScrub is false (reduced motion OR too
  // few movies to scroll-scrub), render the plain static grid instead.
  const staticPosterGrid = !showPosterScrub && (
    <div className={styles.static}>
      <ul className={styles.staticGrid}>
        {movies.map((movie) => (
          <li key={movie.id}>
            <Link href={`/movies/${movie.id}`}>
              <h2>{movie.title}</h2>
            </Link>
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
          {showPosterScrub && (
            <div className={styles.glow} aria-hidden="true" />
          )}
          {showPosterScrub && (
            <div className={styles.track} ref={trackRef}>
              {movies.map((movie) => (
                <Link key={movie.id} href={`/movies/${movie.id}`} className={styles.poster}>
                  {movie.posterUrl ? (
                    <img src={movie.posterUrl} alt={`${movie.title} poster`} className={styles.posterImage} />
                  ) : (
                    <img
                      src="/placeholder-poster.svg"
                      alt={`${movie.title} poster placeholder`}
                      className={styles.posterImage}
                    />
                  )}
                  <h2 className={styles.posterTitle}>{movie.title}</h2>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      {staticPosterGrid}
    </main>
  );
}
