/** Geometry for the DOT log sheet. One place to change if the form moves. */

export const SHEET = {
  width: 1000,
  height: 940,
  pad: 26,

  gridLeft: 118,
  gridRight: 902,
  bandTop: 292,
  bandHeight: 24,
  rowHeight: 30,

  remarksTop: 470,
  remarksHeight: 150,
  recapTop: 700,
} as const;

export const GRID_WIDTH = SHEET.gridRight - SHEET.gridLeft;
export const HOUR_WIDTH = GRID_WIDTH / 24;
export const ROWS_TOP = SHEET.bandTop + SHEET.bandHeight;
export const GRID_BOTTOM = ROWS_TOP + SHEET.rowHeight * 4;

/** Minute of the day to an x coordinate on the grid. */
export const xForMinute = (minute: number) =>
  SHEET.gridLeft + (Math.min(1440, Math.max(0, minute)) / 1440) * GRID_WIDTH;

/** Centre line of a duty row, top to bottom: Off, Sleeper, Driving, On Duty. */
export const yForRow = (row: number) => ROWS_TOP + row * SHEET.rowHeight + SHEET.rowHeight / 2;

/** The hour captions printed in the black band. */
export const HOUR_LABELS = Array.from({ length: 25 }, (_, hour) => {
  if (hour === 0 || hour === 24) return "Mid-night";
  if (hour === 12) return "Noon";
  return String(hour > 12 ? hour - 12 : hour);
});

export const ROW_LABELS = [
  ["1.", "Off Duty"],
  ["2.", "Sleeper Berth"],
  ["3.", "Driving"],
  ["4.", "On Duty (not driving)"],
] as const;

export const formatHours = (value: number) => {
  const total = Math.round(value * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export const formatClock = (minute: number) => {
  const m = Math.round(minute);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
