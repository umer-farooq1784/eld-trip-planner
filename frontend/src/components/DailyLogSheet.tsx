import { forwardRef, useMemo } from "react";
import type { DayLog } from "../types";
import type { CarrierDetails } from "../lib/carrier";
import {
  GRID_BOTTOM,
  GRID_WIDTH,
  HOUR_LABELS,
  HOUR_WIDTH,
  ROWS_TOP,
  ROW_LABELS,
  SHEET,
  formatHours,
  xForMinute,
  yForRow,
} from "../lib/logSheet";

interface Props {
  day: DayLog;
  carrier: CarrierDetails;
  totalMilesToDate?: number;
}

const INK = "#111111";
const FAINT = "#9aa2b1";

/** A ruled blank the driver would have written on, with a caption beneath. */
function Field({
  x, y, width, label, value, size = 10,
}: {
  x: number; y: number; width: number; label: string; value?: string; size?: number;
}) {
  return (
    <g>
      {value ? (
        <text x={x + 3} y={y - 4} fontSize={size} fill={INK} fontFamily="var(--font-sans)">
          {value}
        </text>
      ) : null}
      <line x1={x} y1={y} x2={x + width} y2={y} stroke={INK} strokeWidth={0.8} />
      <text x={x + width / 2} y={y + 10} fontSize={6.5} fill={FAINT} textAnchor="middle"
        fontFamily="var(--font-sans)" letterSpacing="0.03em">
        {label}
      </text>
    </g>
  );
}

