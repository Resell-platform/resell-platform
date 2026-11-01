import type { Reservation } from "../data/types";
import type { ReservationCoordination } from "../types/app";
import { TERMINAL_RESERVATION_STATUSES } from "./appConstants";

export function isTerminalReservation(status: Reservation["status"]): boolean {
  return TERMINAL_RESERVATION_STATUSES.has(status);
}

export function getReservationHandoffPlan(reservation: Reservation) {
  const localPlan = (reservation as ReservationCoordination).handoffPlan;
  if (localPlan) return localPlan;
  const mode = reservation.handoffMethod ?? (reservation.handoffTracking ? "shipping" : "pickup");
  const locationOrTracking =
    mode === "shipping"
      ? reservation.handoffTracking ?? reservation.handoffLocation
      : reservation.handoffLocation ?? reservation.handoffTracking;
  if (!reservation.handoffMethod && !reservation.handoffWindow && !locationOrTracking && !reservation.handoffNote) {
    return undefined;
  }
  return {
    mode,
    window: reservation.handoffWindow ?? "",
    locationOrTracking: locationOrTracking ?? "",
    note: reservation.handoffNote,
    updatedAt: reservation.updatedAt
  };
}

export function getReservationCancellation(reservation: Reservation) {
  const coordinated = reservation as ReservationCoordination;
  return {
    reason: reservation.cancellationReason,
    cancelledById: coordinated.cancelledById ?? reservation.cancelledByUserId,
    cancelledAt: reservation.cancelledAt
  };
}
