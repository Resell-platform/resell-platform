import type { AppState, ListingDraft, ListingStatus, ReservationStatus, User } from "./types";

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
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
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
