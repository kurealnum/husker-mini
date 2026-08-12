/**
 * Trims raw ESPN schedule data down to numeric/structural fields only,
 * before it goes to the LLM combiner.
 *
 * ESPN's raw responses carry far more than our `Espn*Response` TypeScript
 * types describe — those types only cover what this app's own code reads;
 * nothing strips the extra fields at runtime. A single team roster was
 * ~400KB (mostly `links`/`contracts`/`headshot`/career-history bloat), and
 * even after trimming to id/name/position/jersey/status/injuries it was
 * still ~95% of the combiner payload (94 players × several small text
 * fields each) — repeated 429s against OpenAI's tokens-per-minute limit
 * (100k/min) despite the roster itself being individually small once
 * trimmed. The roster (and injuries — also text, not numeric) are dropped
 * entirely for now; only schedule results (dates/scores/completion) go to
 * the combiner. Roster/injuries are still fetched and used for this app's
 * own computed features (player strength, availability) — just not
 * forwarded raw to the LLM.
 */
import { competitorScore } from "@/lib/espn";

/**
 * `team` objects (schedule competitor.team) carry `logos` (5-7 URL variants
 * × metadata) and `links` on top of the identity fields `redactTeamNames`
 * blanks — ~6KB each, repeated per competitor per game. Reduced to just
 * `id`, which is all this app's own team-strength logic needs to tell teams
 * apart.
 */
function trimTeam(team: unknown): Record<string, unknown> {
  const t = (team ?? {}) as { id?: string };
  return { id: t.id };
}

interface RawScheduleCompetitor {
  homeAway?: string;
  score?: string | { value: number; displayValue: string };
  team?: unknown;
}

interface RawScheduleEvent {
  date?: string;
  competitions?: Array<{
    status?: { type?: { completed?: boolean } };
    competitors?: RawScheduleCompetitor[];
  }>;
}

interface RawSchedule {
  events?: RawScheduleEvent[];
}

function trimScheduleEvent(event: RawScheduleEvent): Record<string, unknown> {
  const competition = event.competitions?.[0];
  return {
    date: event.date,
    completed: competition?.status?.type?.completed ?? false,
    competitors: (competition?.competitors ?? []).map((c) => ({
      homeAway: c.homeAway,
      score: c.score != null ? competitorScore(c.score) : null,
      team: trimTeam(c.team),
    })),
  };
}

function trimSchedule(schedule: unknown): Record<string, unknown> {
  const s = (schedule ?? {}) as RawSchedule;
  return {
    events: (s.events ?? []).map(trimScheduleEvent),
  };
}

/** Trims one team's raw ESPN bundle down to just its schedule. */
function trimRawTeamEspnData(raw: unknown): Record<string, unknown> {
  const r = (raw ?? {}) as { schedule?: unknown };
  return {
    schedule: trimSchedule(r.schedule),
  };
}

/** Trims the full `{ team1, team2 }` raw ESPN bundle sent to the combiner. */
export function trimRawEspnData(rawEspnData: Record<string, unknown>): Record<string, unknown> {
  return {
    team1: trimRawTeamEspnData(rawEspnData.team1),
    team2: trimRawTeamEspnData(rawEspnData.team2),
  };
}
