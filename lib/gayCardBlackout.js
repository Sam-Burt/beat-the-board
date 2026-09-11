// SERVER-ONLY. No passing (or self-reporting a catch) between 7pm and
// 10:30pm every day — dinner time is off limits. Checked in UK local time
// regardless of where the server itself happens to run (Vercel functions
// default to UTC), using Intl rather than pulling in a timezone library
// for one comparison.
const BLACKOUT_TZ = "Europe/London";
const START_MINUTES = 19 * 60; // 7:00pm
const END_MINUTES = 22 * 60 + 30; // 10:30pm

export function isGayCardBlackout(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BLACKOUT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= START_MINUTES && minutesSinceMidnight < END_MINUTES;
}

export const GAY_CARD_BLACKOUT_MESSAGE =
  "Gay Card's on a dinner break — try again after 10:30pm.";
