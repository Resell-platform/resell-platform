import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare,
  RefreshCcw,
  Search,
  Settings,
  ShoppingBag,
  Type,
  Upload,
  X
} from "lucide-react";
import {
  cancelReservation,
  computeHoldExpirationNotifications,
  createListing,
  getUserName,
  loadState,
  resetState,
  reserveListing,
  saveLocalFeedback,
  saveState,
  sendMessage,
  updateListingDetails,
  updateListingStatus,
  updateReservationHandoffPlan,
  updateReservationStatus,
  updateSellerSetup,
  type HandoffPlanDraft,
  type SellerSetupDraft
} from "./data/store";
import {
  connectRealtimeSocket,
  createRemoteListing,
  exportRemoteData,
  fetchRemoteSession,
  fetchRemoteState,
  markRemoteNotificationsRead,
  reserveRemoteListing,
  sendRemoteMessage,
  submitRemoteFeedback,
  updateRemoteListing,
  updateRemoteListingStatus,
  updateRemoteProfile,
  updateRemoteReservationHandoff,
  updateRemoteReservationStatus,
  type RealtimeEvent
} from "./data/remoteApi";
import type {
  AppState,
  FeedbackDraft,
  Listing,
  ListingDraft,
  ListingStatus,
  Reservation,
  User
} from "./data/types";
import { copy, type Locale } from "./i18n";
import {
  buildListingSharePayload,
  createWebPlatformAdapters
} from "./platform/adapters";
import type { BrowseFilters, TextScale, View } from "./types/app";
import {
  ACTIVE_RESERVATION_STATUSES,
  DEFAULT_BROWSE_FILTERS,
  TEXT_SCALES,
  TEXT_SCALE_STORAGE_KEY
} from "./utils/appConstants";
import {
  getInitialLocale,
  getInitialTextScale,
  parseRealtimeEvent
} from "./utils/appHelpers";
import { createBrowseListingViewModel } from "./utils/listingHelpers";
import {
  createLocalExport,
  downloadJson,
  emptyCloudState
} from "./utils/exportHelpers";
import { useNarrowLayout } from "./hooks/useNarrowLayout";

import { LanguageControl } from "./components/common/LanguageControl";
import { LoginRequiredPanel } from "./components/common/LoginRequiredPanel";
import { NavButton } from "./components/common/NavButton";
import { UserSwitcher } from "./components/common/UserSwitcher";
import { BrowseView } from "./components/browse/BrowseView";
import { SellView } from "./components/sell/SellView";
import { OrdersView } from "./components/orders/OrdersView";
import { ChatView } from "./components/chat/ChatView";
import { NotificationsView } from "./components/notifications/NotificationsView";
import { AccountPanel } from "./components/account/AccountPanel";
import { FeedbackModal } from "./components/modals/FeedbackModal";
import { CancellationModal } from "./components/modals/CancellationModal";

const platformAdapters = createWebPlatformAdapters();

