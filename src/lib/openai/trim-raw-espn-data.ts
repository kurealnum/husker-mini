/**
 * Trims raw ESPN roster/schedule payloads down to the fields actually useful
 * for a win-probability estimate, before they go to the LLM combiner.
 *
 * ESPN's raw responses carry far more than our `Espn*Response` TypeScript
 * types describe — those types only cover what this app's own code reads;
 * nothing strips the extra fields at runtime. A single team roster is
 * ~400KB, almost entirely `links` (player-card/stats/gamelog URL objects),
 * `contracts`, `headshot`, `alternateIds`, `guid`/`uid`, and career-history
 * fields. A schedule is similarly bloated with `venue` (address, zip) and
 * each competitor's full `team` object (`logos`: 5-7 URL variants ×
 * metadata, plus `links`) repeated per team per game — ~6KB per team per
 * event on its own. Sending two teams' worth of that blew past OpenAI's
 * tokens-per-minute limit (429s on 2026-08-12, ~1.46M tokens requested
 * against a 100k/min cap) even after dropping gamelogs/odds/transactions,
 * and still did after a first trimming pass that kept `team` objects intact.
 * This keeps the real per-player/per-game facts, drops the rest.
 */
import { competitorScore } from "@/lib/espn";

/**
 * `team` objects (roster.team, schedule competitor.team) carry `logos`
 * (5-7 URL variants × metadata) and `links` on top of the identity fields
 * `redactTeamNames` blanks — ~6KB each, repeated per competitor per game.
 * Reduced to just `id`, which is all this app's own team-strength logic
 * needs to tell teams apart.
 */
function trimTeam(team: unknown): Record<string, unknown> {
  const t = (team ?? {}) as { id?: string };
  return { id: t.id };
}

interface RawAthlete {
  id?: string;
  fullName?: string;
  jersey?: string;
  position?: { abbreviation?: string };
  experience?: { years?: number };
  status?: { name?: string };
  injuries?: unknown[];
}

interface RawRoster {
  team?: unknown;
  athletes?: Array<{ position?: string; items?: RawAthlete[] }>;
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

function trimAthlete(athlete: RawAthlete): Record<string, unknown> {
  return {
    id: athlete.id,
    fullName: athlete.fullName,
    position: athlete.position?.abbreviation,
    jersey: athlete.jersey,
    experienceYears: athlete.experience?.years,
    status: athlete.status?.name,
    injuries: athlete.injuries ?? [],
  };
}

function trimRoster(roster: unknown): Record<string, unknown> {
  const r = (roster ?? {}) as RawRoster;
  return {
    team: trimTeam(r.team),
    athletes: (r.athletes ?? []).map((group) => ({
      position: group.position,
      items: (group.items ?? []).map(trimAthlete),
    })),
  };
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

/** Trims one team's raw ESPN bundle ({ roster, injuries, schedule }). */
function trimRawTeamEspnData(raw: unknown): Record<string, unknown> {
  const r = (raw ?? {}) as { roster?: unknown; injuries?: unknown; schedule?: unknown };
  return {
    roster: trimRoster(r.roster),
    injuries: r.injuries ?? { items: [] },
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
