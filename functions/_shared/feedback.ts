import type { FeedbackDraft, FeedbackReceipt } from "../../src/data/types";
import type { CurrentUser } from "./auth";
import { createId, type Env } from "./db";
import { ApiError } from "./http";

const CATEGORIES = new Set(["bug", "suggestion", "listing", "handoff", "safety", "trust"]);
const SEVERITIES = new Set(["low", "medium", "blocking", "safety"]);
const ENTITY_TYPES = new Set(["listing", "reservation"]);
const MAX_SUMMARY_LENGTH = 140;
const MAX_DETAILS_LENGTH = 4000;
const MAX_URL_LENGTH = 500;
const FEEDBACK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const FEEDBACK_RATE_LIMIT = 5;

export async function createFeedbackSubmission(
  env: Env,
  request: Request,
  user: CurrentUser | undefined,
  draft: FeedbackDraft
): Promise<FeedbackReceipt> {
  const normalized = normalizeFeedbackDraft(draft, user);
  const now = new Date().toISOString();
  const ipHash = await hashIp(getClientIp(request), env.FEEDBACK_HASH_SALT);

  await enforceFeedbackRateLimit(env.DB, user?.id, ipHash, new Date(Date.now() - FEEDBACK_RATE_LIMIT_WINDOW_MS));

  const id = createId("feedback");
  await env.DB.prepare(
    `INSERT INTO feedback_submissions (
      id, user_id, contact_email, category, severity, summary, details, source_view,
      entity_type, entity_id, page_url, locale, data_source, user_agent, ip_hash,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`
  )
    .bind(
      id,
      user?.id ?? null,
      normalized.contactEmail ?? null,
      normalized.category,
      normalized.severity,
      normalized.summary,
      normalized.details,
      normalized.sourceView,
      normalized.entityType ?? null,
      normalized.entityId ?? null,
      normalized.pageUrl ?? null,
      normalized.locale ?? null,
      normalized.dataSource ?? null,
      truncate(request.headers.get("user-agent") ?? "", 500) || null,
      ipHash,
      now,
      now
    )
    .run();

  return { id, status: "submitted", createdAt: now };
}

function normalizeFeedbackDraft(draft: FeedbackDraft, user: CurrentUser | undefined) {
  if (draft.honeypot?.trim()) {
    throw new ApiError("Feedback could not be submitted.", 400);
  }
  if (!CATEGORIES.has(draft.category)) {
    throw new ApiError("Choose a feedback type.");
  }
  if (!SEVERITIES.has(draft.severity)) {
    throw new ApiError("Choose a feedback severity.");
  }
  if (draft.entityType && !ENTITY_TYPES.has(draft.entityType)) {
    throw new ApiError("Feedback context is invalid.");
  }

  const summary = truncate(draft.summary.trim(), MAX_SUMMARY_LENGTH);
  const details = truncate(draft.details.trim(), MAX_DETAILS_LENGTH);
  const sourceView = truncate(draft.sourceView.trim(), 60);
  const contactEmail = draft.contactAllowed ? normalizeEmail(draft.contactEmail ?? user?.email ?? "") : "";
  const pageUrl = truncate(draft.pageUrl?.trim() ?? "", MAX_URL_LENGTH);

  if (!summary) {
    throw new ApiError("Add a short feedback summary.");
  }
  if (!details) {
    throw new ApiError("Add feedback details.");
  }
  if (!sourceView) {
    throw new ApiError("Feedback context is missing.");
  }
  if (draft.contactAllowed && contactEmail && !isValidEmail(contactEmail)) {
    throw new ApiError("Enter a valid contact email.");
  }

  return {
    category: draft.category,
    severity: draft.severity,
    summary,
    details,
    sourceView,
    entityType: draft.entityType,
    entityId: truncate(draft.entityId?.trim() ?? "", 120) || undefined,
    pageUrl: pageUrl || undefined,
    locale: truncate(draft.locale?.trim() ?? "", 16) || undefined,
    dataSource: truncate(draft.dataSource?.trim() ?? "", 30) || undefined,
    contactEmail: contactEmail || undefined
  };
}

async function enforceFeedbackRateLimit(db: D1Database, userId: string | undefined, ipHash: string | null, since: Date) {
  if (!userId && !ipHash) return;

  const predicates: string[] = [];
  const args: unknown[] = [];
  if (userId) {
    predicates.push("user_id = ?");
    args.push(userId);
  }
  if (ipHash) {
    predicates.push("ip_hash = ?");
    args.push(ipHash);
  }

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM feedback_submissions
       WHERE created_at >= ?
         AND (${predicates.join(" OR ")})`
    )
    .bind(since.toISOString(), ...args)
    .first<{ count: number }>();

  if ((row?.count ?? 0) >= FEEDBACK_RATE_LIMIT) {
    throw new ApiError("Too many feedback submissions. Try again later.", 429);
  }
}

async function hashIp(ip: string | null, salt: string | undefined) {
  if (!ip) return null;
  const encoded = new TextEncoder().encode(`${salt ?? "local-feedback-salt"}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
