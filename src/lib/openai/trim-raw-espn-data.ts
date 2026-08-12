/**
 * Trims raw ESPN roster/schedule payloads down to the fields actually useful
 * for a win-probability estimate, before they go to the LLM combiner.
 *
 * ESPN's raw responses carry far more than our `Espn*Response` TypeScript
 * types describe — those types only cover what this app's own code reads;
 * nothing strips the extra fields at runtime. A single team roster is
 * ~400KB, almost entirely `links` (player-card/stats/gamelog URL objects),
 * `contracts`, `headshot`, `alternateIds`, `guid`/`uid`, and career-history
 * fields. A schedule is similarly bloated with `venue` (address, zip) and a
 * `logos` array (5 URLs × metadata) repeated per team per game. Sending two
 * teams' worth of that blew past OpenAI's tokens-per-minute limit (429s on
 * 2026-08-12, ~1.46M tokens requested against a 100k/min cap) even after
 * dropping gamelogs/odds/transactions. This is the actual fix: keep the real
 * per-player/per-game facts, drop the rest.
 */
import { competitorScore } from "@/lib/espn";

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
    team: r.team,
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
      team: c.team,
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
