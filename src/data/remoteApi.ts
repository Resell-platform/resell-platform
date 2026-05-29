import type {
  AppState,
  ListingDraft,
  ListingStatus,
  Message,
  ModerationStatus,
  Notification,
  ReservationStatus,
  TrustBadge,
  User
} from "./types";

export type RemoteSession = {
  user: User | null;
};

export type RequestCodeResponse = {
  email: string;
  delivery: "development_response" | "email";
  verificationCode?: string;
};

export type AuthStateResponse = {
  user: User;
  state: AppState;
};

export type ExportArchive = {
  formatVersion: 2;
  exportedAt: string;
  architecture: {
    backend: string[];
    businessModels: string[];
    frontends: string[];
    adapters: string[];
  };
  user: User;
  trustBadges: TrustBadge[];
  moderationStatuses: ModerationStatus[];
  state: AppState;
};

export type RealtimeEvent =
  | {
      version: 1;
      type: "connected";
      userId: string;
      serverTime: string;
    }
  | {
      version: 1;
      type: "message.created";
      message: Message;
      notification?: Notification;
    }
  | {
      version: 1;
      type: "sync.required";
      reason?: string;
    };

export function buildRealtimeSocketUrl(location: Pick<Location, "protocol" | "host"> = window.location): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/api/realtime`;
}

export function connectRealtimeSocket(): WebSocket {
  return new WebSocket(buildRealtimeSocketUrl());
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function getApiErrorMessage(response: Response) {
  const body = await response.text().catch(() => "");
  const payload = parseJson<{ error?: string }>(body);
  if (payload?.error) return payload.error;

  const text = body.trim();
  if (text && !text.startsWith("<")) return text;

  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return "Service is temporarily unavailable. Try again in a few minutes.";
  }

  return `Request failed with ${response.status}`;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function fetchRemoteState(activeUserId: string): Promise<AppState> {
  return apiRequest<AppState>("/api/state");
}

export async function fetchRemoteSession(): Promise<RemoteSession> {
  return apiRequest<RemoteSession>("/api/me");
}

export async function requestRemoteEmailCode(email: string, displayName?: string): Promise<RequestCodeResponse> {
  return apiRequest<RequestCodeResponse>("/api/auth/request-code", {
    method: "POST",
    body: JSON.stringify({ email, displayName })
  });
}

export async function verifyRemoteEmailCode(
  email: string,
  code: string,
  displayName?: string
): Promise<AuthStateResponse> {
  return apiRequest<AuthStateResponse>("/api/auth/verify-code", {
    method: "POST",
    body: JSON.stringify({ email, code, displayName })
  });
}

export async function logoutRemoteSession(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function updateRemoteProfile(draft: {
  displayName: string;
  bio?: string;
  pickupArea?: string;
  phoneE164?: string;
}): Promise<AuthStateResponse> {
  return apiRequest<AuthStateResponse>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(draft)
  });
}

export async function createRemoteListing(draft: ListingDraft): Promise<AppState> {
  return apiRequest<AppState>("/api/listings", {
    method: "POST",
    body: JSON.stringify({ draft })
  });
}

export async function updateRemoteListing(listingId: string, draft: ListingDraft): Promise<AppState> {
  return apiRequest<AppState>(`/api/listings/${encodeURIComponent(listingId)}`, {
    method: "PATCH",
    body: JSON.stringify({ draft })
  });
}

export async function reserveRemoteListing(listingId: string): Promise<AppState> {
  return apiRequest<AppState>("/api/reservations", {
    method: "POST",
    body: JSON.stringify({ listingId })
  });
}

export async function updateRemoteListingStatus(
  listingId: string,
  status: Exclude<ListingStatus, "reserved">
): Promise<AppState> {
  return apiRequest<AppState>(`/api/listings/${encodeURIComponent(listingId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export async function sendRemoteMessage(reservationId: string, body: string): Promise<AppState> {
  return apiRequest<AppState>("/api/messages", {
    method: "POST",
    body: JSON.stringify({ reservationId, body })
  });
}

export async function updateRemoteReservationStatus(reservationId: string, status: ReservationStatus): Promise<AppState> {
  return apiRequest<AppState>(`/api/reservations/${encodeURIComponent(reservationId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}

export async function markRemoteNotificationsRead(): Promise<AppState> {
  return apiRequest<AppState>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function exportRemoteData(): Promise<ExportArchive> {
  return apiRequest<ExportArchive>("/api/export");
}
