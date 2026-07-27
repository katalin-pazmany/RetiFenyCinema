# RetfenyMozi: Cinema Scroll Homepage & Booking CTAs

## Context

RetfenyMozi's homepage currently shows a plain grid of movie posters (`app/page.tsx`),
each linking to that movie's detail page. The dark cinematic visual-design pass
(sub-project 1.5) and the booking system (sub-project 2) are both live — a
customer can already reach `/book/[showtimeId]` and complete a purchase — but
nothing on the site visually signals "sitting in a cinema," and nothing reads
as an explicit "Book" call-to-action anywhere: showtimes are unlabeled time
chips (`app/movies/[id]/page.tsx`) or, on `/showtimes`, plain text with no
link to booking at all.

This redesign replaces the homepage with an immersive, scroll-driven
experience and fixes the missing booking CTAs. It was scoped through
brainstorming with an interactive prototype (built and iterated in the
visual-companion tool) before this spec was written.

## Goal

1. The homepage feels like sitting in a cinema: visitors land in a 3D cinema
   auditorium, scroll to turn toward the screen, then scroll through what's
   showing as posters slide across it.
2. Every showtime, everywhere it appears, is an unambiguous "Book" button.

## Scope

- Homepage (`app/page.tsx`) — full rebuild.
- Movie detail page (`app/movies/[id]/page.tsx`) — showtime chips become
  explicit "Book" buttons.
- Showtimes page (`app/showtimes/page.tsx`) — currently has no link to
  booking at all; each row gets one.
- Not in scope: `/about`, the admin dashboard (a separate future
  sub-project), any database or booking-flow changes. This is a front-end
  presentation and navigation change only.

## Architecture

The homepage becomes a single continuous scroll experience in two acts,
handed off from one to the other at a fixed point — not a continuously
blended 3D-to-2D transition (see "Rejected approach" below for why).

**Act one — the room.** A Sketchfab-embedded 3D model (the "VR Cinema"
model the user selected, model UID `d680d16468f44cc1aefa90d0d996a26f`) fills
the viewport on load, seats in view, the RetfenyMozi title/wordmark overlaid
on top. Camera orbit/zoom/drag are not exposed to the visitor — the only
thing that moves the camera is scroll. As the visitor scrolls through this
section, JS reads scroll progress (0 to 1) and calls the Sketchfab Viewer
API's `setCameraLookAt(eye, target, duration)` on each update, interpolating
between a "facing the seats" camera position and a "facing the screen"
camera position. Confirmed via Sketchfab's public documentation that
`setCameraLookAt` works on a plain, free, anonymous embed — no API token or
paid tier required, just their viewer SDK (`sketchfab-viewer-<version>.js`)
loaded against the iframe and the model's UID.

**The handoff.** Once scroll progress through act one reaches 1 (camera has
reached the screen-facing position), that section pins in place. The 3D
model does not resume moving after this point for the rest of the page.

**Act two — the screen.** Only once the camera is screen-facing do the
movie posters appear, overlaid on the now-static screen area. From here the
behavior is the prototype already validated in the visual companion: posters
laid out in a horizontal track, pinned to the viewport, translated
horizontally as a function of continued scroll progress (GSAP ScrollTrigger
scrubbing the translateX), with a soft white radial glow behind them fading
into the dark background — the "light off a cinema screen" effect. No seat
silhouettes in this section (prototyped, then explicitly dropped per
feedback). Each poster is a real link to `/movies/[id]`, exactly as the
current grid's cards are.

**Component shape:** `app/page.tsx` stays a Server Component fetching
`getNowShowing()` (existing query, unchanged), passing the movie list as
props into a new Client Component that owns the Sketchfab embed, GSAP
ScrollTrigger setup, and all scroll-driven behavior — the same
Server-Component-fetches / Client-Component-renders split already
established for the booking page in sub-project 2 (`app/book/[showtimeId]/page.tsx`
→ `seat-map.tsx`).

**New dependency:** `gsap` (with the `ScrollTrigger` plugin) for act two's
scroll-scrubbed poster translation. `ScrollTrigger` is the standard tool for
exactly this pin-and-scrub pattern; both GSAP core and `ScrollTrigger` are
free to use. No new dependency is needed for the Sketchfab side — its
viewer SDK is loaded directly from Sketchfab's CDN inside the client
component, not installed via npm.

