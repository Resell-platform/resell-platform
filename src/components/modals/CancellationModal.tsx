import { useState } from "react";
import { X } from "lucide-react";
import type { Listing, Reservation } from "../../data/types";
import type { Copy } from "../../i18n";

export function CancellationModal({
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
