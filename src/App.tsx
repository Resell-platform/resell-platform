import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  Filter,
  ImagePlus,
  Menu,
  MessageSquare,
  Package,
  RefreshCcw,
  Search,
  Share2,
  ShoppingBag,
  Truck,
  Upload,
  UserRound,
  X
} from "lucide-react";
import {
  cancelReservation,
  computeHoldExpirationNotifications,
  createId,
  createListing,
  getSellerSetup,
  getPrimaryImage,
  getUserName,
  loadState,
  reserveListing,
  resetState,
  saveState,
  sendMessage,
  updateListingDetails,
  updateListingStatus,
  updateReservationHandoffPlan,
  updateSellerSetup,
  updateReservationStatus
} from "./data/store";
import type { HandoffPlanDraft, SellerSetupDraft } from "./data/store";
import {
  createRemoteListing,
  connectRealtimeSocket,
  exportRemoteData,
  fetchRemoteSession,
  fetchRemoteState,
  markRemoteNotificationsRead,
  reserveRemoteListing,
  sendRemoteMessage,
  updateRemoteListing,
  updateRemoteListingStatus,
  updateRemoteProfile,
  updateRemoteReservationHandoff,
  updateRemoteReservationStatus,
  type ExportArchive,
  type RealtimeEvent
} from "./data/remoteApi";
import {
  MAX_LISTING_ITEMS,
  type AppState,
  type Listing,
  type ListingDraft,
  type ListingItem,
  type ListingStatus,
  type Message,
  type Notification,
  type Reservation,
  type User
} from "./data/types";
import { categoryLabel, copy, statusLabel, type Copy, type Locale } from "./i18n";
import {
  buildListingSharePayload,
  createWebPlatformAdapters,
  type ImageUploadAdapter,
  type LoginAdapter
} from "./platform/adapters";

type View = "browse" | "sell" | "orders" | "chat" | "notifications";
type BrowseSort = "newest" | "price_asc" | "price_desc" | "title";
type BrowseFilters = {
  category: string;
  condition: string;
  status: string;
  minPrice: string;
  maxPrice: string;
  sort: BrowseSort;
};
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ACTIVE_RESERVATION_STATUSES: Reservation["status"][] = [
  "requested",
  "awaiting_payment",
  "payment_sent",
  "overdue"
];
const TERMINAL_RESERVATION_STATUSES = new Set<Reservation["status"]>(["paid", "sold", "cancelled"]);
const DEFAULT_BROWSE_FILTERS: BrowseFilters = {
  category: "all",
  condition: "all",
  status: "all",
  minPrice: "",
  maxPrice: "",
  sort: "newest"
};

const platformAdapters = createWebPlatformAdapters();

function createBlankDraftItem(position: number, condition: ListingItem["condition"] = "good"): ListingItem {
  return {
    id: createId("item"),
    name: "",
    condition,
    position,
    createdAt: new Date().toISOString()
  };
}

function isTerminalReservation(status: Reservation["status"]): boolean {
  return TERMINAL_RESERVATION_STATUSES.has(status);
}

function createBlankDraft(): ListingDraft {
  return {
    title: "",
    description: "",
    price: 0,
    category: "Furniture",
    condition: "good",
    location: "",
    images: [],
    items: [createBlankDraftItem(0)]
  };
}

function listingToDraft(listing: Listing): ListingDraft {
  return {
    title: listing.title,
    description: listing.description,
    price: listing.price,
    category: listing.category,
    condition: listing.condition,
    location: listing.location,
    images: listing.images.map((image, index) => ({
      ...image,
      primary: index === 0
    })),
    items:
      listing.items.length > 0
        ? listing.items.map((item, index) => ({
            ...item,
            condition: item.condition ?? listing.condition,
            position: index
          }))
        : [createBlankDraftItem(0, listing.condition)]
  };
}

const emptyCloudState: AppState = {
  users: [],
  activeUserId: "",
  listings: [],
  reservations: [],
  messages: [],
  notifications: []
};

function createLocalExport(state: AppState, activeUser?: User | null): ExportArchive {
  const user = activeUser ?? state.users[0] ?? { id: "local", name: "Local user", role: "seller" as const };
  const reservations = state.reservations.filter(
    (reservation) => reservation.buyerId === user.id || reservation.sellerId === user.id
  );
  const reservationIds = new Set(reservations.map((reservation) => reservation.id));
  const reservedListingIds = new Set(reservations.map((reservation) => reservation.listingId));
  return {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    architecture: {
      backend: [
        "Cloudflare Pages Functions / Workers",
        "Cloudflare D1",
        "Cloudflare R2",
        "Resend email login",
        "HttpOnly session cookies",
        "Reservation and handoff workflow"
      ],
      businessModels: [
        "User / Profile",
        "Listing",
        "ListingItem",
        "ListingImage",
        "Reservation",
        "ChatMessage",
        "Notification",
        "TrustBadge",
        "ModerationStatus"
      ],
      frontends: [
        "Current H5 / PWA web app",
        "WeChat mini program later",
        "Xiaohongshu mini program later",
        "Messenger WebView later"
      ],
      adapters: [
        "Login adapter",
        "Share adapter",
        "Notification adapter",
        "Image upload adapter",
        "Deep link / open-in-app adapter",
        "Reservation coordination adapter"
      ]
    },
    user,
    trustBadges: [
      ...(user.emailVerifiedAt ? (["email_verified"] as const) : []),
      ...(user.phoneVerifiedAt ? (["phone_verified"] as const) : [])
    ],
    moderationStatuses: ["pending", "approved", "rejected", "flagged"],
    state: {
      ...state,
      activeUserId: user.id,
      listings: state.listings.filter(
        (listing) => listing.sellerId === user.id || reservedListingIds.has(listing.id)
      ),
      reservations,
      messages: state.messages.filter((message) => reservationIds.has(message.reservationId)),
      notifications: state.notifications.filter((notification) => notification.userId === user.id)
    }
  };
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem("resell-locale");
  return stored === "zh" ? "zh" : "en";
}

