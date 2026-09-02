/** Geometry for the DOT log sheet. */

export const SHEET = {
  width: 1000,
  height: 792,
  pad: 26,

  gridLeft: 132,
  gridRight: 894,
  bandTop: 258,
  bandHeight: 30,
  rowHeight: 34,

  remarksTop: 448,
  remarksHeight: 170,
  recapTop: 650,
} as const;

/** Sizes in viewBox units. The sheet is 1000 wide, so these read as px at full width. */
export const TYPE = {
  title: 27,
  subtitle: 10,
  dateValue: 16,
  mileage: 18,
  fieldValue: 12,
  caption: 9,
  legalNote: 9,
  hour: 9.5,
  hourWide: 8.8,
  rowNumber: 10,
  rowLabel: 9,
  total: 13.5,
  remark: 9,
  recapHead: 9.5,
  recapLabel: 9,
  recapValue: 15,
} as const;

export const GRID_WIDTH = SHEET.gridRight - SHEET.gridLeft;
export const HOUR_WIDTH = GRID_WIDTH / 24;
export const ROWS_TOP = SHEET.bandTop + SHEET.bandHeight;
export const GRID_BOTTOM = ROWS_TOP + SHEET.rowHeight * 4;
export const TOTALS_WIDTH = SHEET.width - SHEET.gridRight - SHEET.pad;

export const xForMinute = (minute: number) =>
  SHEET.gridLeft + (Math.min(1440, Math.max(0, minute)) / 1440) * GRID_WIDTH;

export const yForRow = (row: number) => ROWS_TOP + row * SHEET.rowHeight + SHEET.rowHeight / 2;

/** Midnight is stacked on two lines, as it is on the printed form. */
export const HOUR_LABELS: string[][] = Array.from({ length: 25 }, (_, hour) => {
  if (hour === 0 || hour === 24) return ["Mid-", "night"];
  if (hour === 12) return ["Noon"];
  return [String(hour > 12 ? hour - 12 : hour)];
});

export const ROW_LABELS = [
  ["1.", "Off Duty"],
  ["2.", "Sleeper Berth"],
  ["3.", "Driving"],
  ["4.", "On Duty (not driving)"],
] as const;

export const DUTY_ORDER = ["OFF", "SB", "D", "ON"] as const;

export const formatHours = (value: number) => {
  const total = Math.round(value * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const REMARK_MIN_GAP = 12;

export interface RemarkLabel {
  tickX: number;
  labelX: number;
  text: string;
}

/**
 * Lay out the location captions written under the grid. [Guide p.17]
 *
 * A place is written once, as on a hand-filled form, and captions that would
 * still collide slide right with a leader line back to the true tick.
 */
export function layOutRemarks(
  remarks: { minute: number; location: string }[],
): RemarkLabel[] {
  const labels: RemarkLabel[] = [];
  let previous = "";

  for (const remark of remarks) {
    if (remark.location === previous) continue;
    previous = remark.location;
    const tickX = xForMinute(remark.minute);
    const last = labels.at(-1);
    const labelX =
      last && tickX - last.labelX < REMARK_MIN_GAP ? last.labelX + REMARK_MIN_GAP : tickX;
    labels.push({ tickX, labelX, text: remark.location });
  }

  const overflow = (labels.at(-1)?.labelX ?? 0) - SHEET.gridRight;
  if (overflow > 0) {
    for (const label of labels) label.labelX -= overflow;
  }
  return labels;
}
