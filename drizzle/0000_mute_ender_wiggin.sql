CREATE TABLE "movies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tmdb_id" integer NOT NULL,
	"imdb_id" text,
	"title" text NOT NULL,
	"synopsis" text NOT NULL,
	"poster_url" text,
	"runtime" integer,
	"director" text,
	"actors" text[] DEFAULT '{}' NOT NULL,
	"imdb_rating" numeric(3, 1),
	"trailer_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "movies_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "showtimes" (
	"id" serial PRIMARY KEY NOT NULL,
	"movie_id" integer NOT NULL,
	"start_time" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE no action ON UPDATE no action;