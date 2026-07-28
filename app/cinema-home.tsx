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
// phases: a fixed-length camera turn (seats -> screen), then a poster
// scrub sized to the actual poster track width. The two budgets are
// computed in pixels (see cameraBudgetPxRef/totalBudgetPxRef below) so the
// camera-phase fraction is derived, not a guessed constant — otherwise the
// camera beat and the poster beat drift out of proportion depending on how
// many movies are showing (e.g. with exactly 2 movies the track is often
// no wider than the viewport, producing a dead scroll zone if the camera
// beat were still a fixed fraction of a fixed total).

// Fixed budget for the camera's "turn to face the screen" beat, as a
// multiple of the viewport height. Tunable: shorter feels abrupt, longer
// feels sluggish.
const CAMERA_SCROLL_VH_MULTIPLIER = 1.2;

// Slack so the last poster fully clears the viewport before the pin
// releases — shared with updatePosterPhase's own maxTranslate calculation
// below, so the two never drift apart.
const POSTER_TRACK_END_PADDING_PX = 160;

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

// Shared between the scroll-scrub track and the static reduced-motion/
// few-movies fallback grid, so the two paths can't independently drift out
// of sync again (the fallback previously lost its poster image and alt
// text entirely — see the design spec's requirement that the reduced-
// motion path stay "visually similar to today's homepage grid").
function PosterCard({ movie }: { movie: Movie }) {
  return (
    <Link href={`/movies/${movie.id}`} className={styles.poster}>
      {movie.posterUrl ? (
        <img src={movie.posterUrl} alt={`${movie.title} poster`} className={styles.posterImage} />
      ) : (
        <img src="/placeholder-poster.svg" alt={`${movie.title} poster placeholder`} className={styles.posterImage} />
      )}
      <h2 className={styles.posterTitle}>{movie.title}</h2>
    </Link>
  );
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
    // If the OS-level preference flips to "reduced" mid-session (not just
    // on load), snap the camera straight to the tuned screen-facing pose
    // rather than leaving it wherever the scroll-driven rotation last left
    // it — the ScrollTrigger effect's cleanup only kills the trigger, it
    // doesn't reposition the camera.
    if (prefersReducedMotion && sketchfabApiRef.current && seatsViewRef.current) {
      const screenView = addCameraOffset(seatsViewRef.current, SCREEN_VIEW_OFFSET);
      sketchfabApiRef.current.setCameraLookAt(screenView.eye, screenView.target, CAMERA_MOVE_DURATION_S);
    }
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

  // Cached scroll-budget-in-pixels values, written once per ScrollTrigger
  // `end` recompute (see the effect below) and read on every scroll tick in
  // `onUpdate` — avoids reading `track.scrollWidth` (a layout-forcing
  // read) on every single scroll event.
  const cameraBudgetPxRef = useRef(0);
  const totalBudgetPxRef = useRef(0);

  useEffect(() => {
    if (!scriptLoaded || !iframeRef.current || !window.Sketchfab) {
      return;
    }

    // Guards every async callback below so that on unmount (or React Strict
    // Mode's dev-only double-invoke of effects) a stale success/viewerready/
    // getCameraLookAt callback from a torn-down client can't write into refs
    // or race a second client.init() against the same iframe.
    let cancelled = false;
    const client = new window.Sketchfab(SKETCHFAB_VIEWER_VERSION, iframeRef.current);
    client.init(SKETCHFAB_MODEL_UID, {
      // ui_theme: dark backdrop instead of Sketchfab's default white, to
      // match the auditorium's dark background while the model loads.
      // ui_hint: 0 always suppresses the "click and hold to look around"
      // hint — showing it would be actively misleading here, since the
      // camera is deliberately scroll-driven only (see .sketchfabFrame's
      // pointer-events: none) and dragging genuinely does nothing.
      ui_theme: 'dark',
      ui_hint: 0,
      success: (api) => {
        if (cancelled) {
          return;
        }
        sketchfabApiRef.current = api;
        api.start();
        api.addEventListener('viewerready', () => {
          if (cancelled) {
            return;
          }
          api.getCameraLookAt((err, camera) => {
            if (cancelled) {
              return;
            }
            if (err) {
              setSketchfabFailed(true);
              return;
            }
            const seatsView: CameraPose = { eye: camera.position, target: camera.target };
            seatsViewRef.current = seatsView;
            // Catch up: if the visitor already scrolled through act one
            // while the model was still loading, onUpdate has been no-oping
            // (updateCameraPhase early-returns without a seats view) —
            // force GSAP to recompute and re-fire onUpdate for the current
            // scroll position now that the seats view is finally known.
            ScrollTrigger.update();

            if (prefersReducedMotionRef.current) {
              const screenView = addCameraOffset(seatsView, SCREEN_VIEW_OFFSET);
              api.setCameraLookAt(screenView.eye, screenView.target, 0);
            }
          });
        });
      },
      error: () => {
        if (!cancelled) {
          setSketchfabFailed(true);
        }
      },
    });

    return () => {
      cancelled = true;
      sketchfabApiRef.current = null;
      seatsViewRef.current = null;
      settledAtScreenRef.current = false;
    };
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
    const maxTranslate = Math.max(track.scrollWidth - window.innerWidth + POSTER_TRACK_END_PADDING_PX, 0);
    gsap.set(track, { x: -progress * maxTranslate });
  }

  useEffect(() => {
    if (prefersReducedMotion || !sceneRef.current || !pinRef.current) {
      return;
    }

    // GSAP/ScrollTrigger failing to pin (JS disabled, an exception, an
    // ad-blocked bundle) must not leave the poster track physically
    // unreachable — .track's CSS only switches into its pinned/absolute
    // layout once [data-pinned="true"] is set below, on success. On
    // failure it stays in its default reachable, non-clipped layout.
    let trigger: ScrollTrigger | undefined;
    try {
      trigger = ScrollTrigger.create({
        trigger: sceneRef.current,
        start: 'top top',
        end: () => {
          const cameraBudget = window.innerHeight * CAMERA_SCROLL_VH_MULTIPLIER;
          const posterBudget =
            showPosterScrub && trackRef.current
              ? Math.max(trackRef.current.scrollWidth - window.innerWidth + POSTER_TRACK_END_PADDING_PX, 0)
              : 0;
          cameraBudgetPxRef.current = cameraBudget;
          totalBudgetPxRef.current = cameraBudget + posterBudget;
          return `+=${cameraBudget + posterBudget}`;
        },
        pin: pinRef.current,
        scrub: true,
        // Recompute `end` after resize and once poster images finish
        // loading — track.scrollWidth can change then, and the budget
        // above needs to be re-evaluated when it does.
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const cameraFraction =
            totalBudgetPxRef.current > 0 ? cameraBudgetPxRef.current / totalBudgetPxRef.current : 1;
          // Only reveal the posters/glow once the camera has finished its
          // turn to face the screen — see .auditorium[data-phase="posters"]
          // in the stylesheet. Strictly-less-than (not <=) matters here:
          // when posterBudget is 0 (e.g. a short 2-poster track that
          // already fits within the viewport), cameraFraction is exactly 1,
          // and self.progress can reach exactly 1 at full scroll — with
          // <=, that case would compare 1 <= 1 and stay 'camera' forever,
          // permanently hiding/disabling the posters.
          if (pinRef.current) {
            pinRef.current.dataset.phase = self.progress < cameraFraction ? 'camera' : 'posters';
          }
          if (self.progress < cameraFraction) {
            const cameraProgress = cameraFraction > 0 ? self.progress / cameraFraction : 1;
            updateCameraPhase(cameraProgress);
          } else {
            updateCameraPhase(1); // camera phase complete — hold the final pose
            if (showPosterScrub) {
              const posterProgress = cameraFraction < 1 ? (self.progress - cameraFraction) / (1 - cameraFraction) : 0;
              updatePosterPhase(posterProgress);
            }
          }
        },
      });
      if (pinRef.current) {
        pinRef.current.dataset.pinned = 'true';
      }
    } catch (error) {
      // Not a Sketchfab failure (setSketchfabFailed would be the wrong
      // signal here) — this is GSAP itself failing to pin. Leave
      // data-pinned unset so the CSS fallback layout applies.
      console.error('Failed to create the cinema scroll scene ScrollTrigger:', error);
    }

    return () => trigger?.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running on every movies/showPosterScrub change would tear down and rebuild the trigger mid-scroll; this effect intentionally only depends on prefersReducedMotion. updateCameraPhase/updatePosterPhase are also intentionally omitted — both only ever read from refs/constants, never from props or state, so which render's copy of them gets closed over here doesn't matter.
  }, [prefersReducedMotion]);

  if (movies.length === 0) {
    return (
      <main id="main-content" className={styles.main}>
        <h1>Now Showing at RetfenyMozi</h1>
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
      <h1 className={styles.title}>Now Showing at RetfenyMozi</h1>
    </div>
  ) : (
    <>
      <Script
        src={SKETCHFAB_VIEWER_SRC}
        strategy="afterInteractive"
        // onReady (not onLoad): next/script caches remote scripts by src at
        // the module level, so onLoad only ever fires once, ever — a later
        // mount of this same <Script> (e.g. navigating away from `/` and
        // back) would silently never call it again. onReady fires on every
        // mount once the script has loaded, including cache hits.
        onReady={() => setScriptLoaded(true)}
        onError={() => setSketchfabFailed(true)}
      />
      <iframe
        ref={iframeRef}
        title="RetfenyMozi auditorium"
        className={styles.sketchfabFrame}
        allow="autoplay; fullscreen; xr-spatial-tracking"
        // Purely decorative — the camera is scroll-driven only, and
        // pointer-events: none already blocks interaction. Keep it out of
        // the tab order and hidden from screen readers.
        aria-hidden="true"
        tabIndex={-1}
      />
      <h1 className={styles.title}>Now Showing at RetfenyMozi</h1>
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
            <PosterCard movie={movie} />
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <main id="main-content" className={styles.main}>
      <div className={styles.scene} ref={sceneRef}>
        <div className={styles.auditorium} ref={pinRef}>
          {auditorium}
          {showPosterScrub && (
            <div className={styles.glow} aria-hidden="true" />
          )}
          {showPosterScrub && (
            <div className={styles.track} ref={trackRef}>
              {movies.map((movie) => (
                <PosterCard key={movie.id} movie={movie} />
              ))}
            </div>
          )}
        </div>
      </div>
      {staticPosterGrid}
    </main>
  );
}
