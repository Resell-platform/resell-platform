import { MessageSquare } from "lucide-react";
import { getPrimaryImage, getUserName, type HandoffPlanDraft } from "../../data/store";
import type { AppState, Reservation } from "../../data/types";
import { statusLabel, type Copy, type Locale } from "../../i18n";
import { getItemCountText } from "../../utils/listingHelpers";
import { getReservationCancellation, isTerminalReservation } from "../../utils/reservationHelpers";
import { HandoffPlanPanel } from "./HandoffPlanPanel";

export function OrdersView({
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
