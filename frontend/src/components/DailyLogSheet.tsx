import { forwardRef, useMemo } from "react";
import type { DayLog } from "../types";
import type { CarrierDetails } from "../lib/carrier";
import {
  DUTY_ORDER,
  GRID_BOTTOM,
  GRID_WIDTH,
  HOUR_LABELS,
  HOUR_WIDTH,
  ROWS_TOP,
  ROW_LABELS,
  SHEET,
  TOTALS_WIDTH,
  TYPE,
  formatHours,
  layOutRemarks,
  xForMinute,
  yForRow,
} from "../lib/logSheet";

interface Props {
  day: DayLog;
  carrier: CarrierDetails;
  totalMilesToDate?: number;
}

const INK = "#111111";
const FAINT = "#7c8598";
const SANS = "var(--font-sans)";
const MONO = "var(--font-mono)";

const REMARK_BASELINE = SHEET.remarksTop + SHEET.remarksHeight - 44;
const TOTALS_MID = SHEET.gridRight + TOTALS_WIDTH / 2;

function Field({
  x, y, width, label, value, size = TYPE.fieldValue,
}: {
  x: number; y: number; width: number; label: string; value?: string; size?: number;
}) {
  return (
    <g>
      {value ? (
        <text x={x + 4} y={y - 5} fontSize={size} fill={INK} fontFamily={SANS}>
          {value}
        </text>
      ) : null}
      <line x1={x} y1={y} x2={x + width} y2={y} stroke={INK} strokeWidth={0.9} />
      <text x={x + width / 2} y={y + TYPE.caption + 2} fontSize={TYPE.caption} fill={FAINT}
        textAnchor="middle" fontFamily={SANS}>
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

  const dutyLine = useMemo(() => {
    const points: string[] = [];
    for (const segment of day.segments) {
      const y = yForRow(segment.row);
      points.push(`${xForMinute(segment.start_minute)},${y}`);
      points.push(`${xForMinute(segment.end_minute)},${y}`);
    }
    return points.join(" ");
  }, [day.segments]);

  const remarkLabels = useMemo(() => layOutRemarks(day.remarks), [day.remarks]);

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
      className="h-auto w-full bg-white"
      role="img"
      aria-label={`Driver's daily log for ${day.date}, sheet ${day.sheet_number} of ${day.total_sheets}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={SHEET.width} height={SHEET.height} fill="#ffffff" />

      <text x={SHEET.pad} y={46} fontSize={TYPE.title} fontWeight={700} fill={INK}
        fontFamily="var(--font-display)">Driver&rsquo;s Daily Log</text>
      <text x={SHEET.pad} y={64} fontSize={TYPE.subtitle} fill={FAINT} fontFamily={SANS}>
        (24 hours)
      </text>

      <g fontFamily={MONO} fontWeight={500}>
        <text x={362} y={46} fontSize={TYPE.dateValue} fill={INK} textAnchor="middle">{month}</text>
        <text x={432} y={46} fontSize={TYPE.dateValue} fill={INK} textAnchor="middle">{dayOfMonth}</text>
        <text x={512} y={46} fontSize={TYPE.dateValue} fill={INK} textAnchor="middle">{year}</text>
      </g>
      <line x1={330} y1={51} x2={394} y2={51} stroke={INK} strokeWidth={0.9} />
      <line x1={404} y1={51} x2={460} y2={51} stroke={INK} strokeWidth={0.9} />
      <line x1={470} y1={51} x2={554} y2={51} stroke={INK} strokeWidth={0.9} />
      <text x={399} y={46} fontSize={TYPE.dateValue} fill={INK} textAnchor="middle">/</text>
      <text x={465} y={46} fontSize={TYPE.dateValue} fill={INK} textAnchor="middle">/</text>
      <text x={362} y={64} fontSize={TYPE.caption} fill={FAINT} textAnchor="middle" fontFamily={SANS}>(month)</text>
      <text x={432} y={64} fontSize={TYPE.caption} fill={FAINT} textAnchor="middle" fontFamily={SANS}>(day)</text>
      <text x={512} y={64} fontSize={TYPE.caption} fill={FAINT} textAnchor="middle" fontFamily={SANS}>(year)</text>

      <text x={SHEET.width - SHEET.pad} y={34} fontSize={TYPE.legalNote} fill={INK}
        textAnchor="end" fontFamily={SANS}>Original &ndash; File at home terminal.</text>
      <text x={SHEET.width - SHEET.pad} y={48} fontSize={TYPE.legalNote} fill={INK}
        textAnchor="end" fontFamily={SANS}>Duplicate &ndash; Driver retains in his/her possession for 8 days.</text>
      <text x={SHEET.width - SHEET.pad} y={66} fontSize={TYPE.caption} fill={FAINT}
        textAnchor="end" fontFamily={MONO}>Sheet {day.sheet_number} of {day.total_sheets}</text>

      <text x={SHEET.pad} y={104} fontSize={TYPE.fieldValue} fontWeight={600} fill={INK}
        fontFamily={SANS}>From:</text>
      <Field x={82} y={104} width={330} label="" value={day.segments[0]?.location ?? ""} />
      <text x={444} y={104} fontSize={TYPE.fieldValue} fontWeight={600} fill={INK}
        fontFamily={SANS}>To:</text>
      <Field x={482} y={104} width={292} label="" value={day.segments.at(-1)?.location ?? ""} />

      <rect x={SHEET.pad} y={126} width={168} height={40} fill="none" stroke={INK} strokeWidth={1} />
      <text x={SHEET.pad + 84} y={154} fontSize={TYPE.mileage} fill={INK} textAnchor="middle"
        fontFamily={MONO} fontWeight={500}>{Math.round(day.miles).toLocaleString()}</text>
      <text x={SHEET.pad + 84} y={180} fontSize={TYPE.caption} fill={FAINT} textAnchor="middle"
        fontFamily={SANS}>Total Miles Driving Today</text>

      <rect x={210} y={126} width={168} height={40} fill="none" stroke={INK} strokeWidth={1} />
      <text x={294} y={154} fontSize={TYPE.mileage} fill={INK} textAnchor="middle"
        fontFamily={MONO} fontWeight={500}>
        {totalMilesToDate != null ? Math.round(totalMilesToDate).toLocaleString() : "—"}
      </text>
      <text x={294} y={180} fontSize={TYPE.caption} fill={FAINT} textAnchor="middle"
        fontFamily={SANS}>Total Mileage Today</text>

      <Field x={430} y={140} width={344} label="Name of Carrier or Carriers" value={carrier.carrier} />
      <Field x={430} y={182} width={344} label="Main Office Address" value={carrier.office} />

      <rect x={SHEET.pad} y={198} width={352} height={34} fill="none" stroke={INK} strokeWidth={1} />
      <text x={SHEET.pad + 10} y={221} fontSize={TYPE.fieldValue} fill={INK} fontFamily={SANS}>
        {carrier.truck}
      </text>
      <text x={SHEET.pad + 176} y={245} fontSize={TYPE.caption} fill={FAINT} textAnchor="middle"
        fontFamily={SANS}>Truck/Tractor and Trailer Numbers or License Plate(s)/State</text>

      <Field x={430} y={224} width={344} label="Home Terminal Address" value={carrier.terminal} />

      <rect x={SHEET.gridLeft} y={SHEET.bandTop} width={GRID_WIDTH} height={SHEET.bandHeight} fill={INK} />
      {HOUR_LABELS.map((lines, hour) => {
        const isFirst = hour === 0;
        const isLast = hour === 24;
        const stacked = lines.length > 1;
        const size = lines[0].length > 2 ? TYPE.hourWide : TYPE.hour;
        const firstBaseline = stacked ? SHEET.bandTop + 13 : SHEET.bandTop + 20;
        return lines.map((line, index) => (
          <text
            key={`h-${hour}-${index}`}
            x={SHEET.gridLeft + hour * HOUR_WIDTH + (isFirst ? 3 : isLast ? -3 : 0)}
            y={firstBaseline + index * 11}
            fontSize={size}
            fill="#ffffff"
            textAnchor={isFirst ? "start" : isLast ? "end" : "middle"}
            fontFamily={SANS}
            fontWeight={600}
          >
            {line}
          </text>
        ));
      })}
      <text x={TOTALS_MID} y={SHEET.bandTop + 13} fontSize={TYPE.caption} fill={INK}
        textAnchor="middle" fontWeight={600} fontFamily={SANS}>Total</text>
      <text x={TOTALS_MID} y={SHEET.bandTop + 25} fontSize={TYPE.caption} fill={INK}
        textAnchor="middle" fontWeight={600} fontFamily={SANS}>Hours</text>

      {ROW_LABELS.map(([number, name], row) => {
        const top = ROWS_TOP + row * SHEET.rowHeight;
        return (
          <g key={name}>
            <rect x={SHEET.gridLeft} y={top} width={GRID_WIDTH} height={SHEET.rowHeight}
              fill={row % 2 ? "#fafbfc" : "#ffffff"} stroke={INK} strokeWidth={1} />
            <text x={SHEET.gridLeft - 7} y={top + 15} fontSize={TYPE.rowNumber} fill={INK}
              textAnchor="end" fontWeight={700} fontFamily={SANS}>{number}</text>
            <text x={SHEET.gridLeft - 7} y={top + 27} fontSize={TYPE.rowLabel} fill={INK}
              textAnchor="end" fontFamily={SANS}>{name}</text>
            <rect x={SHEET.gridRight} y={top} width={TOTALS_WIDTH} height={SHEET.rowHeight}
              fill="none" stroke={INK} strokeWidth={1} />
            <text x={TOTALS_MID} y={top + SHEET.rowHeight / 2 + 5} fontSize={TYPE.total}
              fill={INK} textAnchor="middle" fontFamily={MONO} fontWeight={500}>
              {formatHours(day.totals[DUTY_ORDER[row]])}
            </text>
          </g>
        );
      })}

      {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
        <line key={`r-${hour}`} x1={SHEET.gridLeft + hour * HOUR_WIDTH} y1={ROWS_TOP}
          x2={SHEET.gridLeft + hour * HOUR_WIDTH} y2={GRID_BOTTOM}
          stroke={INK} strokeWidth={0.6} />
      ))}
      {ticks.map(({ x, row, tall }, i) => {
        const top = ROWS_TOP + row * SHEET.rowHeight;
        return (
          <line key={`t-${i}`} x1={x} y1={top} x2={x} y2={top + (tall ? 13 : 7)}
            stroke={INK} strokeWidth={0.5} />
        );
      })}

      <polyline points={dutyLine} fill="none" stroke={INK} strokeWidth={2.8}
        strokeLinejoin="miter" strokeLinecap="butt" />

      <text x={TOTALS_MID} y={GRID_BOTTOM + 19} fontSize={TYPE.total} fill={INK}
        textAnchor="middle" fontFamily={MONO} fontWeight={700}>
        = {formatHours(day.total_hours)}
      </text>

      <text x={SHEET.pad} y={SHEET.remarksTop + 14} fontSize={13} fontWeight={700} fill={INK}
        fontFamily="var(--font-display)">Remarks</text>
      <rect x={SHEET.gridLeft} y={SHEET.remarksTop} width={GRID_WIDTH}
        height={SHEET.remarksHeight} fill="none" stroke={INK} strokeWidth={1} />

      {remarkLabels.map((label, index) => (
        <g key={`rm-${index}`}>
          <line x1={label.tickX} y1={GRID_BOTTOM} x2={label.labelX} y2={SHEET.remarksTop + 8}
            stroke={INK} strokeWidth={0.6} />
          <text x={label.labelX} y={REMARK_BASELINE} fontSize={TYPE.remark} fill={INK}
            transform={`rotate(-90 ${label.labelX} ${REMARK_BASELINE})`} fontFamily={SANS}>
            {label.text}
          </text>
        </g>
      ))}

      <text x={SHEET.gridLeft + GRID_WIDTH / 2} y={SHEET.remarksTop + SHEET.remarksHeight - 22}
        fontSize={TYPE.caption} fill={FAINT} textAnchor="middle" fontFamily={SANS}>
        Enter name of place you reported and where released from work and when and where each change of duty status occurred.
      </text>
      <text x={SHEET.gridLeft + GRID_WIDTH / 2} y={SHEET.remarksTop + SHEET.remarksHeight - 8}
        fontSize={TYPE.caption} fill={FAINT} textAnchor="middle" fontWeight={600} fontFamily={SANS}>
        Use time standard of home terminal.
      </text>

      <text x={SHEET.pad} y={SHEET.remarksTop + 42} fontSize={TYPE.fieldValue} fontWeight={600}
        fill={INK} fontFamily={SANS}>Shipping</text>
      <text x={SHEET.pad} y={SHEET.remarksTop + 56} fontSize={TYPE.fieldValue} fontWeight={600}
        fill={INK} fontFamily={SANS}>Documents:</text>
      <Field x={SHEET.pad} y={SHEET.remarksTop + 96} width={96} label="DVL or Manifest No."
        value={carrier.manifest} />
      <Field x={SHEET.pad} y={SHEET.remarksTop + 142} width={96} label="Shipper &amp; Commodity"
        value={carrier.shipper} />

      <RecapBox day={day} />

      <Field x={SHEET.pad} y={SHEET.height - 30} width={360}
        label="Driver's signature in full - I certify that these entries are true and correct"
        value={carrier.driver} />
      <Field x={470} y={SHEET.height - 30} width={220} label="Name of Co-Driver"
        value={carrier.coDriver} />
    </svg>
  );
});

function RecapBox({ day }: { day: DayLog }) {
  const top = SHEET.recapTop;
  const { recap } = day;

  const columns: [string, string[], string][] = [
    ["A.", ["Total hours on duty", "last 7 days", "including today."], recap.hours_last_7_days.toFixed(2)],
    ["B.", ["Total hours available", "tomorrow", "70 hr. minus A*"], recap.hours_available_tomorrow.toFixed(2)],
    ["C.", ["Total hours on duty", "last 8 days", "including today."], recap.hours_last_8_days.toFixed(2)],
  ];

  return (
    <g fontFamily={SANS}>
      <line x1={SHEET.pad} y1={top - 14} x2={SHEET.width - SHEET.pad} y2={top - 14}
        stroke={INK} strokeWidth={1.6} />

      <text x={SHEET.pad} y={top + 10} fontSize={TYPE.recapHead} fontWeight={700} fill={INK}>Recap:</text>
      <text x={SHEET.pad} y={top + 23} fontSize={TYPE.recapLabel} fill={INK}>Complete at end of day</text>

      <text x={190} y={top + 12} fontSize={TYPE.recapValue} fill={INK} fontFamily={MONO}
        fontWeight={600} textAnchor="middle">{recap.on_duty_today.toFixed(2)}</text>
      <line x1={150} y1={top + 17} x2={230} y2={top + 17} stroke={INK} strokeWidth={0.9} />
      {["On duty hours", "today, lines 3 & 4"].map((line, i) => (
        <text key={line} x={150} y={top + 30 + i * 13} fontSize={TYPE.recapLabel} fill={FAINT}>{line}</text>
      ))}

      <text x={248} y={top + 10} fontSize={TYPE.recapHead} fontWeight={700} fill={INK}>70 Hour /</text>
      <text x={248} y={top + 23} fontSize={TYPE.recapHead} fontWeight={700} fill={INK}>8 Day Drivers</text>

      {columns.map(([letter, lines, value], index) => {
        const x = 330 + index * 142;
        return (
          <g key={letter}>
            <text x={x} y={top + 12} fontSize={TYPE.recapHead} fontWeight={700} fill={INK}>{letter}</text>
            <text x={x + 124} y={top + 12} fontSize={TYPE.recapValue} fill={INK} textAnchor="end"
              fontFamily={MONO} fontWeight={600}>{value}</text>
            <line x1={x} y1={top + 17} x2={x + 124} y2={top + 17} stroke={INK} strokeWidth={0.9} />
            {lines.map((line, i) => (
              <text key={line} x={x} y={top + 30 + i * 13} fontSize={TYPE.recapLabel} fill={FAINT}>{line}</text>
            ))}
          </g>
        );
      })}

      <text x={760} y={top + 10} fontSize={TYPE.recapHead} fontWeight={700} fill={FAINT}>60 Hour /</text>
      <text x={760} y={top + 23} fontSize={TYPE.recapHead} fontWeight={700} fill={FAINT}>7 Day Drivers</text>
      <text x={760} y={top + 43} fontSize={TYPE.recapLabel} fill={FAINT}>Not applicable:</text>
      <text x={760} y={top + 56} fontSize={TYPE.recapLabel} fill={FAINT}>runs the 70/8 cycle.</text>

      <text x={874} y={top + 10} fontSize={TYPE.recapLabel} fill={FAINT}>*If you took 34</text>
      {["consecutive hours", "off duty you have", "60/70 available"].map((line, i) => (
        <text key={line} x={874} y={top + 23 + i * 13} fontSize={TYPE.recapLabel} fill={FAINT}>{line}</text>
      ))}

      <line x1={SHEET.pad} y1={top + 76} x2={SHEET.width - SHEET.pad} y2={top + 76}
        stroke={INK} strokeWidth={1.6} />
    </g>
  );
}
