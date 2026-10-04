CREATE TABLE "coach_assessments" (
	"week_start" date PRIMARY KEY NOT NULL,
	"score_version" integer NOT NULL,
	"score" numeric,
	"ampel" text,
	"flags" jsonb,
	"metrics" jsonb,
	"text" text,
	"input_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_goals" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"metric" text,
	"baseline" numeric,
	"baseline_date" date,
	"target" numeric,
	"due" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_plans" (
	"week_start" date PRIMARY KEY NOT NULL,
	"split" jsonb,
	"sets_target" jsonb,
	"run_minutes_target" integer,
	"hard_sessions_target" integer,
	"source" text NOT NULL,
	"reason" text,
	"hevy_routine_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_weeks" (
	"week_start" date PRIMARY KEY NOT NULL,
	"run_km" numeric,
	"run_minutes" integer,
	"run_count" integer,
	"hard_sessions" integer,
	"z2_minutes" integer,
	"source" text,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hevy_exercise_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"primary_muscle_group" text,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hevy_measurements" (
	"date" date PRIMARY KEY NOT NULL,
	"weight_kg" numeric,
	"waist_cm" numeric,
	"chest_cm" numeric,
	"bicep_cm" numeric,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hevy_sets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workout_id" text NOT NULL,
	"exercise_index" integer NOT NULL,
	"set_index" integer NOT NULL,
	"template_id" text,
	"exercise_title" text,
	"set_type" text,
	"weight_kg" numeric,
	"reps" integer,
	"rpe" numeric
);
--> statement-breakpoint
CREATE TABLE "hevy_workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hevy_sets" ADD CONSTRAINT "hevy_sets_workout_id_hevy_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."hevy_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hevy_sets_uq" ON "hevy_sets" USING btree ("workout_id","exercise_index","set_index");--> statement-breakpoint
CREATE INDEX "hevy_sets_template_idx" ON "hevy_sets" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "hevy_workouts_start_idx" ON "hevy_workouts" USING btree ("start_time");