export const DailyLogSheet = forwardRef<SVGSVGElement, Props>(function DailyLogSheet(
  { day, carrier, totalMilesToDate },
  ref,
) {
  const [year, month, dayOfMonth] = day.date.split("-");

  /** One continuous polyline: horizontal runs, vertical connectors at changes. */
  const dutyLine = useMemo(() => {
    const points: string[] = [];
    for (const segment of day.segments) {
      const y = yForRow(segment.row);
      points.push(`${xForMinute(segment.start_minute)},${y}`);
      points.push(`${xForMinute(segment.end_minute)},${y}`);
    }
    return points.join(" ");
  }, [day.segments]);

  const ticks = useMemo(() => {
    const marks: { x: number; row: number; tall: boolean }[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      for (let quarter = 1; quarter < 4; quarter += 1) {
        const x = SHEET.gridLeft + (hour + quarter / 4) * HOUR_WIDTH;
        for (let row = 0; row < 4; row += 1) marks.push({ x, row, tall: quarter === 2 });
      }
    }
    return marks;
  }, []);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${SHEET.width} ${SHEET.height}`}
      className="w-full h-auto bg-white"
      role="img"
      aria-label={`Driver's daily log for ${day.date}, sheet ${day.sheet_number} of ${day.total_sheets}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={SHEET.width} height={SHEET.height} fill="#ffffff" />

      {/* ---------- masthead ---------- */}
      <text x={SHEET.pad} y={44} fontSize={26} fontWeight={700} fill={INK} fontFamily="var(--font-display)">
        Driver&rsquo;s Daily Log
      </text>
      <text x={SHEET.pad} y={60} fontSize={9} fill={INK} fontFamily="var(--font-sans)">
        (24 hours)
      </text>

      <g fontFamily="var(--font-mono)">
        <text x={352} y={40} fontSize={13} fill={INK} textAnchor="middle">{month}</text>
        <text x={412} y={40} fontSize={13} fill={INK} textAnchor="middle">{dayOfMonth}</text>
        <text x={478} y={40} fontSize={13} fill={INK} textAnchor="middle">{year}</text>
      </g>
      <line x1={324} y1={44} x2={380} y2={44} stroke={INK} strokeWidth={0.8} />
      <line x1={388} y1={44} x2={436} y2={44} stroke={INK} strokeWidth={0.8} />
      <line x1={444} y1={44} x2={512} y2={44} stroke={INK} strokeWidth={0.8} />
      <text x={352} y={54} fontSize={6.5} fill={FAINT} textAnchor="middle">(month)</text>
      <text x={412} y={54} fontSize={6.5} fill={FAINT} textAnchor="middle">(day)</text>
      <text x={478} y={54} fontSize={6.5} fill={FAINT} textAnchor="middle">(year)</text>
      <text x={382} y={44} fontSize={12} fill={INK} textAnchor="middle">/</text>
      <text x={440} y={44} fontSize={12} fill={INK} textAnchor="middle">/</text>

      <text x={SHEET.width - SHEET.pad} y={30} fontSize={7.5} fill={INK} textAnchor="end">
        Original &ndash; File at home terminal.
      </text>
      <text x={SHEET.width - SHEET.pad} y={42} fontSize={7.5} fill={INK} textAnchor="end">
        Duplicate &ndash; Driver retains in his/her possession for 8 days.
      </text>
      <text x={SHEET.width - SHEET.pad} y={58} fontSize={8} fill={FAINT} textAnchor="end"
        fontFamily="var(--font-mono)">
        Sheet {day.sheet_number} of {day.total_sheets}
      </text>

      {/* ---------- from / to ---------- */}
      <text x={SHEET.pad} y={92} fontSize={10} fontWeight={600} fill={INK}>From:</text>
      <Field x={72} y={92} width={330} label="" value={day.segments[0]?.location ?? ""} />
      <text x={430} y={92} fontSize={10} fontWeight={600} fill={INK}>To:</text>
      <Field x={464} y={92} width={330} label="" value={day.segments.at(-1)?.location ?? ""} />

      {/* ---------- mileage + carrier ---------- */}
      <rect x={SHEET.pad} y={116} width={152} height={38} fill="none" stroke={INK} strokeWidth={0.9} />
      <text x={SHEET.pad + 76} y={142} fontSize={15} fill={INK} textAnchor="middle"
        fontFamily="var(--font-mono)" fontWeight={500}>
        {Math.round(day.miles).toLocaleString()}
      </text>
      <text x={SHEET.pad + 76} y={165} fontSize={7} fill={FAINT} textAnchor="middle">
        Total Miles Driving Today
      </text>

      <rect x={190} y={116} width={152} height={38} fill="none" stroke={INK} strokeWidth={0.9} />
      <text x={266} y={142} fontSize={15} fill={INK} textAnchor="middle"
        fontFamily="var(--font-mono)" fontWeight={500}>
        {totalMilesToDate != null ? Math.round(totalMilesToDate).toLocaleString() : "—"}
      </text>
      <text x={266} y={165} fontSize={7} fill={FAINT} textAnchor="middle">Total Mileage Today</text>

      <Field x={392} y={134} width={402} label="Name of Carrier or Carriers" value={carrier.carrier} />
      <Field x={392} y={168} width={402} label="Main Office Address" value={carrier.office} />

      <rect x={SHEET.pad} y={186} width={316} height={34} fill="none" stroke={INK} strokeWidth={0.9} />
      <text x={SHEET.pad + 8} y={207} fontSize={9} fill={INK}>{carrier.truck}</text>
      <text x={SHEET.pad + 158} y={231} fontSize={7} fill={FAINT} textAnchor="middle">
        Truck/Tractor and Trailer Numbers or License Plate(s)/State (show each unit)
      </text>

      <Field x={392} y={210} width={402} label="Home Terminal Address" value={carrier.terminal} />

      {/* ---------- the graph grid ---------- */}
      <rect x={SHEET.gridLeft} y={SHEET.bandTop} width={GRID_WIDTH} height={SHEET.bandHeight} fill={INK} />
      {HOUR_LABELS.map((label, hour) => (
        <text
          key={`h-${hour}`}
          x={SHEET.gridLeft + hour * HOUR_WIDTH}
          y={SHEET.bandTop + 15}
          fontSize={label.length > 2 ? 5.6 : 7.4}
          fill="#ffffff"
          textAnchor="middle"
          fontFamily="var(--font-sans)"
          fontWeight={600}
        >
          {label}
        </text>
      ))}
      <text x={SHEET.gridRight + 46} y={SHEET.bandTop + 10} fontSize={7} fill={INK}
        textAnchor="middle" fontWeight={600}>Total</text>
      <text x={SHEET.gridRight + 46} y={SHEET.bandTop + 19} fontSize={7} fill={INK}
        textAnchor="middle" fontWeight={600}>Hours</text>

      {/* row bands */}
      {ROW_LABELS.map(([number, name], row) => {
        const top = ROWS_TOP + row * SHEET.rowHeight;
        return (
          <g key={name}>
            <rect x={SHEET.gridLeft} y={top} width={GRID_WIDTH} height={SHEET.rowHeight}
              fill={row % 2 ? "#fafbfc" : "#ffffff"} stroke={INK} strokeWidth={0.9} />
            <text x={SHEET.gridLeft - 6} y={top + SHEET.rowHeight / 2 + 1} fontSize={8}
              fill={INK} textAnchor="end" fontWeight={600}>{number}</text>
            <text x={SHEET.gridLeft - 6} y={top + SHEET.rowHeight / 2 + 10} fontSize={7}
              fill={INK} textAnchor="end">{name}</text>
            <rect x={SHEET.gridRight} y={top} width={92} height={SHEET.rowHeight}
              fill="none" stroke={INK} strokeWidth={0.9} />
            <text x={SHEET.gridRight + 46} y={top + SHEET.rowHeight / 2 + 4} fontSize={11}
              fill={INK} textAnchor="middle" fontFamily="var(--font-mono)" fontWeight={500}>
              {formatHours(day.totals[(["OFF", "SB", "D", "ON"] as const)[row]])}
            </text>
          </g>
        );
      })}

      {/* hour rules and quarter-hour ticks */}
      {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
        <line key={`r-${hour}`} x1={SHEET.gridLeft + hour * HOUR_WIDTH} y1={ROWS_TOP}
          x2={SHEET.gridLeft + hour * HOUR_WIDTH} y2={GRID_BOTTOM}
          stroke={INK} strokeWidth={0.55} />
      ))}
      {ticks.map(({ x, row, tall }, i) => {
        const top = ROWS_TOP + row * SHEET.rowHeight;
        return (
          <line key={`t-${i}`} x1={x} y1={top} x2={x} y2={top + (tall ? 11 : 6)}
            stroke={INK} strokeWidth={0.45} />
        );
      })}

      {/* the drawn duty line */}
      <polyline points={dutyLine} fill="none" stroke={INK} strokeWidth={2.4}
        strokeLinejoin="miter" strokeLinecap="butt" />

      <text x={SHEET.gridRight + 46} y={GRID_BOTTOM + 16} fontSize={11} fill={INK}
        textAnchor="middle" fontFamily="var(--font-mono)" fontWeight={600}>
        = {formatHours(day.total_hours)}
      </text>

      {/* ---------- remarks ---------- */}
      <text x={SHEET.pad} y={SHEET.remarksTop - 8} fontSize={11} fontWeight={700} fill={INK}
        fontFamily="var(--font-display)">Remarks</text>
      <rect x={SHEET.gridLeft} y={SHEET.remarksTop - 24} width={GRID_WIDTH}
        height={SHEET.remarksHeight} fill="none" stroke={INK} strokeWidth={0.9} />

      {day.remarks.map((remark, index) => {
        const x = xForMinute(remark.minute);
        return (
          <g key={`rm-${index}`}>
            <line x1={x} y1={SHEET.remarksTop - 24} x2={x} y2={SHEET.remarksTop - 12}
              stroke={INK} strokeWidth={0.7} />
            <text x={x} y={SHEET.remarksTop - 8} fontSize={7.4} fill={INK}
              transform={`rotate(-62 ${x} ${SHEET.remarksTop - 8})`}
              fontFamily="var(--font-sans)">
              {remark.location}
            </text>
          </g>
        );
      })}

      <text x={SHEET.width / 2} y={SHEET.remarksTop + SHEET.remarksHeight - 14} fontSize={7.5}
        fill={FAINT} textAnchor="middle">
        Enter name of place you reported and where released from work and when and where each change of duty status occurred.
      </text>
      <text x={SHEET.width / 2} y={SHEET.remarksTop + SHEET.remarksHeight - 2} fontSize={7.5}
        fill={FAINT} textAnchor="middle" fontWeight={600}>
        Use time standard of home terminal.
      </text>

      <g>
        <text x={SHEET.pad} y={SHEET.remarksTop + 24} fontSize={8} fontWeight={600} fill={INK}>
          Shipping Documents:
        </text>
        <Field x={SHEET.pad} y={SHEET.remarksTop + 56} width={80} label="DVL or Manifest No."
          value={carrier.manifest} size={8} />
        <Field x={SHEET.pad} y={SHEET.remarksTop + 92} width={80} label="Shipper &amp; Commodity"
          value={carrier.shipper} size={8} />
      </g>

      {/* ---------- recap ---------- */}
      <RecapBox day={day} />

      {/* ---------- certification ---------- */}
      <Field x={SHEET.pad} y={SHEET.height - 34} width={330}
        label="Driver's signature in full - I certify that these entries are true and correct"
        value={carrier.driver} />
      <Field x={400} y={SHEET.height - 34} width={200} label="Name of Co-Driver"
        value={carrier.coDriver} />
    </svg>
  );
});