export default function App() {
  const allowLocalFallback = import.meta.env.DEV;
  const isNarrowLayout = useNarrowLayout();
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
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [textScale, setTextScale] = useState<TextScale>(getInitialTextScale);
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
    window.localStorage.setItem(TEXT_SCALE_STORAGE_KEY, textScale);
  }, [textScale]);

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

  const activeUser = useMemo(
    () =>
      dataSource === "cloudflare"
        ? sessionUser
        : state.users.find((user) => user.id === state.activeUserId) ?? state.users[0],
    [dataSource, sessionUser, state.activeUserId, state.users]
  );

  const browseListingIndex = useMemo(
    () => state.listings.map((listing) => createBrowseListingViewModel(listing)),
    [state.listings]
  );

  const listingCategories = useMemo(
    () => Array.from(new Set(state.listings.map((listing) => listing.category))).sort(),
    [state.listings]
  );

  const visibleBrowseListings = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const minPrice = Number.parseFloat(browseFilters.minPrice);
    const maxPrice = Number.parseFloat(browseFilters.maxPrice);
    return browseListingIndex
      .filter(({ listing, searchFields }) => {
        if (browseFilters.category !== "all" && listing.category !== browseFilters.category) return false;
        if (browseFilters.condition !== "all" && listing.condition !== browseFilters.condition) return false;
        if (browseFilters.status !== "all" && listing.status !== browseFilters.status) return false;
        if (!Number.isNaN(minPrice) && listing.price < minPrice) return false;
        if (!Number.isNaN(maxPrice) && listing.price > maxPrice) return false;
        if (!normalized) return true;
        return searchFields.some((field) => field.includes(normalized));
      })
      .sort((first, second) => {
        if (browseFilters.sort === "price_asc") return first.listing.price - second.listing.price;
        if (browseFilters.sort === "price_desc") return second.listing.price - first.listing.price;
        if (browseFilters.sort === "title") return first.listing.title.localeCompare(second.listing.title);
        return second.updatedAtMs - first.updatedAtMs;
      });
  }, [browseFilters, browseListingIndex, query]);

  const selectedBrowseListing = useMemo(
    () =>
      visibleBrowseListings.find(({ listing }) => listing.id === selectedListingId) ??
      visibleBrowseListings[0] ??
      null,
    [selectedListingId, visibleBrowseListings]
  );

  const selectedListing = selectedBrowseListing?.listing ?? null;

  const userReservations = useMemo(
    () =>
      activeUser
        ? state.reservations.filter(
            (reservation) => reservation.sellerId === activeUser.id || reservation.buyerId === activeUser.id
          )
        : [],
    [activeUser?.id, state.reservations]
  );

  const selectedReservation = useMemo(
    () =>
      userReservations.find((reservation) => reservation.id === selectedReservationId) ??
      userReservations[0],
    [selectedReservationId, userReservations]
  );

  const unreadCount = useMemo(
    () =>
      state.notifications.filter(
        (notification) => activeUser && notification.userId === activeUser.id && !notification.readAt
      ).length,
    [activeUser?.id, state.notifications]
  );

  const cancellationReservation = useMemo(
    () => userReservations.find((reservation) => reservation.id === cancellationRequestId) ?? null,
    [cancellationRequestId, userReservations]
  );

  const feedbackSourceLabel: Record<View, string> = {
    browse: text.browseFeedbackSource,
    sell: text.sellFeedbackSource,
    orders: text.ordersFeedbackSource,
    chat: text.chatFeedbackSource,
    notifications: text.notificationsFeedbackSource
  };

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
    setMobileSettingsOpen(false);
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
    const findBuyerThread = (reservations: Reservation[], buyerId?: string) =>
      reservations.find(
        (item) =>
          item.listingId === listingId &&
          item.buyerId === buyerId &&
          ACTIVE_RESERVATION_STATUSES.includes(item.status)
      );

    if (dataSource === "cloudflare") {
      if (!sessionUser) {
        promptLogin(text.loginReserve);
        return;
      }
      const beforeIds = new Set(state.reservations.map((reservation) => reservation.id));
      const next = await runRemoteAction(() => reserveRemoteListing(listingId));
      const reservation = next.reservations.find(
        (item) => item.listingId === listingId && item.buyerId === sessionUser.id && !beforeIds.has(item.id)
      ) ?? findBuyerThread(next.reservations, sessionUser.id);
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
      ) ?? findBuyerThread(next.reservations, activeUser?.id);
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
        if (sessionUser.role === "seller" && sellerSetup) {
          const result = await updateRemoteProfile({
            displayName: sessionUser.name,
            bio: sessionUser.bio,
            pickupArea: sellerSetup.pickupArea,
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
      activeUser?.role === "seller" && sellerSetup ? updateSellerSetup(state, activeUser.id, sellerSetup) : state;
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

  async function handleSubmitFeedback(
    draft: Omit<FeedbackDraft, "sourceView" | "entityType" | "entityId" | "pageUrl" | "locale" | "dataSource">
  ) {
    const feedbackDraft: FeedbackDraft = {
      ...draft,
      sourceView: view,
      entityType:
        view === "browse" && selectedListing
          ? "listing"
          : (view === "orders" || view === "chat") && selectedReservation
            ? "reservation"
            : undefined,
      entityId:
        view === "browse" && selectedListing
          ? selectedListing.id
          : (view === "orders" || view === "chat") && selectedReservation
            ? selectedReservation.id
            : undefined,
      pageUrl: window.location.href,
      locale,
      dataSource
    };

    if (dataSource === "cloudflare") {
      await submitRemoteFeedback(feedbackDraft);
    } else {
      saveLocalFeedback(feedbackDraft);
    }

    setFeedbackOpen(false);
    setAuthMessage(text.feedbackSent);
  }

  const textScaleLabels: Record<TextScale, string> = {
    compact: text.compactText,
    default: text.defaultText,
    large: text.largeText
  };

  return (
    <div className={`app text-scale-${textScale} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
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
        {!isNarrowLayout && <LanguageControl locale={locale} setLocale={setLocale} text={text} />}
        {!isNarrowLayout && dataSource === "local" && <div className="data-source">{text.localDemo}</div>}
        {!isNarrowLayout && dataSource === "local" ? (
          <>
            <UserSwitcher state={state} setState={setState} text={text} />
            <button className="secondary" onClick={handleExportData}>
              <Download size={16} />
              {text.dataExport}
            </button>
          </>
        ) : null}
        <nav>
          <NavButton
            icon={<Search />}
            label={text.browse}
            active={view === "browse"}
            onClick={() => {
              setMobileSettingsOpen(false);
              setView("browse");
            }}
          />
          <NavButton
            icon={<Upload />}
            label={text.post}
            active={view === "sell"}
            onClick={() => openProtectedView("sell", text.loginSellAction)}
          />
          <NavButton
            icon={<ShoppingBag />}
            label={isNarrowLayout ? text.pickedItems : text.picked}
            active={view === "orders"}
            onClick={() => openProtectedView("orders", text.loginOrdersAction)}
          />
          <NavButton
            icon={<MessageSquare />}
            label={text.chat}
            active={view === "chat"}
            onClick={() => openProtectedView("chat", text.loginChatAction)}
          />
          {!isNarrowLayout && (
            <NavButton
              icon={<Bell />}
              label={`${text.alerts}${unreadCount ? ` (${unreadCount})` : ""}`}
              active={view === "notifications"}
              onClick={() => openProtectedView("notifications", text.loginAlertsAction)}
            />
          )}
        </nav>
        {!isNarrowLayout && (
          <button
            className="nav feedback-nav"
            type="button"
            onClick={() => {
              setMobileSettingsOpen(false);
              setFeedbackOpen(true);
            }}
          >
            <MessageSquare />
            <span>{text.feedback}</span>
          </button>
        )}
        {!isNarrowLayout && dataSource === "local" && (
          <button className="ghost reset" onClick={() => setState(computeHoldExpirationNotifications(resetState()))}>
            <RefreshCcw size={16} />
            {text.resetDemo}
          </button>
        )}
      </aside>

      <main className="main">
        <header className="mobile-app-header" aria-hidden={!isNarrowLayout}>
          <div className="brand mobile-brand">
            <img className="brand-mark" src="/brand/icon-192.png" alt="" />
            <span>Resell</span>
          </div>
          <div className="mobile-header-actions">
            <button
              className="mobile-icon-button secondary"
              type="button"
              aria-label={`${text.alerts}${unreadCount ? ` (${unreadCount})` : ""}`}
              onClick={() => openProtectedView("notifications", text.loginAlertsAction)}
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="notification-dot">{unreadCount}</span>}
            </button>
            <button
              className="mobile-icon-button secondary"
              type="button"
              aria-label={text.settings}
              aria-expanded={mobileSettingsOpen}
              onClick={() => setMobileSettingsOpen((open) => !open)}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>
        {isNarrowLayout && mobileSettingsOpen && (
          <section className="mobile-settings-sheet" aria-label={text.settings}>
            <div className="mobile-settings-header">
              <div>
                <p className="eyebrow">{text.settings}</p>
                {dataSource === "local" && <strong>{text.localDemo}</strong>}
              </div>
              <button
                className="mobile-icon-button secondary"
                type="button"
                aria-label={text.closeModal}
                onClick={() => setMobileSettingsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="text-size-control" aria-label={text.textSize}>
              <div className="text-size-heading">
                <Type size={18} />
                <span>{text.textSize}</span>
              </div>
              <div className="segmented-control">
                {TEXT_SCALES.map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    className={textScale === scale ? "active" : ""}
                    aria-pressed={textScale === scale}
                    onClick={() => setTextScale(scale)}
                  >
                    {textScaleLabels[scale]}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setFeedbackOpen(true);
                setMobileSettingsOpen(false);
              }}
            >
              <MessageSquare size={16} />
              {text.feedback}
            </button>
            {dataSource === "local" ? (
              <>
                <UserSwitcher state={state} setState={setState} text={text} />
                <button className="secondary" onClick={handleExportData}>
                  <Download size={16} />
                  {text.dataExport}
                </button>
                <button className="secondary" onClick={() => setState(computeHoldExpirationNotifications(resetState()))}>
                  <RefreshCcw size={16} />
                  {text.resetDemo}
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
                  setMobileSettingsOpen(false);
                }}
              />
            )}
            <LanguageControl locale={locale} setLocale={setLocale} text={text} />
          </section>
        )}
        {!isNarrowLayout && dataSource === "cloudflare" ? (
          <AccountPanel
            className="desktop-account-bar"
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
        ) : null}
        {actionError && <p className="global-error">{actionError}</p>}
        {authMessage && (dataSource === "local" || isNarrowLayout) && <p className="global-message">{authMessage}</p>}
        {view === "browse" && (
          <BrowseView
            listings={visibleBrowseListings}
            selectedListing={selectedBrowseListing}
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
      {feedbackOpen && (
        <FeedbackModal
          user={activeUser}
          sourceLabel={feedbackSourceLabel[view]}
          onClose={() => setFeedbackOpen(false)}
          onSubmit={handleSubmitFeedback}
          text={text}
        />
      )}
    </div>
  );
}