**Rejected approach:** continuously blending the 3D camera's rotation with a
2D poster overlay throughout act one (posters tracking a moving 3D screen in
real time) was considered and rejected during brainstorming — the 3D screen's
on-screen position and angle shift continuously as the camera orbits, so
keeping a flat HTML poster track visually locked to it would be fragile and
likely to drift or look wrong at different viewport sizes. The fixed
handoff point (camera settles, then posters appear) delivers the same
narrative beat with a much more reliable implementation.

## Attribution requirement

The embedded Sketchfab model requires attribution per its embed terms — the
"VR Cinema by Leandro Nicolas on Sketchfab" credit line (with links back to
the model, the author, and Sketchfab) must remain visible on the page,
however unobtrusively it's styled. This is a hard requirement, not a design
option to drop.

## Content-length edge case

If fewer than 2 movies are currently showing, the poster-scroll pin/scrub in
act two is skipped — a single poster sliding across an otherwise-empty track
would look broken, not cinematic. Below that threshold, the poster(s) render
centered and static once the handoff from act one completes, with no pinned
scroll-jacking section. Act one (the 3D room) is unaffected by movie count
and always plays the same way. The existing zero-movies empty state
("No movies are scheduled right now — check back soon.") is preserved,
shown in place of act two once the handoff completes.

## Accessibility: reduced motion

Visitors with `prefers-reduced-motion: reduce` set get both acts'
scroll-driven camera/poster motion disabled: the 3D model loads in a fixed,
screen-facing orientation (no scroll-linked rotation) and the poster grid
renders as a normal, statically-scrollable layout — visually similar to
today's homepage grid, just restyled to match the new dark cinema aesthetic.
This wasn't explicitly requested, but follows the project's existing
accessibility posture (the WCAG-AA contrast fix already applied to
`--color-accent-text`) and is standard, low-cost practice for a
scroll-jacking-heavy design.

## Mobile

Both acts behave identically on mobile and desktop — no simplified or
fallback mobile experience, per explicit direction. `prefers-reduced-motion`
still applies on mobile exactly as it does on desktop.

## Booking CTAs

- **`app/movies/[id]/page.tsx`:** each showtime chip's text changes from a
  bare formatted time (e.g. `7:30 PM`) to an explicit label, e.g.
  `Book — 7:30 PM`. The link target (`/book/[showtimeId]`) and the chip's
  visual treatment (pill shape, accent-muted background) are unchanged —
  only the copy changes to remove the ambiguity.
- **`app/showtimes/page.tsx`:** currently renders the showtime as a plain
  `<span>`, not a link. Each row's time becomes a link to `/book/[showtimeId]`
  with the same `Book — <time>` label pattern, styled consistently with the
  movie-detail page's chips.

## Error Handling

- **Sketchfab model fails to load** (CDN issue, network failure, ad
  blocker): act one degrades to a static dark panel showing the
  RetfenyMozi title/wordmark (no 3D content, no scroll-driven camera), and
  the page proceeds straight to act two on scroll — the homepage must never
  be blocked or broken by a third-party embed failing. This mirrors the
  project's existing philosophy of never letting an optional/external
  dependency (e.g. a missing poster image) break the page.
- **GSAP/ScrollTrigger fails to initialize** (unlikely, but the same
  principle applies): posters still render, just as a static, non-animated
  layout rather than a pinned scroll-scrub.

## Testing

- **Structural:** the Client Component renders the right number of poster
  links for a given movie list, each pointing at the correct
  `/movies/[id]`, independent of the scroll/3D behavior — testable without
  driving real scroll or WebGL.
- **E2E:** the existing `tests/e2e/browse-movies.spec.ts` ("home page lists
  the fixture movie", "clicking a movie navigates to its detail page") will
  need updating for the new homepage markup, but the same assertions still
  apply — a movie's poster/title must still be present and clickable to its
  detail page, regardless of the new scroll structure around it. Precisely
  animating and asserting on the 3D camera or GSAP scrub position is not
  planned as an E2E concern; the E2E layer confirms the content is present
  and reachable, not that the scroll animation is pixel-perfect.
- **Booking CTA copy:** existing or new tests confirm the showtime links on
  both `/movies/[id]` and `/showtimes` read `Book — <time>` and point at
  `/book/[showtimeId]`.

## Out of Scope

- Any change to the booking flow itself, the database, or showtime/movie
  data model.
- `/about` page or any other page not listed in Scope.
- Admin dashboard (a separate, future sub-project).
- True continuous 3D-camera-to-2D-poster blending (see "Rejected approach").
- Replacing or re-hosting the 3D asset — it stays a Sketchfab embed, not a
  self-hosted Three.js scene.
