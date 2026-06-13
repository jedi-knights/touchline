CREATE TABLE IF NOT EXISTS "match_lineup_players" (
	"match_id" text NOT NULL,
	"player_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_lineup_players_match_id_player_id_pk" PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_lineup_players" ADD CONSTRAINT "match_lineup_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_lineup_players" ADD CONSTRAINT "match_lineup_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
