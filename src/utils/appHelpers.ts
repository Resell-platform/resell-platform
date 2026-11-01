import type { RealtimeEvent } from "../data/remoteApi";
import type { Message, Notification } from "../data/types";
import type { Locale } from "../i18n";
import type { TextScale } from "../types/app";
import { TEXT_SCALES, TEXT_SCALE_STORAGE_KEY } from "./appConstants";

export function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem("resell-locale");
  return stored === "zh" ? "zh" : "en";
}

export function getInitialTextScale(): TextScale {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
  return TEXT_SCALES.includes(stored as TextScale) ? (stored as TextScale) : "default";
}

export function parseRealtimeEvent(data: unknown): RealtimeEvent | null {
  if (typeof data !== "string") return null;

  try {
    const event = JSON.parse(data) as Partial<RealtimeEvent>;
    if (event.version !== 1 || typeof event.type !== "string") return null;

    if (event.type === "connected") {
      return typeof event.userId === "string" && typeof event.serverTime === "string"
        ? (event as RealtimeEvent)
        : null;
    }

    if (event.type === "message.created") {
      const message = (event as { message?: Partial<Message> }).message;
      const notification = (event as { notification?: Partial<Notification> }).notification;
      const messageIsValid =
        typeof message === "object" &&
        message !== null &&
        typeof message.id === "string" &&
        typeof message.reservationId === "string" &&
        typeof message.senderId === "string" &&
        typeof message.body === "string" &&
        typeof message.createdAt === "string";
      const notificationIsValid =
        notification === undefined ||
        (typeof notification === "object" &&
          notification !== null &&
          typeof notification.id === "string" &&
          typeof notification.userId === "string");
      return messageIsValid && notificationIsValid ? (event as RealtimeEvent) : null;
    }

    if (event.type === "sync.required") {
      return event.reason === undefined || typeof event.reason === "string" ? (event as RealtimeEvent) : null;
    }

    return null;
  } catch {
    return null;
  }
}
