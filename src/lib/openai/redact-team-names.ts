/**
 * Deep-clones a raw ESPN payload and blanks every team's identifying strings
 * (`displayName`, `shortDisplayName`, `abbreviation`, `location`, `name`)
 * wherever a `team` object appears (`EspnCompetitor.team`,
 * `EspnRosterResponse.team`, `EspnStandingsEntry.team`, etc.), so the LLM
 * combiner sees real stats/injuries/odds without knowing which team is which.
 * `team.id` is left intact — it's an opaque identifier, not a name.
 */
const TEAM_IDENTITY_FIELDS = ["displayName", "shortDisplayName", "abbreviation", "location", "name"] as const;

function redactTeamObject(team: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...team };
  for (const field of TEAM_IDENTITY_FIELDS) {
    if (field in redacted) {
      redacted[field] = "[redacted]";
    }
  }
  return redacted;
}

export function redactTeamNames(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactTeamNames);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
    if (key === "team" && val !== null && typeof val === "object" && !Array.isArray(val)) {
      return [key, redactTeamObject(val as Record<string, unknown>)] as const;
    }
    return [key, redactTeamNames(val)] as const;
  });

  return Object.fromEntries(entries);
}
