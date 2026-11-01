import { useEffect, useState } from "react";
import { ImagePlus, MessageSquare, Package, ShoppingBag } from "lucide-react";
import { getSellerSetup, type SellerSetupDraft } from "../../data/store";
import type {
  Listing,
  ListingDraft,
  ListingPostType,
  ListingStatus,
  Reservation,
  User
} from "../../data/types";
import { categoryLabel, statusLabel, type Copy, type Locale } from "../../i18n";
import type { ImageUploadAdapter } from "../../platform/adapters";
import { ACTIVE_RESERVATION_STATUSES, MAX_IMAGE_BYTES } from "../../utils/appConstants";
import {
  createBlankDraft,
  getListingMetaParts,
  hasPublishableItems,
  listingToDraft
} from "../../utils/listingHelpers";
import { ListingImagePreview } from "../browse/ListingImagePreview";
import { ListingItemFields } from "./ListingItemFields";
import { SellerSetupPanel } from "./SellerSetupPanel";

export function SellView({
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
  const postType: ListingPostType = activeUser?.role === "buyer" ? "request" : "offer";

  useEffect(() => {
    setSellerSetup(getSellerSetup(activeUser));
    setDraft(createBlankDraft(activeUser?.role === "buyer" ? "request" : "offer"));
  }, [activeUser?.id]);

  const sellerListings = activeUser ? listings.filter((listing) => listing.sellerId === activeUser.id) : [];
  const sellerSetupComplete =
    postType === "request" || Boolean(sellerSetup.pickupArea.trim() && sellerSetup.cancellationPolicy.trim());
  const currentDraft = { ...draft, postType };
  const canPublish =
    sellerSetupComplete &&
    currentDraft.title.trim() &&
    currentDraft.description.trim() &&
    currentDraft.location.trim() &&
    (postType === "request" || currentDraft.images.length > 0) &&
    hasPublishableItems(currentDraft);
  const editingListing = sellerListings.find((listing) => listing.id === editingId);
  const canSaveEdit = Boolean(
    editDraft &&
    editingListing &&
    editingListing.status !== "sold" &&
    editDraft.title.trim() &&
    editDraft.description.trim() &&
    editDraft.category.trim() &&
    editDraft.location.trim() &&
    (editDraft.postType === "request" || editDraft.images.length > 0) &&
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
    if (listing.status === "sold") return;
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
          const created = await onCreate({ ...draft, postType }, sellerSetup);
          if (created) {
            setDraft(createBlankDraft(postType));
          }
        }}
      >
        <div className="section-header">
          <div>
            <p className="eyebrow">{postType === "request" ? text.requestPost : text.sell}</p>
            <h1>{postType === "request" ? text.createRequest : text.createListing}</h1>
          </div>
        </div>
        {postType === "offer" && (
          <SellerSetupPanel
            setup={sellerSetup}
            onChange={setSellerSetup}
            onSave={() => onSaveSellerSetup(sellerSetup)}
            complete={sellerSetupComplete}
            text={text}
          />
        )}
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
              <span>{postType === "request" ? text.addReferenceImages : text.addImages}</span>
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
        <ListingItemFields draft={currentDraft} onChange={setDraft} text={text} locale={locale} />
        <button className="primary" disabled={!canPublish}>
          <Package size={18} />
          {postType === "request" ? text.publishRequest : text.publishListing}
        </button>
      </form>

      <aside className="panel compact-list">
        <p className="eyebrow">{postType === "request" ? text.myRequests : text.myListings}</p>
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
              <ListingImagePreview listing={listing} />
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
                    disabled={isTerminal}
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
                  disabled={isTerminal}
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
        {sellerListings.length === 0 && (
          <p className="muted">{postType === "request" ? text.noRequests : text.noListings}</p>
        )}
      </aside>
    </section>
  );
}
