import type { SellerSetupDraft } from "../../data/store";
import type { Copy } from "../../i18n";

export function SellerSetupPanel({
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
      </div>
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
