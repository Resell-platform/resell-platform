import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ImagePlus,
  MessageSquare,
  Package,
  RefreshCcw,
  Search,
  ShoppingBag,
  Store,
  Upload,
  UserRound
} from "lucide-react";
import {
  computeOverdueNotifications,
  createId,
  createListing,
  getPrimaryImage,
  getUserName,
  loadState,
  reserveListing,
  resetState,
  saveState,
  sendMessage,
  updateReservationStatus
} from "./data/store";
import {
  createRemoteListing,
  fetchRemoteState,
  markRemoteNotificationsRead,
  reserveRemoteListing,
  sendRemoteMessage,
  updateRemoteReservationStatus
} from "./data/remoteApi";
import type { AppState, Listing, ListingDraft, ListingImage, Reservation } from "./data/types";

type View = "browse" | "sell" | "orders" | "chat" | "notifications";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const blankDraft: ListingDraft = {
  title: "",
  description: "",
  price: 0,
  category: "Furniture",
  condition: "good",
  location: "",
  images: []
};

export default function App() {
  const [state, setState] = useState<AppState>(() => computeOverdueNotifications(loadState()));
  const [dataSource, setDataSource] = useState<"local" | "cloudflare">("local");
  const [actionError, setActionError] = useState("");
  const [view, setView] = useState<View>("browse");
  const [selectedListingId, setSelectedListingId] = useState<string | null>("listing-1");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>("reservation-1");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (dataSource === "local") {
      saveState(state);
    }
  }, [dataSource, state]);

  useEffect(() => {
    let cancelled = false;
    fetchRemoteState(state.activeUserId)
      .then((remoteState) => {
        if (cancelled) return;
        setState(remoteState);
        setDataSource("cloudflare");
        setActionError("");
      })
      .catch(() => {
        if (!cancelled) {
          setDataSource("local");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (dataSource === "cloudflare") {
        fetchRemoteState(state.activeUserId)
          .then((remoteState) => {
            setState(remoteState);
            setActionError("");
          })
          .catch((error) => setActionError(error.message));
        return;
      }
      setState((current) => computeOverdueNotifications(current));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [dataSource, state.activeUserId]);

  const activeUser = state.users.find((user) => user.id === state.activeUserId) ?? state.users[0];
  const selectedListing = state.listings.find((listing) => listing.id === selectedListingId) ?? state.listings[0];
  const visibleListings = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return state.listings.filter((listing) => {
      if (!normalized) return true;
      return [listing.title, listing.category, listing.description, listing.location].some((field) =>
        field.toLowerCase().includes(normalized)
      );
    });
  }, [query, state.listings]);
  const userReservations = state.reservations.filter((reservation) =>
    activeUser.role === "seller"
      ? reservation.sellerId === activeUser.id
      : reservation.buyerId === activeUser.id
  );
  const selectedReservation =
    userReservations.find((reservation) => reservation.id === selectedReservationId) ??
    userReservations[0];
  const unreadCount = state.notifications.filter(
    (notification) => notification.userId === activeUser.id && !notification.readAt
  ).length;

  function update(nextState: AppState) {
    setState(computeOverdueNotifications(nextState));
  }

  async function runRemoteAction(action: () => Promise<AppState>) {
    try {
      const remoteState = await action();
      setState(remoteState);
      setDataSource("cloudflare");
      setActionError("");
      return remoteState;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Cloudflare request failed.");
      throw error;
    }
  }

  async function handleReserve(listingId: string) {
    if (dataSource === "cloudflare") {
      const beforeIds = new Set(state.reservations.map((reservation) => reservation.id));
      const next = await runRemoteAction(() => reserveRemoteListing(listingId, activeUser.id));
      const reservation = next.reservations.find(
        (item) => item.listingId === listingId && item.buyerId === activeUser.id && !beforeIds.has(item.id)
      );
      if (reservation) {
        setSelectedReservationId(reservation.id);
        setView("chat");
      }
      return;
    }

    setState((current) => {
      const next = computeOverdueNotifications(reserveListing(current, listingId, activeUser.id));
      const reservation = next.reservations.find(
        (item) =>
          item.listingId === listingId &&
          item.buyerId === activeUser.id &&
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

  async function handleCreateListing(draft: ListingDraft) {
    if (dataSource === "cloudflare") {
      const next = await runRemoteAction(() => createRemoteListing(activeUser.id, draft));
      setSelectedListingId(next.listings[0].id);
      setView("browse");
      return;
    }

    const next = createListing(state, activeUser.id, draft);
    update(next);
    setSelectedListingId(next.listings[0].id);
    setView("browse");
  }

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <Store size={26} />
          <span>Resell</span>
        </div>
        <div className="data-source">{dataSource === "cloudflare" ? "Cloudflare D1" : "Local demo"}</div>
        <UserSwitcher state={state} setState={setState} />
        <nav>
          <NavButton icon={<Search />} label="Browse" active={view === "browse"} onClick={() => setView("browse")} />
          <NavButton icon={<Upload />} label="Sell" active={view === "sell"} onClick={() => setView("sell")} />
          <NavButton icon={<ShoppingBag />} label="Picked" active={view === "orders"} onClick={() => setView("orders")} />
          <NavButton icon={<MessageSquare />} label="Chat" active={view === "chat"} onClick={() => setView("chat")} />
          <NavButton
            icon={<Bell />}
            label={`Alerts${unreadCount ? ` (${unreadCount})` : ""}`}
            active={view === "notifications"}
            onClick={() => setView("notifications")}
          />
        </nav>
        {dataSource === "local" && (
          <button className="ghost reset" onClick={() => setState(computeOverdueNotifications(resetState()))}>
            <RefreshCcw size={16} />
            Reset demo
          </button>
        )}
      </aside>

      <main className="main">
        <div className="mobile-user-bar">
          <UserSwitcher state={state} setState={setState} />
          <div className="data-source">{dataSource === "cloudflare" ? "Cloudflare D1" : "Local demo"}</div>
        </div>
        {actionError && <p className="global-error">{actionError}</p>}
        {view === "browse" && (
          <BrowseView
            listings={visibleListings}
            selectedListing={selectedListing}
            activeUserId={activeUser.id}
            query={query}
            setQuery={setQuery}
            selectListing={setSelectedListingId}
            reserveListing={handleReserve}
          />
        )}
        {view === "sell" && (
          <SellView activeUser={activeUser} onCreate={handleCreateListing} listings={state.listings} />
        )}
        {view === "orders" && (
          <OrdersView
            state={state}
            reservations={userReservations}
            activeUserId={activeUser.id}
            openChat={(id) => {
              setSelectedReservationId(id);
              setView("chat");
            }}
            updateStatus={(reservationId, status) =>
              dataSource === "cloudflare"
                ? runRemoteAction(() => updateRemoteReservationStatus(reservationId, activeUser.id, status))
                : update(updateReservationStatus(state, reservationId, activeUser.id, status))
            }
          />
        )}
        {view === "chat" && (
          <ChatView
            state={state}
            activeUserId={activeUser.id}
            selectedReservation={selectedReservation}
            selectReservation={setSelectedReservationId}
            reservations={userReservations}
            send={(reservationId, body) =>
              dataSource === "cloudflare"
                ? runRemoteAction(() => sendRemoteMessage(reservationId, activeUser.id, body))
                : update(sendMessage(state, reservationId, activeUser.id, body))
            }
            updateStatus={(reservationId, status) =>
              dataSource === "cloudflare"
                ? runRemoteAction(() => updateRemoteReservationStatus(reservationId, activeUser.id, status))
                : update(updateReservationStatus(state, reservationId, activeUser.id, status))
            }
          />
        )}
        {view === "notifications" && (
          <NotificationsView
            state={state}
            activeUserId={activeUser.id}
            markAllRead={() => {
              if (dataSource === "cloudflare") {
                runRemoteAction(() => markRemoteNotificationsRead(activeUser.id));
                return;
              }
              const readAt = new Date().toISOString();
              setState({
                ...state,
                notifications: state.notifications.map((notification) =>
                  notification.userId === activeUser.id ? { ...notification, readAt } : notification
                )
              });
            }}
          />
        )}
      </main>
    </div>
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

function UserSwitcher({ state, setState }: { state: AppState; setState: (state: AppState) => void }) {
  return (
    <label className="user-switcher">
      <span>Demo user</span>
      <select
        value={state.activeUserId}
        onChange={(event) => setState({ ...state, activeUserId: event.target.value })}
      >
        {state.users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.role})
          </option>
        ))}
      </select>
    </label>
  );
}

function BrowseView({
  listings,
  selectedListing,
  activeUserId,
  query,
  setQuery,
  selectListing,
  reserveListing
}: {
  listings: Listing[];
  selectedListing: Listing;
  activeUserId: string;
  query: string;
  setQuery: (query: string) => void;
  selectListing: (id: string) => void;
  reserveListing: (id: string) => void;
}) {
  return (
    <section className="workspace two-column">
      <div className="panel feed">
        <div className="section-header">
          <div>
            <p className="eyebrow">Marketplace</p>
            <h1>Pick up items from local sellers</h1>
          </div>
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search listings" />
          </label>
        </div>
        <div className="listing-grid">
          {listings.map((listing) => (
            <button
              key={listing.id}
              className={selectedListing?.id === listing.id ? "listing-card selected" : "listing-card"}
              onClick={() => selectListing(listing.id)}
            >
              <img src={getPrimaryImage(listing)} alt="" />
              <div>
                <span className={`badge ${listing.status}`}>{listing.status}</span>
                <h2>{listing.title}</h2>
                <p>${listing.price}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedListing && (
        <article className="panel detail">
          <ListingGallery listing={selectedListing} />
          <div className="detail-copy">
            <span className={`badge ${selectedListing.status}`}>{selectedListing.status}</span>
            <h2>{selectedListing.title}</h2>
            <p className="price">${selectedListing.price}</p>
            <p>{selectedListing.description}</p>
            <dl>
              <div>
                <dt>Condition</dt>
                <dd>{selectedListing.condition.replace("_", " ")}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{selectedListing.category}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{selectedListing.location}</dd>
              </div>
            </dl>
            <button
              className="primary sticky-cta"
              disabled={selectedListing.status !== "available" || selectedListing.sellerId === activeUserId}
              onClick={() => reserveListing(selectedListing.id)}
            >
              <ShoppingBag size={18} />
              {selectedListing.sellerId === activeUserId ? "Your listing" : "Reserve item"}
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

function SellView({
  activeUser,
  onCreate,
  listings
}: {
  activeUser: { id: string; name: string; role: string };
  onCreate: (draft: ListingDraft) => void;
  listings: Listing[];
}) {
  const [draft, setDraft] = useState<ListingDraft>(blankDraft);
  const [uploadError, setUploadError] = useState("");
  const sellerListings = listings.filter((listing) => listing.sellerId === activeUser.id);
  const canPublish =
    draft.title.trim() && draft.description.trim() && draft.price > 0 && draft.location.trim() && draft.images.length > 0;

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setUploadError("");
    const rejected = Array.from(files).filter(
      (file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES
    );
    const accepted = Array.from(files)
      .filter((file) => file.type.startsWith("image/") && file.size <= MAX_IMAGE_BYTES)
      .slice(0, Math.max(0, 6 - draft.images.length));
    if (rejected.length > 0) {
      setUploadError("Use image files under 2 MB.");
    }
    try {
      const images = await Promise.all(accepted.map(readImage));
      setDraft({ ...draft, images: [...draft.images, ...images] });
    } catch {
      setUploadError("One image could not be read. Try a different file.");
    }
  }

  return (
    <section className="workspace two-column">
      <form
        className="panel form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canPublish) return;
          onCreate(draft);
          setDraft(blankDraft);
        }}
      >
        <div className="section-header">
          <div>
            <p className="eyebrow">Sell</p>
            <h1>Create a listing</h1>
          </div>
        </div>
        <label>
          <span>Images</span>
          <input
            className="file-input"
            type="file"
            accept="image/*"
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
              <span>Add 1-6 images</span>
            </div>
          )}
        </div>
        {uploadError && <p className="form-error">{uploadError}</p>}
        <div className="field-grid">
          <label>
            <span>Title</span>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label>
            <span>Price</span>
            <input
              type="number"
              min="1"
              value={draft.price || ""}
              onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })}
            />
          </label>
          <label>
            <span>Category</span>
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
              <option>Furniture</option>
              <option>Electronics</option>
              <option>Clothing</option>
              <option>Home</option>
              <option>Outdoor</option>
            </select>
          </label>
          <label>
            <span>Condition</span>
            <select
              value={draft.condition}
              onChange={(event) => setDraft({ ...draft, condition: event.target.value as ListingDraft["condition"] })}
            >
              <option value="new">New</option>
              <option value="like_new">Like new</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
            </select>
          </label>
        </div>
        <label>
          <span>Pickup or shipping notes</span>
          <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
        </label>
        <label>
          <span>Description</span>
          <textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            rows={5}
          />
        </label>
        <button className="primary" disabled={!canPublish}>
          <Package size={18} />
          Publish listing
        </button>
      </form>

      <aside className="panel compact-list">
        <p className="eyebrow">My listings</p>
        <h2>{activeUser.name}</h2>
        {sellerListings.map((listing) => (
          <div className="row" key={listing.id}>
            <img src={getPrimaryImage(listing)} alt="" />
            <div>
              <strong>{listing.title}</strong>
              <span className={`badge ${listing.status}`}>{listing.status}</span>
            </div>
          </div>
        ))}
        {sellerListings.length === 0 && <p className="muted">Switch to the seller demo user to manage listings.</p>}
      </aside>
    </section>
  );
}

function OrdersView({
  state,
  reservations,
  activeUserId,
  openChat,
  updateStatus
}: {
  state: AppState;
  reservations: Reservation[];
  activeUserId: string;
  openChat: (id: string) => void;
  updateStatus: (reservationId: string, status: Reservation["status"]) => void;
}) {
  return (
    <section className="workspace">
      <div className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Picked items</p>
            <h1>Reservations and manual payment</h1>
          </div>
        </div>
        <div className="orders">
          {reservations.map((reservation) => {
            const listing = state.listings.find((item) => item.id === reservation.listingId);
            const isSeller = reservation.sellerId === activeUserId;
            return (
              <article className="order-card" key={reservation.id}>
                <img src={listing ? getPrimaryImage(listing) : undefined} alt="" />
                <div>
                  <span className={`badge ${reservation.status}`}>{reservation.status.replace("_", " ")}</span>
                  <h2>{listing?.title ?? "Deleted listing"}</h2>
                  <p>Due {new Date(reservation.paymentDueAt).toLocaleString()}</p>
                  <p className="muted">
                    Buyer {getUserName(state, reservation.buyerId)} · Seller {getUserName(state, reservation.sellerId)}
                  </p>
                  <div className="button-row">
                    <button className="secondary" onClick={() => openChat(reservation.id)}>
                      <MessageSquare size={16} />
                      Chat
                    </button>
                    {!isSeller && (
                      <button className="secondary" onClick={() => updateStatus(reservation.id, "payment_sent")}>
                        Payment sent
                      </button>
                    )}
                    {isSeller && (
                      <>
                        <button className="secondary" onClick={() => updateStatus(reservation.id, "paid")}>
                          Mark paid
                        </button>
                        <button className="secondary" onClick={() => updateStatus(reservation.id, "cancelled")}>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {reservations.length === 0 && <p className="muted">No reservations for this demo user yet.</p>}
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
  updateStatus
}: {
  state: AppState;
  activeUserId: string;
  selectedReservation?: Reservation;
  selectReservation: (id: string) => void;
  reservations: Reservation[];
  send: (reservationId: string, body: string) => void;
  updateStatus: (reservationId: string, status: Reservation["status"]) => void;
}) {
  const [body, setBody] = useState("");
  const messages = state.messages.filter((message) => message.reservationId === selectedReservation?.id);
  const listing = state.listings.find((item) => item.id === selectedReservation?.listingId);
  const isSeller = selectedReservation?.sellerId === activeUserId;

  return (
    <section className="workspace chat-layout">
      <aside className="panel compact-list">
        <p className="eyebrow">Threads</p>
        {reservations.map((reservation) => {
          const item = state.listings.find((listingItem) => listingItem.id === reservation.listingId);
          return (
            <button
              className={reservation.id === selectedReservation?.id ? "thread active-thread" : "thread"}
              key={reservation.id}
              onClick={() => selectReservation(reservation.id)}
            >
              <img src={item ? getPrimaryImage(item) : undefined} alt="" />
              <span>{item?.title ?? "Deleted listing"}</span>
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
                <p>
                  {getUserName(state, selectedReservation.buyerId)} and{" "}
                  {getUserName(state, selectedReservation.sellerId)}
                </p>
              </div>
              <span className={`badge ${selectedReservation.status}`}>{selectedReservation.status.replace("_", " ")}</span>
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
              <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message" />
              <button className="primary">Send</button>
            </form>
            <div className="button-row chat-actions">
              {!isSeller && (
                <button className="secondary" onClick={() => updateStatus(selectedReservation.id, "payment_sent")}>
                  Payment sent
                </button>
              )}
              {isSeller && (
                <button className="secondary" onClick={() => updateStatus(selectedReservation.id, "paid")}>
                  Mark paid
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="muted">Reserve an item to start a buyer-seller chat.</p>
        )}
      </div>
    </section>
  );
}

function NotificationsView({
  state,
  activeUserId,
  markAllRead
}: {
  state: AppState;
  activeUserId: string;
  markAllRead: () => void;
}) {
  const unreadNotifications = state.notifications.filter(
    (notification) => notification.userId === activeUserId && !notification.readAt
  );

  return (
    <section className="workspace">
      <div className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Notifications</p>
            <h1>Payment and message alerts</h1>
          </div>
          <button className="secondary" disabled={unreadNotifications.length === 0} onClick={markAllRead}>
            <CheckCircle2 size={16} />
            Mark read
          </button>
        </div>
        <div className="notifications">
          {unreadNotifications.map((notification) => (
            <article className="notice unread" key={notification.id}>
              <span className={`badge ${notification.type}`}>{notification.type.replace("_", " ")}</span>
              <h2>{notification.title}</h2>
              <p>{notification.body}</p>
              <time>{new Date(notification.createdAt).toLocaleString()}</time>
            </article>
          ))}
          {unreadNotifications.length === 0 && <p className="muted">No unread notifications.</p>}
        </div>
      </div>
    </section>
  );
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
