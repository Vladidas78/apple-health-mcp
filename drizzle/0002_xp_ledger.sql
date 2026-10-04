CREATE TABLE "coach_lift_baselines" (
	"lift_key" text PRIMARY KEY NOT NULL,
	"value" numeric NOT NULL,
	"day" date NOT NULL,
	"mode" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_xp_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"xp" integer NOT NULL,
	"week_start" date NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coach_xp_events_uq" ON "coach_xp_events" USING btree ("source","source_id","kind");--> statement-breakpoint
CREATE INDEX "coach_xp_events_week_idx" ON "coach_xp_events" USING btree ("week_start");