function parseRealtimeEvent(data: unknown): RealtimeEvent | null {
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

function getItemCountText(listing: Listing, text: Copy) {
  const count = listing.items.length;
  return `${count} ${count === 1 ? text.itemSingular : text.itemPlural}`;
}

function getListingMetaParts(listing: Listing, text: Copy) {
  return [
    `$${listing.price}`,
    getItemCountText(listing, text),
    `${text.updated} ${new Date(listing.updatedAt).toLocaleDateString()}`
  ].filter(Boolean);
}

function getParticipantSummary(listing: Listing, reservation: Reservation, state: AppState, text: Copy) {
  return [
    `${getUserName(state, reservation.buyerId)} ${text.participantAnd} ${getUserName(state, reservation.sellerId)}`,
    getItemCountText(listing, text)
  ].filter(Boolean);
}

function formatOptionalPrice(price?: number) {
  return Number.isFinite(price) ? `$${price}` : "";
}

function getDraftItemTotal(draft: ListingDraft) {
  return (Array.isArray(draft.items) ? draft.items : []).reduce(
    (total, item) => total + (Number.isFinite(item.price) ? Number(item.price) : 0),
    0
  );
}

function getListingItemSummary(listing: Listing) {
  return listing.items
    .slice()
    .sort((first, second) => first.position - second.position)
    .slice(0, 3);
}

function getListingDisplayItems(listing: Listing) {
  return listing.items.slice().sort((first, second) => first.position - second.position);
}

function hasPublishableItems(draft: ListingDraft) {
  const items = Array.isArray(draft.items) ? draft.items : [];

  return (
    items.length > 0 &&
    items.length <= MAX_LISTING_ITEMS &&
    items.every(
      (item) =>
        item.name.trim() &&
        Number.isFinite(item.price) &&
        Number(item.price) > 0 &&
        item.condition
    )
  );
}

type ReservationCoordination = Reservation & {
  handoffPlan?: HandoffPlanDraft & {
    updatedAt?: string;
    updatedById?: string;
  };
  cancelledById?: string;
};

function getReservationHandoffPlan(reservation: Reservation) {
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

function getReservationCancellation(reservation: Reservation) {
  const coordinated = reservation as ReservationCoordination;
  return {
    reason: reservation.cancellationReason,
    cancelledById: coordinated.cancelledById ?? reservation.cancelledByUserId,
    cancelledAt: reservation.cancelledAt
  };
}

export default function App() {
  const allowLocalFallback = import.meta.env.DEV;
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [state, setState] = useState<AppState>(() =>
    allowLocalFallback ? computeHoldExpirationNotifications(loadState()) : emptyCloudState
  );
  const [dataSource, setDataSource] = useState<"local" | "cloudflare">(
    allowLocalFallback ? "local" : "cloudflare"
  );
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [actionError, setActionError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [view, setView] = useState<View>("browse");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const [selectedListingId, setSelectedListingId] = useState<string | null>("listing-1");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>("reservation-1");
  const [query, setQuery] = useState("");
  const [browseFilters, setBrowseFilters] = useState<BrowseFilters>(DEFAULT_BROWSE_FILTERS);
  const [cancellationRequestId, setCancellationRequestId] = useState<string | null>(null);
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const text = copy[locale];

  useEffect(() => {
    window.localStorage.setItem("resell-locale", locale);
    document.documentElement.lang = locale === "zh" ? "zh-Hans" : "en";
  }, [locale]);

  useEffect(() => {
    if (dataSource === "local") {
      saveState(state);
    }
  }, [dataSource, state]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRemoteSession(), fetchRemoteState("")])
      .then(([session, remoteState]) => {
        if (cancelled) return;
        setSessionUser(session.user);
        setState(remoteState);
        setDataSource("cloudflare");
        setActionError("");
      })
      .catch((error) => {
        if (!cancelled) {
          if (allowLocalFallback) {
            setDataSource("local");
            return;
          }
          setDataSource("cloudflare");
          setState(emptyCloudState);
          setActionError(error instanceof Error ? error.message : text.cloudflareApiUnavailable);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [allowLocalFallback]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (dataSource === "cloudflare") {
        fetchRemoteState("")
          .then((remoteState) => {
            setState(remoteState);
            setActionError("");
          })
          .catch((error) => setActionError(error.message));
        return;
      }
      setState((current) => computeHoldExpirationNotifications(current));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [dataSource, state.activeUserId]);

  useEffect(() => {
    if (dataSource !== "cloudflare" || !sessionUser) return;
    if (typeof WebSocket === "undefined") return;

    const realtimeUserId = sessionUser.id;
    let active = true;
    let reconnectAttempt = 0;
    let hasOpened = false;
    let reconnectTimer: number | null = null;
    let refreshTimer: number | null = null;
    let refreshInFlight = false;
    let lastRefreshAt = 0;

    function refreshRemoteState() {
      if (!active || refreshInFlight || refreshTimer !== null) return;

      const elapsed = Date.now() - lastRefreshAt;
      const delay = Math.max(0, 750 - elapsed);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshInFlight = true;
        fetchRemoteState("")
          .then((remoteState) => {
            if (!active) return;
            setState(remoteState);
            setActionError("");
          })
          .catch((error) => {
            if (active) {
              setActionError(error instanceof Error ? error.message : text.cloudflareRequestFailed);
            }
          })
          .finally(() => {
            refreshInFlight = false;
            lastRefreshAt = Date.now();
          });
      }, delay);
    }

    function mergeMessageEvent(event: Extract<RealtimeEvent, { type: "message.created" }>) {
      setState((current) => {
        const messageExists = current.messages.some((message) => message.id === event.message.id);
        const messages = messageExists
          ? current.messages.map((message) => (message.id === event.message.id ? event.message : message))
          : [...current.messages, event.message];

        if (!event.notification || event.notification.userId !== realtimeUserId) {
          return { ...current, messages };
        }

        const notification = event.notification;
        const notificationExists = current.notifications.some(
          (currentNotification) => currentNotification.id === notification.id
        );
        const notifications = notificationExists
          ? current.notifications.map((currentNotification) =>
              currentNotification.id === notification.id ? notification : currentNotification
            )
          : [...current.notifications, notification];

        return { ...current, messages, notifications };
      });
    }

    function scheduleReconnect() {
      if (!active || reconnectTimer !== null) return;
      const delay = Math.min(1_000 * 2 ** reconnectAttempt, 10_000);
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        openSocket();
      }, delay);
    }

    function openSocket() {
      if (!active) return;

      try {
        const socket = connectRealtimeSocket();
        realtimeSocketRef.current = socket;

        socket.addEventListener("open", () => {
          const wasReconnect = hasOpened || reconnectAttempt > 0;
          reconnectAttempt = 0;
          if (wasReconnect) {
            refreshRemoteState();
          }
          hasOpened = true;
        });
        socket.addEventListener("message", (messageEvent) => {
          const event = parseRealtimeEvent(messageEvent.data);

          if (!event || event.type === "sync.required") {
            refreshRemoteState();
            return;
          }

          if (event.type === "connected") {
            if (event.userId !== realtimeUserId) {
              refreshRemoteState();
            }
            return;
          }

          mergeMessageEvent(event);
        });
        socket.addEventListener("close", () => {
          if (realtimeSocketRef.current !== socket) return;
          scheduleReconnect();
        });
        socket.addEventListener("error", () => {
          if (realtimeSocketRef.current !== socket) return;
          socket.close();
          scheduleReconnect();
        });
      } catch {
        scheduleReconnect();
      }
    }

    openSocket();

    return () => {
      active = false;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
    };
  }, [dataSource, sessionUser?.id, text.cloudflareRequestFailed]);

  const activeUser =
    dataSource === "cloudflare"
      ? sessionUser
      : state.users.find((user) => user.id === state.activeUserId) ?? state.users[0];
  const listingCategories = useMemo(
    () => Array.from(new Set(state.listings.map((listing) => listing.category))).sort(),
    [state.listings]
  );
  const visibleListings = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const minPrice = Number.parseFloat(browseFilters.minPrice);
    const maxPrice = Number.parseFloat(browseFilters.maxPrice);
    return state.listings
      .filter((listing) => {
        if (browseFilters.category !== "all" && listing.category !== browseFilters.category) return false;
        if (browseFilters.condition !== "all" && listing.condition !== browseFilters.condition) return false;
        if (browseFilters.status !== "all" && listing.status !== browseFilters.status) return false;
        if (!Number.isNaN(minPrice) && listing.price < minPrice) return false;
        if (!Number.isNaN(maxPrice) && listing.price > maxPrice) return false;
        if (!normalized) return true;
        return [
          listing.title,
          listing.category,
          listing.description,
          listing.location,
          ...listing.items.flatMap((item) => [item.name, item.notes ?? ""])
        ].some((field) => field.toLowerCase().includes(normalized));
      })
      .sort((first, second) => {
        if (browseFilters.sort === "price_asc") return first.price - second.price;
        if (browseFilters.sort === "price_desc") return second.price - first.price;
        if (browseFilters.sort === "title") return first.title.localeCompare(second.title);
        return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
      });
  }, [browseFilters, query, state.listings]);
  const selectedListing =
    visibleListings.find((listing) => listing.id === selectedListingId) ??
    visibleListings[0] ??
    null;
  const userReservations = activeUser
    ? state.reservations.filter(
        (reservation) => reservation.sellerId === activeUser.id || reservation.buyerId === activeUser.id
      )
    : [];
  const selectedReservation =
    userReservations.find((reservation) => reservation.id === selectedReservationId) ??
    userReservations[0];
  const unreadCount = state.notifications.filter(
    (notification) => activeUser && notification.userId === activeUser.id && !notification.readAt
  ).length;
  const cancellationReservation =
    userReservations.find((reservation) => reservation.id === cancellationRequestId) ?? null;

  function update(nextState: AppState) {
    setState(computeHoldExpirationNotifications(nextState));
  }

  function promptLogin(message: string) {
    setAuthMessage(message);
  }

  function openReservationChat(reservationId: string) {
    if (dataSource === "cloudflare" && !sessionUser) {
      promptLogin(text.loginPickedChat);
      return;
    }
    setSelectedReservationId(reservationId);
    setView("chat");
  }

  function openReservationOrder(reservationId: string) {
    if (dataSource === "cloudflare" && !sessionUser) {
      promptLogin(text.loginPickedItems);
      return;
    }
    setSelectedReservationId(reservationId);
    setView("orders");
  }

  function openProtectedView(nextView: View, message: string) {
    if (dataSource === "cloudflare" && !sessionUser) {
      promptLogin(message);
    }
    setView(nextView);
  }

  async function runRemoteAction(action: () => Promise<AppState>) {
    try {
      const remoteState = await action();
      setState(remoteState);
      setDataSource("cloudflare");
      setActionError("");
      return remoteState;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : text.cloudflareRequestFailed);
      throw error;
    }
  }

  async function handleReserve(listingId: string) {
    if (dataSource === "cloudflare") {
      if (!sessionUser) {
        promptLogin(text.loginReserve);
        return;
      }
      const beforeIds = new Set(state.reservations.map((reservation) => reservation.id));
      const next = await runRemoteAction(() => reserveRemoteListing(listingId));
      const reservation = next.reservations.find(
        (item) => item.listingId === listingId && item.buyerId === sessionUser.id && !beforeIds.has(item.id)
      );
      if (reservation) {
        setSelectedReservationId(reservation.id);
        setView("chat");
      }
      return;
    }

    setState((current) => {
      const next = computeHoldExpirationNotifications(reserveListing(current, listingId, activeUser?.id ?? ""));
      const reservation = next.reservations.find(
        (item) =>
          item.listingId === listingId &&
          item.buyerId === activeUser?.id &&
          !current.reservations.some((existing) => existing.id === item.id)
      );
      if (reservation) {
        window.setTimeout(() => {
          setSelectedReservationId(reservation.id);
          setView("chat");
        }, 0);
      }
      return next;
    });
  }

  async function handleCreateListing(draft: ListingDraft, sellerSetup?: SellerSetupDraft): Promise<boolean> {
    if (dataSource === "cloudflare") {
      if (!sessionUser) {
        promptLogin(text.loginPublishListing);
        return false;
      }
      const next = await runRemoteAction(async () => {
        if (sellerSetup) {
          const result = await updateRemoteProfile({
            displayName: sessionUser.name,
            bio: sessionUser.bio,
            pickupArea: sellerSetup.pickupArea,
            offPlatformInstructions: sellerSetup.offPlatformInstructions,
            responseExpectation: sellerSetup.responseExpectation,
            cancellationPolicy: sellerSetup.cancellationPolicy
          });
          setSessionUser(result.user);
        }
        return createRemoteListing(draft);
      });
      setSelectedListingId(next.listings[0].id);
      setView("browse");
      return true;
    }

    const sellerReadyState =
      activeUser && sellerSetup ? updateSellerSetup(state, activeUser.id, sellerSetup) : state;
    const next = createListing(sellerReadyState, activeUser?.id ?? "", draft);
    update(next);
    setSelectedListingId(next.listings[0].id);
    setView("browse");
    return true;
  }

  function handleUpdateListingStatus(listingId: string, status: Exclude<ListingStatus, "reserved">) {
    if (dataSource === "cloudflare") {
      if (!sessionUser) {
        promptLogin(text.loginManageListings);
        return;
      }
      runRemoteAction(() => updateRemoteListingStatus(listingId, status));
      return;
    }

    update(updateListingStatus(state, listingId, activeUser?.id ?? "", status));
  }

  async function handleUpdateListing(listingId: string, draft: ListingDraft): Promise<boolean> {
    if (dataSource === "cloudflare") {
      if (!sessionUser) {
        promptLogin(text.loginManageListings);
        return false;
      }
      await runRemoteAction(() => updateRemoteListing(listingId, draft));
      return true;
    }

    const next = updateListingDetails(state, listingId, activeUser?.id ?? "", draft);
    if (next === state) return false;
    update(next);
    return true;
  }

  function handleSaveSellerSetup(draft: SellerSetupDraft) {
    if (!activeUser) return;
    if (dataSource === "local") {
      update(updateSellerSetup(state, activeUser.id, draft));
      return;
    }
    runRemoteAction(() =>
      updateRemoteProfile({
        displayName: activeUser.name,
        bio: activeUser.bio,
        pickupArea: draft.pickupArea,
        offPlatformInstructions: draft.offPlatformInstructions,
        responseExpectation: draft.responseExpectation,
        cancellationPolicy: draft.cancellationPolicy
      }).then((result) => {
        setSessionUser(result.user);
        return result.state;
      })
    ).then(() => setAuthMessage(text.sellerSetupSavedLocal));
  }

  function handleUpdateHandoffPlan(reservationId: string, draft: HandoffPlanDraft) {
    if (dataSource === "cloudflare") {
      if (!sessionUser) {
        promptLogin(text.loginPickedItems);
        return;
      }
      runRemoteAction(() =>
        updateRemoteReservationHandoff(reservationId, {
          handoffMethod: draft.mode,
          handoffWindow: draft.window,
          handoffLocation: draft.mode === "pickup" ? draft.locationOrTracking : undefined,
          handoffTracking: draft.mode === "shipping" ? draft.locationOrTracking : undefined,
          handoffNote: draft.note
        })
      );
      return;
    }

    update(updateReservationHandoffPlan(state, reservationId, activeUser?.id ?? "", draft));
  }

  function handleCancelReservation(reservationId: string, reason: string) {
    if (dataSource === "cloudflare") {
      if (!sessionUser) {
        promptLogin(text.loginPickedItems);
        return;
      }
      runRemoteAction(() =>
        updateRemoteReservationStatus(reservationId, {
          status: "cancelled",
          reason,
          recoveryAction: "relist"
        })
      );
      setCancellationRequestId(null);
      return;
    }

    update(cancelReservation(state, reservationId, activeUser?.id ?? "", reason));
    setCancellationRequestId(null);
  }

  async function handleExportData() {
    try {
      if (dataSource === "cloudflare") {
        if (!sessionUser) {
          promptLogin(text.loginExport);
          return;
        }
        downloadJson(await exportRemoteData(), `resell-export-${sessionUser.id}.json`);
      } else {
        downloadJson(createLocalExport(state, activeUser), `resell-local-export-${activeUser?.id ?? "demo"}.json`);
      }
      setAuthMessage(text.exportReady);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : text.exportFailed);
    }
  }

  async function handleShareListing(listing: Listing) {
    const url = platformAdapters.deepLink.listingUrl(listing.id);
    try {
      const result = await platformAdapters.share.share(buildListingSharePayload(listing, url));
      if (result.method === "clipboard") {
        setAuthMessage(text.shareCopied);
      } else if (result.method === "native") {
        setAuthMessage(text.shareDone);
      } else {
        setAuthMessage(text.shareUnavailable);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setAuthMessage(error instanceof Error ? error.message : text.shareUnavailable);
    }
  }

  async function handleEnableNotifications() {
    const permission = await platformAdapters.notification.requestPermission();
    if (permission === "granted") {
      setAuthMessage(text.alertsEnabled);
      return;
    }
    setAuthMessage(text.alertsUnavailable);
  }

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${mobileNavVisible ? "" : "mobile-nav-hidden"}`}>
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"} aria-label="Primary navigation">
        <div className="sidebar-header">
          <div className="brand">
            <img className="brand-mark" src="/brand/icon-192.png" alt="" />
            <span>Resell</span>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarCollapsed ? text.expandSidebar : text.collapseSidebar}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <LanguageControl locale={locale} setLocale={setLocale} text={text} />
        <div className="data-source">{dataSource === "cloudflare" ? "Cloudflare D1" : text.localDemo}</div>
        {dataSource === "local" ? (
          <>
            <UserSwitcher state={state} setState={setState} text={text} />
            <button className="secondary" onClick={handleExportData}>
              <Download size={16} />
              {text.dataExport}
            </button>
          </>
        ) : (
          <AccountPanel
            user={sessionUser}
            message={authMessage}
            text={text}
            loginAdapter={platformAdapters.login}
            onMessage={setAuthMessage}
            onExport={handleExportData}
            onAuthenticated={(user, nextState) => {
              setSessionUser(user);
              setState(nextState);
              setAuthMessage("");
            }}
            onProfileUpdated={(user, nextState) => {
              setSessionUser(user);
              setState(nextState);
            }}
            onLogout={async () => {
              await platformAdapters.login.logout();
              setSessionUser(null);
              setState(await fetchRemoteState(""));
              setView("browse");
            }}
          />
        )}
        <nav>
          <NavButton icon={<Search />} label={text.browse} active={view === "browse"} onClick={() => setView("browse")} />
          <NavButton
            icon={<Upload />}
            label={text.sell}
            active={view === "sell"}
            onClick={() => openProtectedView("sell", text.loginSellAction)}
          />
          <NavButton
            icon={<ShoppingBag />}
            label={text.picked}
            active={view === "orders"}
            onClick={() => openProtectedView("orders", text.loginOrdersAction)}
          />
          <NavButton
            icon={<MessageSquare />}
            label={text.chat}
            active={view === "chat"}
            onClick={() => openProtectedView("chat", text.loginChatAction)}
          />
          <NavButton
            icon={<Bell />}
            label={`${text.alerts}${unreadCount ? ` (${unreadCount})` : ""}`}
            active={view === "notifications"}
            onClick={() => openProtectedView("notifications", text.loginAlertsAction)}
          />
        </nav>
        {dataSource === "local" && (
          <button className="ghost reset" onClick={() => setState(computeHoldExpirationNotifications(resetState()))}>
            <RefreshCcw size={16} />
            {text.resetDemo}
          </button>
        )}
      </aside>

      <main className="main">
        <header className="mobile-app-header">
          <div className="brand mobile-brand">
            <img className="brand-mark" src="/brand/icon-192.png" alt="" />
            <span>Resell</span>
          </div>
          <button
            className="mobile-nav-toggle secondary"
            type="button"
            aria-label={mobileNavVisible ? text.hideNavigation : text.showNavigation}
            onClick={() => setMobileNavVisible((visible) => !visible)}
          >
            <Menu size={18} />
            <span>{mobileNavVisible ? text.hideNavigation : text.showNavigation}</span>
          </button>
          <div className="data-source">{dataSource === "cloudflare" ? "Cloudflare D1" : text.localDemo}</div>
        </header>
        <div className="mobile-user-bar">
          {dataSource === "local" ? (
            <>
              <UserSwitcher state={state} setState={setState} text={text} />
              <button className="secondary" onClick={handleExportData}>
                <Download size={16} />
                {text.dataExport}
              </button>
            </>
          ) : (
            <AccountPanel
              user={sessionUser}
              message={authMessage}
              text={text}
              loginAdapter={platformAdapters.login}
              onMessage={setAuthMessage}
              onExport={handleExportData}
              onAuthenticated={(user, nextState) => {
                setSessionUser(user);
                setState(nextState);
                setAuthMessage("");
              }}
              onProfileUpdated={(user, nextState) => {
                setSessionUser(user);
                setState(nextState);
              }}
              onLogout={async () => {
                await platformAdapters.login.logout();
                setSessionUser(null);
                setState(await fetchRemoteState(""));
                setView("browse");
              }}
            />
          )}
          <LanguageControl locale={locale} setLocale={setLocale} text={text} />
        </div>
        {actionError && <p className="global-error">{actionError}</p>}
        {view === "browse" && (
          <BrowseView
            listings={visibleListings}
            selectedListing={selectedListing}
            activeUserId={activeUser?.id ?? ""}
            query={query}
            setQuery={setQuery}
            filters={browseFilters}
            setFilters={setBrowseFilters}
            categories={listingCategories}
            selectListing={setSelectedListingId}
            reserveListing={handleReserve}
            shareListing={handleShareListing}
            text={text}
            locale={locale}
          />
        )}
        {dataSource === "cloudflare" && !sessionUser && view !== "browse" && (
          <LoginRequiredPanel view={view} text={text} />
        )}
        {view === "sell" && !(dataSource === "cloudflare" && !sessionUser) && (
          <SellView
            activeUser={activeUser}
            onCreate={handleCreateListing}
            onUpdate={handleUpdateListing}
            onSaveSellerSetup={handleSaveSellerSetup}
            listings={state.listings}
            reservations={state.reservations}
            userNameFor={(userId) => getUserName(state, userId)}
            openChat={openReservationChat}
            openOrder={openReservationOrder}
            updateStatus={handleUpdateListingStatus}
            updateReservation={(reservationId, status) =>
              dataSource === "cloudflare"
                ? runRemoteAction(() => updateRemoteReservationStatus(reservationId, status))
                : update(updateReservationStatus(state, reservationId, activeUser?.id ?? "", status))
            }
            requestCancellation={setCancellationRequestId}
            imageUploadAdapter={platformAdapters.imageUpload}
            text={text}
            locale={locale}
          />
        )}
        {view === "orders" && !(dataSource === "cloudflare" && !sessionUser) && (
          <OrdersView
            state={state}
            reservations={userReservations}
            activeUserId={activeUser?.id ?? ""}
            selectedReservationId={selectedReservation?.id}
            openChat={openReservationChat}
            updateHandoffPlan={handleUpdateHandoffPlan}
            updateStatus={(reservationId, status) =>
              dataSource === "cloudflare"
                ? runRemoteAction(() => updateRemoteReservationStatus(reservationId, status))
                : update(updateReservationStatus(state, reservationId, activeUser?.id ?? "", status))
            }
            requestCancellation={setCancellationRequestId}
            coordinationNotice={text.coordinationNotice}
            text={text}
            locale={locale}
          />
        )}
        {view === "chat" && !(dataSource === "cloudflare" && !sessionUser) && (
          <ChatView
            state={state}
            activeUserId={activeUser?.id ?? ""}
            selectedReservation={selectedReservation}
            selectReservation={setSelectedReservationId}
            reservations={userReservations}
            send={(reservationId, body) =>
              dataSource === "cloudflare"
                ? runRemoteAction(() => sendRemoteMessage(reservationId, body))
                : update(sendMessage(state, reservationId, activeUser?.id ?? "", body))
            }
            updateStatus={(reservationId, status) =>
              dataSource === "cloudflare"
                ? runRemoteAction(() => updateRemoteReservationStatus(reservationId, status))
                : update(updateReservationStatus(state, reservationId, activeUser?.id ?? "", status))
            }
            requestCancellation={setCancellationRequestId}
            text={text}
            locale={locale}
          />
        )}
        {view === "notifications" && !(dataSource === "cloudflare" && !sessionUser) && (
          <NotificationsView
            state={state}
            activeUserId={activeUser?.id ?? ""}
            markAllRead={() => {
              if (dataSource === "cloudflare") {
                if (!sessionUser) {
                  promptLogin(text.loginManageNotifications);
                  return;
                }
                runRemoteAction(() => markRemoteNotificationsRead());
                return;
              }
              const readAt = new Date().toISOString();
              setState({
                ...state,
                notifications: state.notifications.map((notification) =>
                  notification.userId === activeUser?.id ? { ...notification, readAt } : notification
                )
              });
            }}
            enableBrowserAlerts={handleEnableNotifications}
            canEnableBrowserAlerts={platformAdapters.notification.canRequestPermission()}
            text={text}
            locale={locale}
          />
        )}
      </main>
      {cancellationReservation && (
        <CancellationModal
          reservation={cancellationReservation}
          listing={state.listings.find((listing) => listing.id === cancellationReservation.listingId)}
          activeUserId={activeUser?.id ?? ""}
          onClose={() => setCancellationRequestId(null)}
          onConfirm={handleCancelReservation}
          text={text}
        />
      )}
    </div>
  );
}

function LoginRequiredPanel({ view, text }: { view: View; text: Copy }) {
  const panelCopy: Record<Exclude<View, "browse">, { eyebrow: string; title: string; body: string }> = {
    sell: {
      eyebrow: text.accountRequired,
      title: text.loginSellTitle,
      body: text.loginSellBody
    },
    orders: {
      eyebrow: text.accountRequired,
      title: text.loginOrdersTitle,
      body: text.loginOrdersBody
    },
    chat: {
      eyebrow: text.accountRequired,
      title: text.loginChatTitle,
      body: text.loginChatBody
    },
    notifications: {
      eyebrow: text.accountRequired,
      title: text.loginAlertsTitle,
      body: text.loginAlertsBody
    }
  };
  const content = panelCopy[view as Exclude<View, "browse">];

  return (
    <section className="workspace">
      <div className="panel login-required">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.body}</p>
      </div>
    </section>
  );
}

function LanguageControl({
  locale,
  setLocale,
  text
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  text: Copy;
}) {
  return (
    <label className="language-control">
      <span>{text.languageToggle}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    </label>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "nav active" : "nav"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function UserSwitcher({ state, setState, text }: { state: AppState; setState: (state: AppState) => void; text: Copy }) {
  return (
    <label className="user-switcher">
      <span>{text.demoUser}</span>
      <select
        value={state.activeUserId}
        onChange={(event) => setState({ ...state, activeUserId: event.target.value })}
      >
        {state.users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.role === "seller" ? text.sellerRole : text.buyerRole})
          </option>
        ))}
      </select>
    </label>
  );
}

function AccountPanel({
  user,
  message,
  text,
  loginAdapter,
  onMessage,
  onExport,
  onAuthenticated,
  onProfileUpdated,
  onLogout
}: {
  user: User | null;
  message: string;
  text: Copy;
  loginAdapter: LoginAdapter;
  onMessage: (message: string) => void;
  onExport: () => void;
  onAuthenticated: (user: User, state: AppState) => void;
  onProfileUpdated: (user: User, state: AppState) => void;
  onLogout: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [pickupArea, setPickupArea] = useState(user?.pickupArea ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setProfileName(user?.name ?? "");
    setPickupArea(user?.pickupArea ?? "");
    setBio(user?.bio ?? "");
    setProfileOpen(false);
  }, [user]);

  async function requestCode() {
    setPending(true);
    try {
      const result = await loginAdapter.requestEmailCode(email, displayName);
      setEmail(result.email);
      if (result.verificationCode) {
        setCode(result.verificationCode);
        onMessage(`${text.developmentCode} ${result.verificationCode}`);
      } else {
        onMessage(text.checkEmail);
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : text.requestCodeFailed);
    } finally {
      setPending(false);
    }
  }

  async function verifyCode() {
    setPending(true);
    try {
      const result = await loginAdapter.verifyEmailCode(email, code, displayName);
      onAuthenticated(result.user, result.state);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : text.verifyCodeFailed);
    } finally {
      setPending(false);
    }
  }

  async function saveProfile() {
    setPending(true);
    try {
      const result = await loginAdapter.updateProfile({
        displayName: profileName,
        pickupArea,
        bio
      });
      onProfileUpdated(result.user, result.state);
      onMessage(text.profileSaved);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : text.profileSaveFailed);
    } finally {
      setPending(false);
    }
  }

  if (!user) {
    return (
      <section className="account-panel">
        <div className="account-heading">
          <UserRound size={18} />
          <strong>{text.loginOrCreate}</strong>
        </div>
        <p>{text.noPassword}</p>
        {message && <p className="account-message">{message}</p>}
        <label>
          <span>{text.displayName}</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label>
          <span>{text.email}</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="secondary" disabled={pending || !email.trim()} onClick={requestCode}>
          {text.sendLoginCode}
        </button>
        <label>
          <span>{text.verificationCode}</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <button className="primary" disabled={pending || !email.trim() || !code.trim()} onClick={verifyCode}>
          {text.logIn}
        </button>
      </section>
    );
  }

  return (
    <section className="account-panel signed-in">
      <div className="account-summary">
        <div className="account-heading">
          <UserRound size={18} />
          <div>
            <strong>{user.name}</strong>
            <span>{text.emailVerified}</span>
          </div>
        </div>
        <button className="ghost-inline" type="button" onClick={() => setProfileOpen((open) => !open)}>
          {profileOpen ? text.collapseProfile : text.editProfile}
        </button>
      </div>
      {message && <p className="account-message">{message}</p>}
      {profileOpen && (
        <div className="account-profile">
          <label>
            <span>{text.displayName}</span>
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          </label>
          <label>
            <span>{text.pickupArea}</span>
            <input value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} />
          </label>
          <label>
            <span>{text.bio}</span>
            <textarea rows={3} value={bio} onChange={(event) => setBio(event.target.value)} />
          </label>
          <button className="secondary" disabled={pending || !profileName.trim()} onClick={saveProfile}>
            {text.saveProfile}
          </button>
        </div>
      )}
      <div className="account-actions">
        <button className="secondary" disabled={pending} onClick={onExport}>
          <Download size={16} />
          {text.dataExport}
        </button>
        <button className="ghost account-logout" disabled={pending} onClick={onLogout}>
          {text.logOut}
        </button>
      </div>
    </section>
  );
}

function BrowseView({
  listings,
  selectedListing,
  activeUserId,
  query,
  setQuery,
  filters,
  setFilters,
  categories,
  selectListing,
  reserveListing,
  shareListing,
  text,
  locale
}: {
  listings: Listing[];
  selectedListing: Listing | null;
  activeUserId: string;
  query: string;
  setQuery: (query: string) => void;
  filters: BrowseFilters;
  setFilters: (filters: BrowseFilters) => void;
  categories: string[];
  selectListing: (id: string) => void;
  reserveListing: (id: string) => void;
  shareListing: (listing: Listing) => void;
  text: Copy;
  locale: Locale;
}) {
  return (
    <section className="workspace two-column">
      <div className="panel feed">
        <div className="section-header">
          <div>
            <p className="eyebrow">{text.marketplace}</p>
            <h1>{text.browseHeading}</h1>
          </div>
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchListings} />
          </label>
        </div>
        <div className="browse-filters" aria-label={text.browseFilters}>
          <Filter size={18} />
          <label>
            <span>{text.category}</span>
            <select
              value={filters.category}
              onChange={(event) => setFilters({ ...filters, category: event.target.value })}
            >
              <option value="all">{text.allCategories}</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.condition}</span>
            <select
              value={filters.condition}
              onChange={(event) => setFilters({ ...filters, condition: event.target.value })}
            >
              <option value="all">{text.allConditions}</option>
              {["new", "like_new", "good", "fair"].map((condition) => (
                <option key={condition} value={condition}>
                  {statusLabel(condition, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.status}</span>
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="all">{text.allStatuses}</option>
              {["available", "reserved", "paused", "sold"].map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.minPrice}</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={filters.minPrice}
              onChange={(event) => setFilters({ ...filters, minPrice: event.target.value })}
            />
          </label>
          <label>
            <span>{text.maxPrice}</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={filters.maxPrice}
              onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value })}
            />
          </label>
          <label>
            <span>{text.sortBy}</span>
            <select
              value={filters.sort}
              onChange={(event) => setFilters({ ...filters, sort: event.target.value as BrowseSort })}
            >
              <option value="newest">{text.sortNewest}</option>
              <option value="price_asc">{text.sortPriceLow}</option>
              <option value="price_desc">{text.sortPriceHigh}</option>
              <option value="title">{text.sortTitle}</option>
            </select>
          </label>
          <button type="button" className="secondary" onClick={() => setFilters(DEFAULT_BROWSE_FILTERS)}>
            {text.clearFilters}
          </button>
        </div>
        <div className="listing-grid">
          {listings.length === 0 && <p className="empty-state">{text.noFilteredListings}</p>}
          {listings.map((listing) => {
            const itemSummary = getListingItemSummary(listing);
            return (
              <button
                key={listing.id}
                className={selectedListing?.id === listing.id ? "listing-card selected" : "listing-card"}
                onClick={() => selectListing(listing.id)}
              >
                <img src={getPrimaryImage(listing)} alt="" />
                <div>
                  <span className={`badge ${listing.status}`}>{statusLabel(listing.status, locale)}</span>
                  <h2>{listing.title}</h2>
                  <p>${listing.price}</p>
                  {itemSummary.length > 0 && (
                    <>
                      <span className="item-count">{getItemCountText(listing, text)}</span>
                      <ul className="item-summary">
                        {itemSummary.map((item) => (
                          <li key={item.id}>{item.name}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedListing && (
        <article className="panel detail">
          <ListingGallery listing={selectedListing} />
          <div className="detail-copy">
            <span className={`badge ${selectedListing.status}`}>{statusLabel(selectedListing.status, locale)}</span>
            <h2>{selectedListing.title}</h2>
            <p className="price">${selectedListing.price}</p>
            <p>{selectedListing.description}</p>
            {(() => {
              const displayItems = getListingDisplayItems(selectedListing);
              if (displayItems.length === 0) return null;

              return (
                <section className="detail-items">
                  <div className="subsection-header">
                    <div>
                      <span>{text.postItems}</span>
                      <p>{getItemCountText(selectedListing, text)}</p>
                    </div>
                  </div>
                  {displayItems.map((item) => (
                    <article className="detail-item" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        {item.notes && <p>{item.notes}</p>}
                      </div>
                      <div className="detail-item-meta">
                        {formatOptionalPrice(item.price) && <span>{formatOptionalPrice(item.price)}</span>}
                        {item.condition && <span>{statusLabel(item.condition, locale)}</span>}
                      </div>
                    </article>
                  ))}
                </section>
              );
            })()}
            <dl>
              <div>
                <dt>{text.category}</dt>
                <dd>{categoryLabel(selectedListing.category, locale)}</dd>
              </div>
              <div>
                <dt>{text.location}</dt>
                <dd>{selectedListing.location}</dd>
              </div>
            </dl>
            <button
              className="primary sticky-cta"
              disabled={selectedListing.status !== "available" || selectedListing.sellerId === activeUserId}
              onClick={() => reserveListing(selectedListing.id)}
            >
              <ShoppingBag size={18} />
              {selectedListing.sellerId === activeUserId ? text.yourListing : text.reserveItem}
            </button>
            <button className="secondary sticky-cta" onClick={() => shareListing(selectedListing)}>
              <Share2 size={18} />
              {text.share}
            </button>
          </div>
        </article>
      )}
    </section>
  );
}

function ListingGallery({ listing }: { listing: Listing }) {
  return (
    <div className="gallery">
      <img className="hero-image" src={getPrimaryImage(listing)} alt="" />
      <div className="thumb-row">
        {listing.images.map((image) => (
          <img key={image.id} src={image.dataUrl} alt="" />
        ))}
      </div>
    </div>
  );
}

function ListingItemFields({
  draft,
  onChange,
  text,
  locale,
  ariaPrefix
}: {
  draft: ListingDraft;
  onChange: (draft: ListingDraft) => void;
  text: Copy;
  locale: Locale;
  ariaPrefix?: string;
}) {
  const items = Array.isArray(draft.items) ? draft.items : [];
  const canAddItem = items.length < MAX_LISTING_ITEMS;

  function reindex(nextItems: ListingItem[]) {
    return nextItems.map((item, index) => ({ ...item, position: index }));
  }

  function syncDraftItems(nextItems: ListingItem[]) {
    const reindexedItems = reindex(nextItems);
    return {
      ...draft,
      condition: reindexedItems[0]?.condition ?? draft.condition,
      items: reindexedItems
    };
  }

  function updateItem(itemId: string, patch: Partial<ListingItem>) {
    onChange(syncDraftItems(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))));
  }

  function addItem() {
    if (!canAddItem) return;
    onChange(syncDraftItems([...items, createBlankDraftItem(items.length, draft.condition)]));
  }

  function removeItem(itemId: string) {
    const remaining = items.filter((item) => item.id !== itemId);
    onChange(syncDraftItems(remaining));
  }

  return (
    <section className="item-fields">
      <div className="subsection-header">
        <div>
          <span>{text.postItems}</span>
          <p>{text.postItemsHelp}</p>
          <p className="item-total">
            {text.listingTotal}: ${getDraftItemTotal(draft)}
          </p>
        </div>
        <button type="button" className="secondary" onClick={addItem} disabled={!canAddItem}>
          <Package size={16} />
          {text.addItem}
        </button>
      </div>
      {items.map((item, index) => (
        <div className="item-row" key={item.id}>
          <div className="item-row-heading">
            <strong>
              {text.itemSingular} {index + 1}
            </strong>
            <button
              type="button"
              className="ghost-inline"
              onClick={() => removeItem(item.id)}
              disabled={items.length <= 1}
            >
              {text.removeItem}
            </button>
          </div>
          <div className="field-grid">
            <label>
              <span>{text.itemName}</span>
              <input
                aria-label={`${ariaPrefix ? `${ariaPrefix} ` : ""}${text.itemName} ${index + 1}`}
                value={item.name}
                onChange={(event) => updateItem(item.id, { name: event.target.value })}
              />
            </label>
            <label>
              <span>{text.itemPrice}</span>
              <input
                aria-label={`${ariaPrefix ? `${ariaPrefix} ` : ""}${text.itemPrice} ${index + 1}`}
                type="number"
                min="1"
                value={item.price ?? ""}
                onChange={(event) =>
                  updateItem(item.id, {
                    price: event.target.value ? Number(event.target.value) : undefined
                  })
                }
              />
            </label>
            <label>
              <span>{text.itemCondition}</span>
              <select
                aria-label={`${ariaPrefix ? `${ariaPrefix} ` : ""}${text.itemCondition} ${index + 1}`}
                value={item.condition ?? ""}
                onChange={(event) =>
                  updateItem(item.id, {
                    condition: event.target.value as ListingDraft["condition"]
                  })
                }
              >
                {["new", "like_new", "good", "fair"].map((condition) => (
                  <option key={condition} value={condition}>
                    {statusLabel(condition, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{text.itemNotes}</span>
              <input
                aria-label={`${ariaPrefix ? `${ariaPrefix} ` : ""}${text.itemNotes} ${index + 1}`}
                value={item.notes ?? ""}
                onChange={(event) => updateItem(item.id, { notes: event.target.value })}
              />
            </label>
          </div>
        </div>
      ))}
    </section>
  );
}

function SellerSetupPanel({
  setup,
  onChange,
  onSave,
  complete,
  text
}: {
  setup: SellerSetupDraft;
  onChange: (setup: SellerSetupDraft) => void;
  onSave: () => void;
  complete: boolean;
  text: Copy;
}) {
  function patch(field: keyof SellerSetupDraft, value: string) {
    onChange({ ...setup, [field]: value });
  }

  return (
    <section className={complete ? "seller-setup complete" : "seller-setup"}>
      <div className="subsection-header">
        <div>
          <span>{text.sellerSetupTitle}</span>
          <p>{text.sellerSetupHelp}</p>
        </div>
        <span className={`badge ${complete ? "available" : "overdue"}`}>
          {complete ? text.sellerSetupReady : text.sellerSetupRequired}
        </span>
      </div>
      <div className="field-grid">
        <label>
          <span>{text.pickupArea}</span>
          <input value={setup.pickupArea} onChange={(event) => patch("pickupArea", event.target.value)} />
        </label>
        <label>
          <span>{text.responseExpectation}</span>
          <input
            value={setup.responseExpectation}
            onChange={(event) => patch("responseExpectation", event.target.value)}
          />
        </label>
      </div>
      <label>
        <span>{text.offPlatformInstructions}</span>
        <textarea
          rows={3}
          value={setup.offPlatformInstructions}
          onChange={(event) => patch("offPlatformInstructions", event.target.value)}
        />
      </label>
      <label>
        <span>{text.cancellationHandoffPolicy}</span>
        <textarea
          rows={3}
          value={setup.cancellationPolicy}
          onChange={(event) => patch("cancellationPolicy", event.target.value)}
        />
      </label>
      <div className="button-row">
        <button type="button" className="secondary" disabled={!complete} onClick={onSave}>
          {text.saveSellerSetup}
        </button>
      </div>
    </section>
  );
}

function SellView({
  activeUser,
  onCreate,
  onUpdate,
  onSaveSellerSetup,
  listings,
  reservations,
  userNameFor,
  openChat,
  openOrder,
  updateStatus,
  updateReservation,
  requestCancellation,
  imageUploadAdapter,
  text,
  locale
}: {
  activeUser: User | null;
  onCreate: (draft: ListingDraft, sellerSetup: SellerSetupDraft) => Promise<boolean> | boolean;
  onUpdate: (listingId: string, draft: ListingDraft) => Promise<boolean> | boolean;
  onSaveSellerSetup: (draft: SellerSetupDraft) => void;
  listings: Listing[];
  reservations: Reservation[];
  userNameFor: (userId: string) => string;
  openChat: (reservationId: string) => void;
  openOrder: (reservationId: string) => void;
  updateStatus: (listingId: string, status: Exclude<ListingStatus, "reserved">) => void;
  updateReservation: (reservationId: string, status: Reservation["status"]) => void;
  requestCancellation: (reservationId: string) => void;
  imageUploadAdapter: ImageUploadAdapter;
  text: Copy;
  locale: Locale;
}) {
  const [draft, setDraft] = useState<ListingDraft>(createBlankDraft);
  const [sellerSetup, setSellerSetup] = useState<SellerSetupDraft>(() => getSellerSetup(activeUser));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ListingDraft | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [editUploadError, setEditUploadError] = useState("");
  const [editError, setEditError] = useState("");

  useEffect(() => {
    setSellerSetup(getSellerSetup(activeUser));
  }, [activeUser?.id]);

  const sellerListings = activeUser ? listings.filter((listing) => listing.sellerId === activeUser.id) : [];
  const sellerSetupComplete = Boolean(
    sellerSetup.pickupArea.trim() &&
      sellerSetup.offPlatformInstructions.trim() &&
      sellerSetup.responseExpectation.trim() &&
      sellerSetup.cancellationPolicy.trim()
  );
  const canPublish =
    sellerSetupComplete &&
    draft.title.trim() &&
    draft.description.trim() &&
    draft.location.trim() &&
    draft.images.length > 0 &&
    hasPublishableItems(draft);
  const editingListing = sellerListings.find((listing) => listing.id === editingId);
  const canSaveEdit = Boolean(
    editDraft &&
    editingListing &&
    editingListing.status !== "sold" &&
    editingListing.status !== "reserved" &&
    editDraft.title.trim() &&
    editDraft.description.trim() &&
    editDraft.category.trim() &&
    editDraft.location.trim() &&
    editDraft.images.length > 0 &&
    editDraft.images.length <= 6 &&
    hasPublishableItems(editDraft)
  );

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setUploadError("");
    try {
      const { images, rejected } = await imageUploadAdapter.readImages(files, {
        maxBytes: MAX_IMAGE_BYTES,
        remainingSlots: 6 - draft.images.length
      });
      if (rejected.length > 0) {
        setUploadError(text.imageUploadLimit);
      }
      setDraft({ ...draft, images: [...draft.images, ...images] });
    } catch {
      setUploadError(text.imageReadFailed);
    }
  }

  async function handleEditFiles(files: FileList | null) {
    if (!files || !editDraft) return;
    setEditUploadError("");
    try {
      const { images, rejected } = await imageUploadAdapter.readImages(files, {
        maxBytes: MAX_IMAGE_BYTES,
        remainingSlots: 6 - editDraft.images.length
      });
      if (rejected.length > 0) {
        setEditUploadError(text.imageUploadLimit);
      }
      setEditDraft({ ...editDraft, images: [...editDraft.images, ...images] });
    } catch {
      setEditUploadError(text.imageReadFailed);
    }
  }

  function startEditing(listing: Listing) {
    if (listing.status === "sold" || listing.status === "reserved") return;
    setEditingId(listing.id);
    setEditDraft(listingToDraft(listing));
    setEditError("");
    setEditUploadError("");
  }

  async function saveEdit() {
    if (!editingId || !editDraft || !canSaveEdit) return;
    setEditError("");
    const saved = await onUpdate(editingId, editDraft);
    if (saved) {
      setEditingId(null);
      setEditDraft(null);
    } else {
      setEditError(text.listingUpdateFailed);
    }
  }

  return (
    <section className="workspace two-column">
      <form
        className="panel form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canPublish) return;
          const created = await onCreate(draft, sellerSetup);
          if (created) {
            setDraft(createBlankDraft());
          }
        }}
      >
        <div className="section-header">
          <div>
            <p className="eyebrow">{text.sell}</p>
            <h1>{text.createListing}</h1>
          </div>
        </div>
        <SellerSetupPanel
          setup={sellerSetup}
          onChange={setSellerSetup}
          onSave={() => onSaveSellerSetup(sellerSetup)}
          complete={sellerSetupComplete}
          text={text}
        />
        <label>
          <span>{text.images}</span>
          <input
            className="file-input"
            type="file"
            accept={imageUploadAdapter.accept}
            multiple
            onChange={(event) => handleFiles(event.target.files)}
          />
        </label>
        <div className="upload-strip">
          {draft.images.map((image) => (
            <button
              type="button"
              key={image.id}
              onClick={() => setDraft({ ...draft, images: draft.images.filter((item) => item.id !== image.id) })}
            >
              <img src={image.dataUrl} alt="" />
            </button>
          ))}
          {draft.images.length === 0 && (
            <div className="empty-upload">
              <ImagePlus size={26} />
              <span>{text.addImages}</span>
            </div>
          )}
        </div>
        {uploadError && <p className="form-error">{uploadError}</p>}
        <div className="field-grid">
          <label>
            <span>{text.title}</span>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label>
            <span>{text.category}</span>
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
              {["Furniture", "Electronics", "Clothing", "Home", "Outdoor"].map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          <span>{text.pickupNotes}</span>
          <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
        </label>
        <label>
          <span>{text.description}</span>
          <textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            rows={5}
          />
        </label>
        <ListingItemFields draft={draft} onChange={setDraft} text={text} locale={locale} />
        <button className="primary" disabled={!canPublish}>
          <Package size={18} />
          {text.publishListing}
        </button>
      </form>

      <aside className="panel compact-list">
        <p className="eyebrow">{text.myListings}</p>
        <h2>{activeUser?.name ?? text.accountRequired}</h2>
        {sellerListings.map((listing) => {
          const activeReservation = reservations.find(
            (reservation) =>
              reservation.listingId === listing.id && ACTIVE_RESERVATION_STATUSES.includes(reservation.status)
          );
          const selectableStatus = listing.status === "reserved" ? "reserved" : listing.status;
          const isTerminal = listing.status === "sold";

          return (
            <div className="row listing-management-row" key={listing.id}>
              <img src={getPrimaryImage(listing)} alt="" />
              <div>
                <strong>{listing.title}</strong>
                <p className="muted">{getListingMetaParts(listing, text).join(" · ")}</p>
                <span className={`badge ${listing.status}`}>{statusLabel(listing.status, locale)}</span>
                {activeReservation && (
                  <div className="reservation-context">
                    <div>
                      <p className="muted">{text.reservedHelp}</p>
                      <p>
                        {text.buyer} {userNameFor(activeReservation.buyerId)} · {text.holdExpires}{" "}
                        {new Date(activeReservation.paymentDueAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={`badge ${activeReservation.status}`}>
                      {statusLabel(activeReservation.status, locale)}
                    </span>
                    <div className="button-row reservation-shortcuts">
                      <button type="button" className="secondary" onClick={() => openChat(activeReservation.id)}>
                        <MessageSquare size={16} />
                        {text.openChat}
                      </button>
                      <button type="button" className="secondary" onClick={() => openOrder(activeReservation.id)}>
                        <ShoppingBag size={16} />
                        {text.openPickedItem}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => updateReservation(activeReservation.id, "sold")}
                      >
                        {text.completeHandoff}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => requestCancellation(activeReservation.id)}
                      >
                        {text.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="listing-actions">
                <label className="status-control">
                  <span>{text.status}</span>
                  <select
                    aria-label={`Status for ${listing.title}`}
                    value={selectableStatus}
                    disabled={Boolean(activeReservation) || isTerminal}
                    onChange={(event) =>
                      updateStatus(listing.id, event.target.value as Exclude<ListingStatus, "reserved">)
                    }
                  >
                    {listing.status === "reserved" && (
                      <option value="reserved" disabled>
                        {statusLabel("reserved", locale)}
                      </option>
                    )}
                    <option value="available">{statusLabel("available", locale)}</option>
                    <option value="paused">{statusLabel("paused", locale)}</option>
                    <option value="sold">{statusLabel("sold", locale)}</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={isTerminal || Boolean(activeReservation)}
                  onClick={() => startEditing(listing)}
                >
                  {text.edit}
                </button>
              </div>
              {editingId === listing.id && editDraft && (
                <form
                  className="listing-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveEdit();
                  }}
                >
                  <label>
                    <span>{text.images}</span>
                    <input
                      className="file-input"
                      type="file"
                      accept={imageUploadAdapter.accept}
                      multiple
                      onChange={(event) => handleEditFiles(event.target.files)}
                    />
                  </label>
                  <div className="upload-strip">
                    {editDraft.images.map((image) => (
                      <button
                        type="button"
                        key={image.id}
                        onClick={() =>
                          setEditDraft({
                            ...editDraft,
                            images: editDraft.images.filter((item) => item.id !== image.id)
                          })
                        }
                      >
                        <img src={image.dataUrl} alt="" />
                      </button>
                    ))}
                    {editDraft.images.length === 0 && (
                      <div className="empty-upload">
                        <ImagePlus size={26} />
                        <span>{text.addImages}</span>
                      </div>
                    )}
                  </div>
                  {editUploadError && <p className="form-error">{editUploadError}</p>}
                  <div className="field-grid">
                    <label>
                      <span>{text.title}</span>
                      <input
                        aria-label={`Edit title for ${listing.title}`}
                        value={editDraft.title}
                        onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>{text.category}</span>
                      <select
                        aria-label={`Edit category for ${listing.title}`}
                        value={editDraft.category}
                        onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })}
                      >
                        {["Furniture", "Electronics", "Clothing", "Home", "Outdoor"].map((category) => (
                          <option key={category} value={category}>
                            {categoryLabel(category, locale)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>{text.pickupNotes}</span>
                    <input
                      aria-label={`Edit pickup or shipping notes for ${listing.title}`}
                      value={editDraft.location}
                      onChange={(event) => setEditDraft({ ...editDraft, location: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{text.description}</span>
                    <textarea
                      aria-label={`Edit description for ${listing.title}`}
                      value={editDraft.description}
                      onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                      rows={4}
                    />
                  </label>
                  <ListingItemFields
                    draft={editDraft}
                    onChange={setEditDraft}
                    text={text}
                    locale={locale}
                    ariaPrefix={`Edit ${listing.title}`}
                  />
                  {editError && <p className="form-error">{editError}</p>}
                  <div className="button-row">
                    <button className="primary" disabled={!canSaveEdit}>
                      {text.saveChanges}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft(null);
                        setEditError("");
                      }}
                    >
                      {text.cancel}
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
        {sellerListings.length === 0 && <p className="muted">{text.noListings}</p>}
      </aside>
    </section>
  );
}

function HandoffPlanPanel({
  reservation,
  onSave,
  canEdit,
  text
}: {
  reservation: Reservation;
  onSave: (draft: HandoffPlanDraft) => void;
  canEdit: boolean;
  text: Copy;
}) {
  const currentPlan = getReservationHandoffPlan(reservation);
  const [draft, setDraft] = useState<HandoffPlanDraft>({
    mode: currentPlan?.mode ?? "pickup",
    window: currentPlan?.window ?? "",
    locationOrTracking: currentPlan?.locationOrTracking ?? "",
    note: currentPlan?.note ?? ""
  });
  const canSave = Boolean(draft.window.trim() && draft.locationOrTracking.trim());

  useEffect(() => {
    setDraft({
      mode: currentPlan?.mode ?? "pickup",
      window: currentPlan?.window ?? "",
      locationOrTracking: currentPlan?.locationOrTracking ?? "",
      note: currentPlan?.note ?? ""
    });
  }, [reservation.id, currentPlan?.updatedAt]);

  return (
    <section className="handoff-plan">
      <div className="handoff-plan-header">
        <CalendarClock size={18} />
        <div>
          <strong>{text.handoffPlan}</strong>
          {currentPlan?.updatedAt && <p>{text.updated} {new Date(currentPlan.updatedAt).toLocaleString()}</p>}
        </div>
      </div>
      {currentPlan && (
        <dl className="handoff-summary">
          <div>
            <dt>{text.handoffMode}</dt>
            <dd>{currentPlan.mode === "shipping" ? text.shipping : text.pickup}</dd>
          </div>
          <div>
            <dt>{text.handoffWindow}</dt>
            <dd>{currentPlan.window}</dd>
          </div>
          <div>
            <dt>{currentPlan.mode === "shipping" ? text.tracking : text.handoffLocation}</dt>
            <dd>{currentPlan.locationOrTracking}</dd>
          </div>
          {currentPlan.note && (
            <div>
              <dt>{text.handoffNote}</dt>
              <dd>{currentPlan.note}</dd>
            </div>
          )}
        </dl>
      )}
      {canEdit && (
        <div className="handoff-form">
          <div className="field-grid">
            <label>
              <span>{text.handoffMode}</span>
              <select
                value={draft.mode}
                onChange={(event) => setDraft({ ...draft, mode: event.target.value as HandoffPlanDraft["mode"] })}
              >
                <option value="pickup">{text.pickup}</option>
                <option value="shipping">{text.shipping}</option>
              </select>
            </label>
            <label>
              <span>{text.handoffWindow}</span>
              <input value={draft.window} onChange={(event) => setDraft({ ...draft, window: event.target.value })} />
            </label>
          </div>
          <label>
            <span>{draft.mode === "shipping" ? text.tracking : text.handoffLocation}</span>
            <input
              value={draft.locationOrTracking}
              onChange={(event) => setDraft({ ...draft, locationOrTracking: event.target.value })}
            />
          </label>
          <label>
            <span>{text.handoffNote}</span>
            <textarea
              rows={2}
              value={draft.note ?? ""}
              onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            />
          </label>
          <button type="button" className="secondary" disabled={!canSave} onClick={() => onSave(draft)}>
            <Truck size={16} />
            {text.saveHandoffPlan}
          </button>
        </div>
      )}
    </section>
  );
}

function OrdersView({
  state,
  reservations,
  activeUserId,
  selectedReservationId,
  openChat,
  updateHandoffPlan,
  updateStatus,
  requestCancellation,
  coordinationNotice,
  text,
  locale
}: {
  state: AppState;
  reservations: Reservation[];
  activeUserId: string;
  selectedReservationId?: string;
  openChat: (id: string) => void;
  updateHandoffPlan: (reservationId: string, draft: HandoffPlanDraft) => void;
  updateStatus: (reservationId: string, status: Reservation["status"]) => void;
  requestCancellation: (reservationId: string) => void;
  coordinationNotice: string;
  text: Copy;
  locale: Locale;
}) {
  return (
    <section className="workspace">
      <div className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">{text.pickedItems}</p>
            <h1>{text.ordersHeading}</h1>
            <p className="muted">{coordinationNotice}</p>
          </div>
        </div>
        <div className="orders">
          {reservations.map((reservation) => {
            const listing = state.listings.find((item) => item.id === reservation.listingId);
            const isSeller = reservation.sellerId === activeUserId;
            const canCancel = !isTerminalReservation(reservation.status);
            const cancellation = getReservationCancellation(reservation);
            return (
              <article
                className={reservation.id === selectedReservationId ? "order-card active-order" : "order-card"}
                key={reservation.id}
              >
                <img src={listing ? getPrimaryImage(listing) : undefined} alt="" />
                <div>
                  <span className={`badge ${reservation.status}`}>{statusLabel(reservation.status, locale)}</span>
                  <h2>{listing?.title ?? text.deletedListing}</h2>
                  {listing && getItemCountText(listing, text) && (
                    <p className="muted">{getItemCountText(listing, text)}</p>
                  )}
                  <p>{text.holdExpires} {new Date(reservation.paymentDueAt).toLocaleString()}</p>
                  <p className="muted">
                    {text.buyer} {getUserName(state, reservation.buyerId)} · {text.seller} {getUserName(state, reservation.sellerId)}
                  </p>
                  <HandoffPlanPanel
                    reservation={reservation}
                    onSave={(draft) => updateHandoffPlan(reservation.id, draft)}
                    canEdit={!isTerminalReservation(reservation.status)}
                    text={text}
                  />
                  {reservation.status === "cancelled" && cancellation.reason && (
                    <p className="muted">
                      {text.cancellationReason}: {cancellation.reason}
                    </p>
                  )}
                  <div className="button-row">
                    <button className="secondary" onClick={() => openChat(reservation.id)}>
                      <MessageSquare size={16} />
                      {text.chat}
                    </button>
                    {isSeller && !isTerminalReservation(reservation.status) && (
                      <>
                        <button className="secondary" onClick={() => updateStatus(reservation.id, "sold")}>
                          {text.completeHandoff}
                        </button>
                      </>
                    )}
                    {canCancel && (
                      <button className="secondary" onClick={() => requestCancellation(reservation.id)}>
                        {text.cancelReservation}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {reservations.length === 0 && <p className="muted">{text.noReservations}</p>}
        </div>
      </div>
    </section>
  );
}

function ChatView({
  state,
  activeUserId,
  selectedReservation,
  selectReservation,
  reservations,
  send,
  updateStatus,
  requestCancellation,
  text,
  locale
}: {
  state: AppState;
  activeUserId: string;
  selectedReservation?: Reservation;
  selectReservation: (id: string) => void;
  reservations: Reservation[];
  send: (reservationId: string, body: string) => void;
  updateStatus: (reservationId: string, status: Reservation["status"]) => void;
  requestCancellation: (reservationId: string) => void;
  text: Copy;
  locale: Locale;
}) {
  const [body, setBody] = useState("");
  const messages = state.messages.filter((message) => message.reservationId === selectedReservation?.id);
  const listing = state.listings.find((item) => item.id === selectedReservation?.listingId);
  const isSeller = selectedReservation?.sellerId === activeUserId;
  const canResolveReservation = Boolean(
    selectedReservation && isSeller && !isTerminalReservation(selectedReservation.status)
  );

  return (
    <section className="workspace chat-layout">
      <aside className="panel compact-list">
        <p className="eyebrow">{text.threads}</p>
        {reservations.map((reservation) => {
          const item = state.listings.find((listingItem) => listingItem.id === reservation.listingId);
          return (
            <button
              className={reservation.id === selectedReservation?.id ? "thread active-thread" : "thread"}
              key={reservation.id}
              onClick={() => selectReservation(reservation.id)}
            >
              <img src={item ? getPrimaryImage(item) : undefined} alt="" />
              <span>{item?.title ?? text.deletedListing}</span>
              {item && getItemCountText(item, text) && <small>{getItemCountText(item, text)}</small>}
            </button>
          );
        })}
      </aside>
      <div className="panel chat-panel">
        {selectedReservation && listing ? (
          <>
            <header className="chat-header">
              <img src={getPrimaryImage(listing)} alt="" />
              <div>
                <h1>{listing.title}</h1>
                <p>{getParticipantSummary(listing, selectedReservation, state, text).join(" · ")}</p>
              </div>
              <span className={`badge ${selectedReservation.status}`}>{statusLabel(selectedReservation.status, locale)}</span>
            </header>
            <div className="messages">
              {messages.map((message) => (
                <div key={message.id} className={message.senderId === activeUserId ? "message mine" : "message"}>
                  <span>{getUserName(state, message.senderId)}</span>
                  <p>{message.body}</p>
                </div>
              ))}
            </div>
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                send(selectedReservation.id, body);
                setBody("");
              }}
            >
              <input value={body} onChange={(event) => setBody(event.target.value)} placeholder={text.writeMessage} />
              <button className="primary">{text.send}</button>
            </form>
            {getReservationHandoffPlan(selectedReservation) && (
              <HandoffPlanPanel
                reservation={selectedReservation}
                onSave={() => undefined}
                canEdit={false}
                text={text}
              />
            )}
            <div className="button-row chat-actions">
              {canResolveReservation && (
                <>
                  <button className="secondary" onClick={() => updateStatus(selectedReservation.id, "sold")}>
                    {text.completeHandoff}
                  </button>
                </>
              )}
              {selectedReservation && !isTerminalReservation(selectedReservation.status) && (
                <button className="secondary" onClick={() => requestCancellation(selectedReservation.id)}>
                  {text.cancelReservation}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="muted">{text.chatEmpty}</p>
        )}
      </div>
    </section>
  );
}

function CancellationModal({
  reservation,
  listing,
  activeUserId,
  onClose,
  onConfirm,
  text
}: {
  reservation: Reservation;
  listing?: Listing;
  activeUserId: string;
  onClose: () => void;
  onConfirm: (reservationId: string, reason: string) => void;
  text: Copy;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const role = reservation.sellerId === activeUserId ? text.sellerRole : text.buyerRole;
  const finalReason = [reason, details.trim()].filter(Boolean).join(": ");

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="cancel-reservation-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{role}</p>
            <h1 id="cancel-reservation-title">{text.cancelReservation}</h1>
          </div>
          <button className="secondary icon-button" type="button" aria-label={text.closeModal} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="muted">{listing?.title ?? text.deletedListing}</p>
        <label>
          <span>{text.cancellationReason}</span>
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">{text.chooseCancellationReason}</option>
            <option value={text.reasonChangedPlans}>{text.reasonChangedPlans}</option>
            <option value={text.reasonNoResponse}>{text.reasonNoResponse}</option>
            <option value={text.reasonUnavailable}>{text.reasonUnavailable}</option>
            <option value={text.reasonOther}>{text.reasonOther}</option>
          </select>
        </label>
        <label>
          <span>{text.cancellationDetails}</span>
          <textarea rows={4} value={details} onChange={(event) => setDetails(event.target.value)} />
        </label>
        <div className="button-row modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {text.keepReservation}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!finalReason.trim()}
            onClick={() => onConfirm(reservation.id, finalReason)}
          >
            {text.confirmCancellation}
          </button>
        </div>
      </section>
    </div>
  );
}

function NotificationsView({
  state,
  activeUserId,
  markAllRead,
  enableBrowserAlerts,
  canEnableBrowserAlerts,
  text,
  locale
}: {
  state: AppState;
  activeUserId: string;
  markAllRead: () => void;
  enableBrowserAlerts: () => void;
  canEnableBrowserAlerts: boolean;
  text: Copy;
  locale: Locale;
}) {
  const unreadNotifications = state.notifications.filter(
    (notification) => notification.userId === activeUserId && !notification.readAt
  );

  return (
    <section className="workspace">
      <div className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">{text.notifications}</p>
            <h1>{text.notificationsHeading}</h1>
          </div>
          <div className="button-row">
            {canEnableBrowserAlerts && (
              <button className="secondary" onClick={enableBrowserAlerts}>
                <Bell size={16} />
                {text.enableAlerts}
              </button>
            )}
            <button className="secondary" disabled={unreadNotifications.length === 0} onClick={markAllRead}>
              <CheckCircle2 size={16} />
              {text.markRead}
            </button>
          </div>
        </div>
        <div className="notifications">
          {unreadNotifications.map((notification) => (
            <article className="notice unread" key={notification.id}>
              <span className={`badge ${notification.type}`}>{statusLabel(notification.type, locale)}</span>
              <h2>{notification.title}</h2>
              <p>{notification.body}</p>
              <time>{new Date(notification.createdAt).toLocaleString()}</time>
            </article>
          ))}
          {unreadNotifications.length === 0 && <p className="muted">{text.noUnread}</p>}
        </div>
      </div>
    </section>
  );
}
