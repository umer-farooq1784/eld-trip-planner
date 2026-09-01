import type { Place, TripPlan, TripSummaryRow } from "./types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function describeStatus(status: number): string {
  if (status === 404) return "That trip could not be found. It may have been removed.";
  if (status === 429) return "Too many requests just now. Wait a moment and try again.";
  if (status >= 500)
    return "The planning service is temporarily unavailable. Please try again in a moment.";
  return "That request could not be completed. Check the details and try again.";
}

export class ApiError extends Error {
  readonly fields?: Record<string, unknown>;
  constructor(message: string, fields?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError(
      "Could not reach the planning service. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? describeStatus(response.status), body?.fields);
  }
  return response.json() as Promise<T>;
}

export interface PlaceField {
  query: string;
  lat?: number | null;
  lon?: number | null;
}

export interface PlanRequest {
  current: PlaceField;
  pickup: PlaceField;
  dropoff: PlaceField;
  cycle_used_hours: number;
  start_at?: string | null;
}

export const planTrip = (payload: PlanRequest) =>
  request<TripPlan>("/trips/", { method: "POST", body: JSON.stringify(payload) });

export const getTrip = (id: string) => request<TripPlan>(`/trips/${id}/`);

export const listTrips = () =>
  request<{ results: TripSummaryRow[] }>("/trips/").then((r) => r.results);

export const geocode = (query: string, signal?: AbortSignal) =>
  request<{ results: Place[] }>(
    `/geocode/?q=${encodeURIComponent(query)}`,
    { signal },
  ).then((r) => r.results);
