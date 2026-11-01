import { useState } from "react";
import { getPrimaryImage, getUserName } from "../../data/store";
import type { AppState, Reservation } from "../../data/types";
import { statusLabel, type Copy, type Locale } from "../../i18n";
import { getItemCountText, getParticipantSummary } from "../../utils/listingHelpers";
import { getReservationHandoffPlan, isTerminalReservation } from "../../utils/reservationHelpers";
import { HandoffPlanPanel } from "../orders/HandoffPlanPanel";

export function ChatView({
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
