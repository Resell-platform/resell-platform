import {
  logoutRemoteSession,
  requestRemoteEmailCode,
  updateRemoteProfile,
  verifyRemoteEmailCode,
  type AuthStateResponse,
  type RequestCodeResponse
} from "../data/remoteApi";
import type { Listing, ListingImage, Reservation } from "../data/types";
import { createId } from "../data/store";

export type PlatformTarget = "h5-pwa" | "wechat-mini" | "xiaohongshu-mini" | "messenger-webview";

export type LoginAdapter = {
  target: PlatformTarget;
  requestEmailCode(email: string, displayName?: string): Promise<RequestCodeResponse>;
  verifyEmailCode(email: string, code: string, displayName?: string): Promise<AuthStateResponse>;
  updateProfile(draft: { displayName: string; bio?: string; pickupArea?: string; phoneE164?: string }): Promise<AuthStateResponse>;
  logout(): Promise<{ ok: true }>;
};

export type SharePayload = {
  title: string;
  text: string;
  url: string;
};

export type ShareResult = {
  method: "native" | "clipboard" | "unsupported";
};

export type ShareAdapter = {
  target: PlatformTarget;
  canShare(): boolean;
  share(payload: SharePayload): Promise<ShareResult>;
};

export type NotificationAdapter = {
  target: PlatformTarget;
  canRequestPermission(): boolean;
  requestPermission(): Promise<NotificationPermission | "unsupported">;
  show(title: string, options?: NotificationOptions): Promise<boolean>;
};

export type ImageUploadResult = {
  images: ListingImage[];
  rejected: File[];
};

export type ImageUploadAdapter = {
  target: PlatformTarget;
  accept: string;
  readImages(files: FileList | File[] | null, options: { remainingSlots: number; maxBytes: number }): Promise<ImageUploadResult>;
};

export type DeepLinkAdapter = {
  target: PlatformTarget;
  listingUrl(listingId: string): string;
  reservationUrl(reservationId: string): string;
  open(url: string): void;
};

export type PaymentAdapter = {
  target: PlatformTarget;
  provider: "none";
  canProcessPayment: false;
  mode: "off_platform";
  supportedReservationStatuses: Reservation["status"][];
  paymentNotice: string;
};

export type PlatformAdapters = {
  target: PlatformTarget;
  login: LoginAdapter;
  share: ShareAdapter;
  notification: NotificationAdapter;
  imageUpload: ImageUploadAdapter;
  deepLink: DeepLinkAdapter;
  payment: PaymentAdapter;
};

export function createWebPlatformAdapters(baseUrl = getBaseUrl()): PlatformAdapters {
  return {
    target: "h5-pwa",
    login: webLoginAdapter,
    share: createWebShareAdapter(),
    notification: createWebNotificationAdapter(),
    imageUpload: createWebImageUploadAdapter(),
    deepLink: createWebDeepLinkAdapter(baseUrl),
    payment: createNoPaymentAdapter("h5-pwa")
  };
}

export function createNoPaymentAdapter(target: PlatformTarget): PaymentAdapter {
  return {
    target,
    provider: "none",
    canProcessPayment: false,
    mode: "off_platform",
    supportedReservationStatuses: ["requested", "awaiting_payment", "payment_sent", "paid", "overdue", "cancelled", "sold"],
    paymentNotice: "Payments stay off-platform. Use chat to coordinate and update the reservation manually."
  };
}

export function buildListingSharePayload(listing: Listing, url: string): SharePayload {
  return {
    title: listing.title,
    text: `${listing.title} - $${listing.price}`,
    url
  };
}

const webLoginAdapter: LoginAdapter = {
  target: "h5-pwa",
  requestEmailCode: requestRemoteEmailCode,
  verifyEmailCode: verifyRemoteEmailCode,
  updateProfile: updateRemoteProfile,
  logout: logoutRemoteSession
};

function createWebShareAdapter(): ShareAdapter {
  return {
    target: "h5-pwa",
    canShare() {
      return typeof navigator !== "undefined" && (Boolean(navigator.share) || Boolean(navigator.clipboard?.writeText));
    },
    async share(payload) {
      if (typeof navigator === "undefined") {
        return { method: "unsupported" };
      }
      if (navigator.share) {
        await navigator.share(payload);
        return { method: "native" };
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.url);
        return { method: "clipboard" };
      }
      return { method: "unsupported" };
    }
  };
}

function createWebNotificationAdapter(): NotificationAdapter {
  return {
    target: "h5-pwa",
    canRequestPermission() {
      return typeof Notification !== "undefined" && Notification.permission === "default";
    },
    async requestPermission() {
      if (typeof Notification === "undefined") {
        return "unsupported";
      }
      return Notification.requestPermission();
    },
    async show(title, options) {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return false;
      }
      new Notification(title, options);
      return true;
    }
  };
}

function createWebImageUploadAdapter(): ImageUploadAdapter {
  return {
    target: "h5-pwa",
    accept: "image/*",
    async readImages(files, options) {
      if (!files || options.remainingSlots <= 0) {
        return { images: [], rejected: [] };
      }

      const selected = Array.from(files);
      const rejected = selected.filter((file) => !file.type.startsWith("image/") || file.size > options.maxBytes);
      const accepted = selected
        .filter((file) => file.type.startsWith("image/") && file.size <= options.maxBytes)
        .slice(0, options.remainingSlots);
      const images = await Promise.all(accepted.map(readImage));
      return { images, rejected };
    }
  };
}

function createWebDeepLinkAdapter(baseUrl: string): DeepLinkAdapter {
  return {
    target: "h5-pwa",
    listingUrl(listingId) {
      return `${baseUrl}/?listing=${encodeURIComponent(listingId)}`;
    },
    reservationUrl(reservationId) {
      return `${baseUrl}/?reservation=${encodeURIComponent(reservationId)}`;
    },
    open(url) {
      window.location.assign(url);
    }
  };
}

function readImage(file: File): Promise<ListingImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () =>
      resolve({
        id: createId("image"),
        name: file.name,
        dataUrl: String(reader.result),
        primary: false,
        createdAt: new Date().toISOString()
      });
    reader.readAsDataURL(file);
  });
}

function getBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.origin;
}
