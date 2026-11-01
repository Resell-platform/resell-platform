import { useEffect, useState } from "react";
import { CalendarClock, Truck } from "lucide-react";
import type { HandoffPlanDraft } from "../../data/store";
import type { Reservation } from "../../data/types";
import type { Copy } from "../../i18n";
import { getReservationHandoffPlan } from "../../utils/reservationHelpers";

export function HandoffPlanPanel({
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