function RecapBox({ day }: { day: DayLog }) {
  const top = SHEET.recapTop;
  const { recap } = day;

  const columns: [string, string[], string][] = [
    ["A.", ["Total hours on", "duty last 7 days", "including today."], recap.hours_last_7_days.toFixed(2)],
    ["B.", ["Total hours", "available tomorrow", "70 hr. minus A*"], recap.hours_available_tomorrow.toFixed(2)],
    ["C.", ["Total hours on", "duty last 8 days", "including today."], recap.hours_last_8_days.toFixed(2)],
  ];

  return (
    <g>
      <line x1={SHEET.pad} y1={top - 12} x2={SHEET.width - SHEET.pad} y2={top - 12}
        stroke={INK} strokeWidth={1.4} />

      <text x={SHEET.pad} y={top + 8} fontSize={8} fontWeight={700} fill={INK}>Recap:</text>
      <text x={SHEET.pad} y={top + 19} fontSize={7.5} fill={INK}>Complete at end of day</text>

      <text x={150} y={top + 8} fontSize={13} fill={INK} fontFamily="var(--font-mono)"
        fontWeight={600} textAnchor="middle">{recap.on_duty_today.toFixed(2)}</text>
      <line x1={110} y1={top + 12} x2={190} y2={top + 12} stroke={INK} strokeWidth={0.8} />
      {["On duty hours today,", "Total lines 3 & 4"].map((line, i) => (
        <text key={line} x={110} y={top + 24 + i * 10} fontSize={7} fill={FAINT}>{line}</text>
      ))}

      <text x={224} y={top + 8} fontSize={7.5} fontWeight={700} fill={INK}>70 Hour /</text>
      <text x={224} y={top + 18} fontSize={7.5} fontWeight={700} fill={INK}>8 Day Drivers</text>

      {columns.map(([letter, lines, value], index) => {
        const x = 306 + index * 132;
        return (
          <g key={letter}>
            <text x={x} y={top + 8} fontSize={8} fontWeight={700} fill={INK}>{letter}</text>
            <text x={x + 108} y={top + 8} fontSize={13} fill={INK} textAnchor="end"
              fontFamily="var(--font-mono)" fontWeight={600}>{value}</text>
            <line x1={x} y1={top + 12} x2={x + 108} y2={top + 12} stroke={INK} strokeWidth={0.8} />
            {lines.map((line, i) => (
              <text key={line} x={x} y={top + 24 + i * 10} fontSize={7} fill={FAINT}>{line}</text>
            ))}
          </g>
        );
      })}

      <text x={718} y={top + 8} fontSize={7.5} fontWeight={700} fill={FAINT}>60 Hour /</text>
      <text x={718} y={top + 18} fontSize={7.5} fontWeight={700} fill={FAINT}>7 Day Drivers</text>
      <text x={718} y={top + 34} fontSize={7} fill={FAINT}>Not applicable &mdash; this</text>
      <text x={718} y={top + 44} fontSize={7} fill={FAINT}>driver runs the 70/8 cycle.</text>

      <text x={846} y={top + 8} fontSize={7} fill={FAINT}>*If you took 34</text>
      {["consecutive hours off", "duty you have 60/70", "hours available"].map((line, i) => (
        <text key={line} x={846} y={top + 18 + i * 10} fontSize={7} fill={FAINT}>{line}</text>
      ))}

      <line x1={SHEET.pad} y1={top + 62} x2={SHEET.width - SHEET.pad} y2={top + 62}
        stroke={INK} strokeWidth={1.4} />
    </g>
  );
}
