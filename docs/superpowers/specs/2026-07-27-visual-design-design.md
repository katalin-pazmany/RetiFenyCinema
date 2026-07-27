# RetfenyMozi: Visual Design

## Context

The walking-skeleton build (movie listings, movie detail, showtimes, about)
shipped with no visual styling — plain unstyled HTML, `create-next-app`'s
default reset CSS, and Arial throughout. This sub-project adds a real visual
identity: a dark, cinematic look reflecting a classic single-screen local
cinema, applied consistently across all four existing pages.

This is a styling-only change. No new routes, data, or business logic —
`getNowShowing`, `getMovieById`, `getShowtimesForMovie`, `getAllShowtimes`,
and every existing test stay exactly as they are.

## Goal

Give RetfenyMozi a distinct, cohesive dark-cinematic visual identity across
all four pages, using plain CSS (no new styling framework), that holds up on
both desktop and mobile.

## Visual Language

- **Palette:** near-black background (`#0b0b0d`), warm off-white foreground
  text (`#f2ede7`), crimson accent (`#b8272c`) for links, IMDb rating
  badges, showtime chips, and buttons/CTAs.
- **Theme mode:** always dark. No light-mode variant — the site does not
  respond to `prefers-color-scheme`, unlike the current `create-next-app`
  boilerplate default.
- **Typography:** a serif display font (Playfair Display, loaded via
  `next/font/google`) for headings and movie titles, for a classic
  marquee/theatrical feel. Geist Sans (already imported in `app/layout.tsx`
  but currently unused in `globals.css`) is applied to body text, nav
  links, and UI chrome (meta info, buttons, showtime chips).
- **Tone:** classic cinema marquee — warm and a little theatrical, not a
  slick streaming-app look.

## Structure

**Design tokens** live as CSS custom properties in `app/globals.css` —
background/foreground/accent colors, the two font-family variables, and a
small spacing scale. This is the single source of truth every page pulls
from; no page hardcodes a color or font outside these tokens.

**Styling implementation:** plain CSS, no new framework dependency beyond
the one Google Font. `app/globals.css` holds tokens, resets, and the nav.
Each page gets a colocated CSS Module (`app/page.module.css`,
`app/movies/[id]/page.module.css`, `app/showtimes/page.module.css`,
`app/about/page.module.css`) for layout-specific styles, following Next.js
App Router's built-in CSS Modules support.

**Nav** (`app/layout.tsx`): a wordmark ("RetfenyMozi") on the left linking
to `/`, and the three existing nav links (Now Showing, Showtimes, About) on
the right, styled uppercase with letter-spacing. No new links or pages —
purely restyling what's already there.

## Pages

### Home (`/`)

Poster grid. Each movie is a card: a portrait-aspect poster (or the
existing placeholder SVG) with the title overlaid at the bottom against a
gradient scrim for legibility, linking to its detail page. Grid uses CSS
Grid with `repeat(auto-fill, minmax(...))` so it holds up whether there's 1
film or a dozen — no hardcoded column count. The existing empty state
("No movies are scheduled right now...") keeps its current text, restyled
to match the dark palette rather than left as unstyled black-on-white.

### Movie detail (`/movies/[id]`)

Full-bleed hero banner: a dark gradient banner (using the poster as a
background treatment) with the movie title overlaid, followed by a
single-column body below — runtime/director/IMDb rating badge, synopsis,
director, cast, trailer link (styled as an outlined button), and showtimes
(styled as small crimson-tinted chips, using the existing `formatShowtime`
output unchanged). The existing `notFound()` 404 behavior for missing or
non-numeric ids is untouched.

### Showtimes (`/showtimes`)

No hero treatment — this page is a straightforward list, restyled with the
same dark palette, serif section heading, and crimson-accented links to
each movie's detail page. The existing empty state keeps its text,
restyled.

### About (`/about`)

Same dark palette and serif headings as the rest of the site; the existing
copy (cinema description, contact email) is unchanged, just restyled as
readable body text instead of unstyled black-on-white.

## Responsiveness

The poster grid is the only layout that meaningfully changes shape across
breakpoints: it collapses to a single column below ~480px, roughly 2
columns on tablet widths, and up to 4+ on desktop, via
`grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))` (or similar)
— no separate mobile-specific markup or JavaScript-driven breakpoints. The
movie detail hero, showtimes list, and about page are single-column
already and need no structural change across breakpoints, only spacing
adjustments.

## Testing

This is a pure styling change — no new data, logic, or routes are
introduced. The existing Playwright E2E suite
(`browse-movies.spec.ts`, `showtimes.spec.ts`, `movie-detail.spec.ts`)
asserts on text content and links (movie titles, synopsis text, formatted
showtimes, trailer href), not on styles or DOM structure, so it is expected
to keep passing unchanged. The full suite (`npm run lint`, `npm run
typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run
test:e2e`) is re-run after implementation to confirm nothing broke.

No new automated visual-regression tests are added — a manual visual check
(screenshots of all four pages via a headless browser, as already done to
verify the previous build) is sufficient for a single-developer portfolio
site; automated visual-regression tooling would be disproportionate to the
scope of a styling pass.

## Out of Scope

- Any new page, route, or feature (booking, admin, etc. remain separate
  sub-projects per the original decomposition).
- Real poster images — the existing placeholder SVG and `posterUrl`
  handling from the walking skeleton are unchanged; this is a styling
  pass around whatever image is actually present.
- Automated visual-regression testing tooling.
- Tailwind or any other CSS framework.
