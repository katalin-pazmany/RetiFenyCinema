# RetfenyMozi: Omniplex-Style Homepage Redesign

## Context

The previous homepage redesign (a two-act, scroll-driven experience with a
Sketchfab-embedded 3D auditorium and a GSAP poster scroll-scrub) is being
rolled back. After deploying and testing it live, two of its three visual
problems turned out to be Sketchfab platform limitations, not bugs: the
white 3D-viewport background and the "click and hold to look around" hint
cannot be suppressed on a free/anonymous embed — confirmed directly against
the embed page's own served configuration (`uiHint`/`uiAnimations` are
silently forced back to their defaults regardless of what the API request
asks for, the same restriction as the paid-only `transparent` background
option). Continuing to fight this isn't worth it.

This spec replaces that homepage with a simpler, reliable design modeled on
[Omniplex Cinemas](https://www.omniplexcinemas.co.uk/): a clean, dark,
vertical list of movie cards, each with a direct "Book" link per showtime —
no 3D, no scroll-jacking, no client-side animation library.

## Goal

A homepage that lists what's showing as a straightforward, scannable,
normally-scrolling list, styled in RetfenyMozi's existing dark cinematic
theme with red pushed forward as the dominant accent color, where a visitor
can go straight from "what's playing" to "book this showtime" without an
intermediate page.

## Scope

- Homepage (`app/page.tsx`) — full rebuild, replacing the current
  `CinemaHome` client component entirely.
- A new query, `getNowShowingWithShowtimes()`, added to `lib/db/queries.ts`.
- Design-token adjustments in `app/globals.css` to push red further forward
  as the dominant accent (buttons, badges) — see "Color" below.
- Removal of everything the previous homepage redesign introduced that
  nothing else depends on: `app/cinema-home.tsx`, `app/cinema-home.module.css`,
  `lib/homepage/scroll-scene.ts` + its test, `lib/homepage/sketchfab-camera.ts`
  + its test, `lib/types/sketchfab.d.ts`, the `gsap` dependency,
  `tests/e2e/cinema-scroll-scene.spec.ts`.
- Not in scope: the movie detail page, the showtimes page, or the booking
  flow itself — all already have working "Book — <time>" links from the
  prior sub-project and are unaffected by this change. `/about` is
  unaffected.

## Data

`getNowShowing()` (existing) returns bare `Movie[]`, with no showtime
information — the homepage needs each movie's showtimes to render inline
"Book" buttons. Add `getNowShowingWithShowtimes()` to `lib/db/queries.ts`:
one query joining `movies` and `showtimes` (mirroring the existing
`getAllShowtimes()` join pattern already in that file), grouped by movie,
returning `Array<Movie & { showtimes: Showtime[] }>`, ordered by movie
title with each movie's showtimes ordered by start time. A movie with zero
currently-scheduled showtimes still appears in the list (its card just has
no Book buttons) — the homepage's job is "what's playing," not "what's
bookable right now."

## Layout

Server-rendered, no client-side JavaScript needed at all — this is a
meaningful simplification over the previous design, which required a
`'use client'` component for the same reason a static page never does:
scroll-driven interactivity that no longer exists here. `app/page.tsx`
goes back to being a plain async Server Component (matching the pattern
already used by `/showtimes` and `/about`), fetching
`getNowShowingWithShowtimes()` and rendering the list directly — no new
client component file needed.

Top to bottom:

1. **Page heading**: `<h1>Now Showing at RetfenyMozi</h1>` — restoring the
   descriptive heading the 3D redesign had also (correctly) restored after
   an earlier regression, kept here as plain page content, not overlaid on
   anything.
2. **Movie list**: a vertical stack of cards, one per movie from
   `getNowShowingWithShowtimes()`. Each card:
   - Poster thumbnail on one side (existing `posterUrl` /
     `/placeholder-poster.svg` fallback pattern, reused as-is).
   - Title, linking to the movie's detail page (`/movies/[id]`) — the
     detail page remains where the full synopsis, cast, director, rating,
     and trailer link live; the card itself doesn't need to duplicate all
     of that.
   - IMDb rating badge (existing `.ratingBadge` visual treatment from the
     movie detail page, reused here), shown only when `imdbRating` is not
     null (existing null-handling convention).
   - A short synopsis excerpt (plain text, CSS `line-clamp` or similar to
     keep cards a predictable height — no truncation logic in the data
     layer, just a CSS clamp).
   - One "Book — <time>" button per showtime, using the exact same link
     target and label convention already established on the movie detail
     and showtimes pages (`/book/[showtimeId]`, `Book — {formatShowtime(...)}`).
     If a movie has no showtimes, this row is simply omitted for that card
     (no "no showtimes" placeholder text — the absence is self-explanatory).
3. **Empty state**: unchanged from the current behavior — "No movies are
   scheduled right now — check back soon." when `getNowShowingWithShowtimes()`
   returns an empty array.

## Color

RetfenyMozi's existing dark theme (`--color-bg: #0b0b0d`,
`--color-fg: #f2ede7`) stays as the base. The existing crimson accent
(`--color-accent: #b8272c`) stays as the base red — "make our main colour
red" is about *how much* red is used, not changing the hue: the Book
buttons, the rating badge, and card hover/focus states all use
`--color-accent` as a solid fill (not the current muted/translucent
treatment used for showtime chips elsewhere), so red reads as the page's
dominant, unmissable color rather than a subtle highlight. No new color
tokens — reusing `--color-accent`/`--color-accent-text` throughout keeps
this consistent with every other page's existing palette.

## Error Handling

Unchanged from the project's existing conventions: a movie with a missing
poster falls back to the existing placeholder SVG (already handled);
`imdbRating` being null hides the badge rather than showing "N/A" (existing
convention, already used on the movie detail page); the zero-movies empty
state is unchanged.

## Testing

- `getNowShowingWithShowtimes()` gets an integration test (real Postgres,
  matching this project's existing convention for every other query
  function) covering: a movie with multiple showtimes returns them ordered
  by start time; a movie with zero showtimes still appears with an empty
  showtimes array; movies are ordered by title.
- `tests/e2e/browse-movies.spec.ts`'s existing assertions (a heading with
  the movie's title is visible; clicking it navigates to the detail page)
  must keep passing against the new card markup — the title stays a real
  heading and a real link to `/movies/[id]`, unchanged in spirit from
  every homepage version this project has had so far.
- A new E2E assertion confirms a "Book — <time>" button is present on the
  homepage itself (not just on the detail/showtimes pages) and clicking it
  reaches `/book/[showtimeId]` — this is the one genuinely new piece of
  user-facing behavior this spec adds.

## Out of Scope

- Any change to the booking flow, database schema, or the movie
  detail/showtimes pages.
- Genre tags or content-rating badges (BBFC-style) — `Movie` has no such
  fields, and adding them (a schema change, plus sourcing that data from
  TMDB/OMDb) is a separate concern this spec doesn't take on.
- Any client-side interactivity, animation, or third-party embed.
- `/about` page.
