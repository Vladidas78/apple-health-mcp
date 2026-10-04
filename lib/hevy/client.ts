// Thin HEVY API client. Read-only by design: the server never writes to HEVY.
// Auth is the `api-key` header (HEVY app → Settings → Developer).
//
// [ANNAHME] Endpoint paths and response shapes are derived from the HEVY MCP tool
// schemas and the public API docs (api.hevyapp.com/docs); none of them is verified
// against the live API from this repo. Every raw object is stored in `raw`, so a
// wrong field mapping loses nothing and can be fixed by re-syncing.

export const HEVY_BASE_URL = "https://api.hevyapp.com/v1";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HevySet = {
  index?: number;
  type?: string; // normal | warmup | dropset | failure
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  [k: string]: unknown;
};

export type HevyExercise = {
  index?: number;
  title?: string;
  exercise_template_id?: string;
  sets?: HevySet[];
  [k: string]: unknown;
};

export type HevyWorkout = {
  id: string;
  title?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  exercises?: HevyExercise[];
  [k: string]: unknown;
};

export type HevyWorkoutEvent =
  | { type: "updated"; workout: HevyWorkout }
  | { type: "deleted"; id: string; deleted_at?: string };

export type HevyExerciseTemplate = {
  id: string;
  title?: string;
  primary_muscle_group?: string | null;
  [k: string]: unknown;
};

export type HevyBodyMeasurement = {
  id?: string;
  date: string; // "YYYY-MM-DD" or ISO datetime
  weight_kg?: number | null;
  [k: string]: unknown;
};

type Page<K extends string, T> = { page: number; page_count: number } & Record<K, T[]>;

export class HevyApiError extends Error {
  constructor(public readonly status: number, public readonly path: string, body: string) {
    super(`HEVY ${path} → ${status}: ${body.slice(0, 200)}`);
  }
}

export class HevyClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike,
    private readonly baseUrl: string = HEVY_BASE_URL,
  ) {}

  private async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: { "api-key": this.apiKey, accept: "application/json" },
    });
    if (!res.ok) throw new HevyApiError(res.status, path, await res.text().catch(() => ""));
    return (await res.json()) as T;
  }

  // GET /workouts — paginated, pageSize max 10. Order is not guaranteed to follow
  // start_time, so callers page through everything and filter themselves.
  listWorkouts(page: number, pageSize = 10) {
    return this.get<Page<"workouts", HevyWorkout>>("/workouts", { page, pageSize });
  }

  // GET /workouts/events?since=ISO — update/delete feed for incremental sync.
  listWorkoutEvents(since: string, page: number, pageSize = 10) {
    return this.get<Page<"events", HevyWorkoutEvent>>("/workouts/events", { page, pageSize, since });
  }

  // GET /exercise_templates — pageSize max 100.
  listExerciseTemplates(page: number, pageSize = 100) {
    return this.get<Page<"exercise_templates", HevyExerciseTemplate>>("/exercise_templates", { page, pageSize });
  }

  // GET /body_measurements — [ANNAHME, zu verifizieren] path, pagination and the
  // key of the array (`body_measurements` or `measurements`) are not confirmed.
  listBodyMeasurements(page: number, pageSize = 10) {
    return this.get<Partial<Page<"body_measurements", HevyBodyMeasurement>> & { measurements?: HevyBodyMeasurement[] }>(
      "/body_measurements",
      { page, pageSize },
    );
  }
}
