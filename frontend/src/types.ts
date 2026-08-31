export type Duty = "OFF" | "SB" | "D" | "ON";

export type StopKind =
  | "start" | "pickup" | "dropoff"
  | "fuel" | "break" | "rest" | "restart";

export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export interface Segment {
  duty: Duty;
  row: number;
  start_minute: number;
  end_minute: number;
  activity: string;
  location: string;
  kind: StopKind | null;
}

export interface Remark {
  minute: number;
  location: string;
  activity: string;
  duty: Duty;
}

export interface Recap {
  on_duty_today: number;
  hours_last_7_days: number;
  hours_available_tomorrow: number;
  hours_last_8_days: number;
}

export interface DayLog {
  date: string;
  sheet_number: number;
  total_sheets: number;
  miles: number;
  totals: Record<Duty, number>;
  total_hours: number;
  segments: Segment[];
  remarks: Remark[];
  recap: Recap;
}

export interface Stop {
  order: number;
  kind: StopKind;
  label: string;
  activity: string;
  arrive_at: string;
  depart_at: string;
  duration_hours: number;
  trip_miles: number;
  lat?: number | null;
  lon?: number | null;
}

export interface RouteLeg {
  origin: Place;
  destination: Place;
  distance_miles: number;
  duration_hours: number;
  avg_speed_mph: number;
}

export interface TripPlan {
  id: string | null;
  created_at: string | null;
  inputs: {
    current: Place;
    pickup: Place;
    dropoff: Place;
    cycle_used_hours: number;
    start_at: string;
  };
  route: {
    geometry: [number, number][];
    legs: RouteLeg[];
    is_estimated: boolean;
  };
  summary: {
    total_miles: number;
    total_drive_hours: number;
    total_on_duty_hours: number;
    elapsed_hours: number;
    start_at: string;
    end_at: string;
    sheets: number;
    cycle_hours_at_start: number;
    cycle_hours_at_end: number;
    cycle_hours_remaining: number;
    rest_stops: number;
    fuel_stops: number;
    breaks: number;
    restarts: number;
  };
  stops: Stop[];
  days: DayLog[];
}

export interface TripSummaryRow {
  id: string;
  created_at: string;
  start_at: string;
  end_at: string;
  current_label: string;
  pickup_label: string;
  dropoff_label: string;
  cycle_used_hours: number;
  total_miles: number;
  total_drive_hours: number;
  sheets: number;
}

export const DUTY_LABEL: Record<Duty, string> = {
  OFF: "Off Duty",
  SB: "Sleeper Berth",
  D: "Driving",
  ON: "On Duty (not driving)",
};

export const DUTY_COLOR: Record<Duty, string> = {
  OFF: "var(--color-duty-off)",
  SB: "var(--color-duty-sb)",
  D: "var(--color-duty-d)",
  ON: "var(--color-duty-on)",
};

export const STOP_LABEL: Record<StopKind, string> = {
  start: "Start",
  pickup: "Pickup",
  dropoff: "Dropoff",
  fuel: "Fuel",
  break: "30-min break",
  rest: "10-hour rest",
  restart: "34-hour restart",
};
