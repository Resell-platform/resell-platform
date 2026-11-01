import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { FeedbackDraft, User } from "../../data/types";
import type { Copy } from "../../i18n";

export function FeedbackModal({
  user,
  sourceLabel,
  onClose,
  onSubmit,
  text
}: {
  user?: User | null;
  sourceLabel: string;
  onClose: () => void;
  onSubmit: (
    draft: Omit<FeedbackDraft, "sourceView" | "entityType" | "entityId" | "pageUrl" | "locale" | "dataSource">
  ) => Promise<void>;
  text: Copy;
}) {
  const contactEmail = (user as (User & { email?: string }) | null | undefined)?.email ?? "";
  const [category, setCategory] = useState<FeedbackDraft["category"]>("bug");
  const [severity, setSeverity] = useState<FeedbackDraft["severity"]>("medium");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [contactAllowed, setContactAllowed] = useState(Boolean(contactEmail));
  const [email, setEmail] = useState(contactEmail);
  const [honeypot, setHoneypot] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = Boolean(summary.trim() && details.trim() && !pending);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        category,
        severity,
        summary,
        details,
        contactAllowed,
        contactEmail: email,
        honeypot
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : text.feedbackFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onSubmit={submit}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">
              {text.feedbackSource}: {sourceLabel}
            </p>
            <h1 id="feedback-title">{text.feedbackTitle}</h1>
          </div>
          <button className="secondary icon-button" type="button" aria-label={text.closeModal} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="feedback-grid">
          <label>
            <span>{text.feedbackType}</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackDraft["category"])}
            >
              <option value="bug">{text.feedbackBug}</option>
              <option value="suggestion">{text.feedbackSuggestion}</option>
              <option value="listing">{text.feedbackListing}</option>
              <option value="handoff">{text.feedbackHandoff}</option>
              <option value="safety">{text.feedbackSafety}</option>
              <option value="trust">{text.feedbackTrust}</option>
            </select>
          </label>
          <label>
            <span>{text.feedbackSeverity}</span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as FeedbackDraft["severity"])}
            >
              <option value="low">{text.feedbackLow}</option>
              <option value="medium">{text.feedbackMedium}</option>
              <option value="blocking">{text.feedbackBlocking}</option>
              <option value="safety">{text.feedbackSafetyConcern}</option>
            </select>
          </label>
        </div>
        <label>
          <span>{text.feedbackSummary}</span>
          <input maxLength={140} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </label>
        <label>
          <span>{text.feedbackDetails}</span>
          <textarea rows={5} maxLength={4000} value={details} onChange={(event) => setDetails(event.target.value)} />
        </label>
        <label className="feedback-contact">
          <input
            type="checkbox"
            checked={contactAllowed}
            onChange={(event) => setContactAllowed(event.target.checked)}
          />
          <span>{text.feedbackContact}</span>
        </label>
        {contactAllowed && (
          <label>
            <span>{text.feedbackContactEmail}</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
        )}
        <label className="feedback-honeypot" aria-hidden="true">
          <span>Website</span>
          <input
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="button-row modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={pending}>
            {text.cancel}
          </button>
          <button type="submit" className="primary" disabled={!canSubmit}>
            {pending ? text.feedbackSending : text.feedbackSend}
          </button>
        </div>
      </form>
    </div>
  );
}
