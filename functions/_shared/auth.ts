import type { User } from "../../src/data/types";
import { createId, type Env } from "./db";
import { ApiError, jsonResponse } from "./http";

const SESSION_COOKIE = "resell_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_COOLDOWN_MS = 60 * 1000;
const CHALLENGE_HOURLY_LIMIT = 5;
const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export type CurrentUser = User & {
  email?: string;
  emailVerifiedAt?: string;
  phoneE164?: string;
  phoneVerifiedAt?: string;
  avatarUrl?: string;
  bio?: string;
  pickupArea?: string;
  pickupZip?: string;
  serviceAreaMiles?: number;
  pickupPolicy?: string;
  handoffPolicy?: string;
  cancellationPolicy?: string;
  offPlatformInstructions?: string;
  responseExpectation?: string;
  sellerActivatedAt?: string;
  emailNotificationsEnabled?: boolean;
};

type CurrentUserRow = {
  id: string;
  name: string;
  role: User["role"];
  email?: string | null;
  email_verified_at?: string | null;
  phone_e164?: string | null;
  phone_verified_at?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  pickup_area?: string | null;
  pickup_zip?: string | null;
  service_area_miles?: number | null;
  pickup_policy?: string | null;
  handoff_policy?: string | null;
  cancellation_policy?: string | null;
  off_platform_instructions?: string | null;
  response_expectation?: string | null;
  seller_activated_at?: string | null;
  email_notifications_enabled?: number | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at?: string | null;
};

type ChallengeRow = {
  id: string;
  email_normalized: string;
  display_name?: string | null;
  code_hash: string;
  expires_at: string;
  consumed_at?: string | null;
  attempts: number;
};

export async function requestEmailCode(env: Env, email: string, displayName?: string, includeCode = false) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    throw new ApiError("Enter a valid email address.");
  }
  await enforceEmailChallengeRateLimit(env, normalizedEmail);

  const code = createCode();
  const now = new Date();
  const challengeId = createId("challenge");
  await env.DB.prepare(
    `INSERT INTO auth_challenges (
      id, email_normalized, display_name, code_hash, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      challengeId,
      normalizedEmail,
      displayName?.trim() || null,
      await hashSecret(`${normalizedEmail}:${code}`),
      new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
      now.toISOString()
    )
    .run();

  if (includeCode) {
    console.log(`Development verification code for ${normalizedEmail}: ${code}`);
  } else {
    try {
      await sendVerificationEmail(env, normalizedEmail, code);
    } catch (error) {
      await env.DB.prepare("UPDATE auth_challenges SET consumed_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), challengeId)
        .run();
      throw error;
    }
  }

  return {
    email: normalizedEmail,
    delivery: includeCode ? "development_response" : "email",
    verificationCode: includeCode ? code : undefined
  };
}

export async function verifyEmailCode(
  env: Env,
  email: string,
  code: string,
  displayName?: string,
  secureCookie = true
) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date().toISOString();
  const challenge = await env.DB.prepare(
    `SELECT * FROM auth_challenges
     WHERE email_normalized = ?
       AND consumed_at IS NULL
       AND expires_at > ?
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(normalizedEmail, now)
    .first<ChallengeRow>();

  if (!challenge || challenge.attempts >= 5) {
    throw new ApiError("Verification code is invalid or expired.", 401);
  }

  const expectedHash = await hashSecret(`${normalizedEmail}:${code.trim()}`);
  if (expectedHash !== challenge.code_hash) {
    await env.DB.prepare("UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?")
      .bind(challenge.id)
      .run();
    throw new ApiError("Verification code is invalid or expired.", 401);
  }

  let user = await env.DB.prepare("SELECT * FROM users WHERE email_normalized = ?")
    .bind(normalizedEmail)
    .first<CurrentUserRow>();
  if (!user) {
    const userId = createId("user");
    const name = displayName?.trim() || challenge.display_name?.trim() || normalizedEmail.split("@")[0];
    await env.DB.prepare(
      `INSERT INTO users (
        id, name, role, email, email_normalized, email_verified_at, bio, pickup_area, created_at, updated_at
      ) VALUES (?, ?, 'buyer', ?, ?, ?, '', '', ?, ?)`
    )
      .bind(userId, name, normalizedEmail, normalizedEmail, now, now, now)
      .run();
    user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<CurrentUserRow>();
  } else {
    await env.DB.prepare(
      `UPDATE users
       SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ?
       WHERE id = ?`
    )
      .bind(now, now, user.id)
      .run();
  }

  if (!user) {
    throw new ApiError("Could not create account.", 500);
  }

  await env.DB.prepare("UPDATE auth_challenges SET consumed_at = ? WHERE id = ?").bind(now, challenge.id).run();

  const token = crypto.randomUUID();
  const sessionId = createId("session");
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      sessionId,
      user.id,
      await hashSecret(token),
      new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
      now,
      now
    )
    .run();

  return {
    user: toCurrentUser({
      ...user,
      email: normalizedEmail,
      email_verified_at: user.email_verified_at ?? now
    }),
    cookie: createSessionCookie(token, SESSION_MAX_AGE_SECONDS, secureCookie)
  };
}

export async function getOptionalCurrentUser(request: Request, env: Env): Promise<CurrentUser | undefined> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return undefined;

  const tokenHash = await hashSecret(token);
  const session = await env.DB.prepare(
    `SELECT id, user_id, expires_at, revoked_at
     FROM auth_sessions
     WHERE token_hash = ?
       AND revoked_at IS NULL
       AND expires_at > ?`
  )
    .bind(tokenHash, new Date().toISOString())
    .first<SessionRow>();
  if (!session) return undefined;

  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(session.user_id).first<CurrentUserRow>();
  if (!user) return undefined;

  await env.DB.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), session.id)
    .run();

  return toCurrentUser(user);
}

export async function requireCurrentUser(request: Request, env: Env): Promise<CurrentUser> {
  const user = await getOptionalCurrentUser(request, env);
  if (!user) {
    throw new ApiError("Log in to continue.", 401);
  }
  return user;
}

export async function logout(request: Request, env: Env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?")
      .bind(new Date().toISOString(), await hashSecret(token))
      .run();
  }
  return jsonResponse({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
}

export async function updateCurrentUserProfile(
  env: Env,
  userId: string,
  draft: {
    displayName: string;
    bio?: string;
    pickupArea?: string;
    phoneE164?: string;
    pickupZip?: string;
    serviceAreaMiles?: number;
    pickupPolicy?: string;
    handoffPolicy?: string;
    cancellationPolicy?: string;
    offPlatformInstructions?: string;
    responseExpectation?: string;
  }
) {
  const displayName = draft.displayName.trim();
  if (!displayName) throw new ApiError("Display name is required.");
  const hasPhone = Object.prototype.hasOwnProperty.call(draft, "phoneE164");
  const hasPickupZip = Object.prototype.hasOwnProperty.call(draft, "pickupZip");
  const hasServiceAreaMiles = Object.prototype.hasOwnProperty.call(draft, "serviceAreaMiles");
  const pickupZip = draft.pickupZip?.trim() ?? "";
  if (pickupZip && !/^\d{5}$/.test(pickupZip)) {
    throw new ApiError("Pickup ZIP must be five digits.");
  }
  const serviceAreaMiles = draft.serviceAreaMiles ? Number(draft.serviceAreaMiles) : null;
  if (serviceAreaMiles !== null && ![5, 10, 25, 50].includes(serviceAreaMiles)) {
    throw new ApiError("Choose a valid service area.");
  }
  const hasPickupPolicy = Object.prototype.hasOwnProperty.call(draft, "pickupPolicy");
  const hasHandoffPolicy = Object.prototype.hasOwnProperty.call(draft, "handoffPolicy");
  const hasCancellationPolicy = Object.prototype.hasOwnProperty.call(draft, "cancellationPolicy");
  const hasOffPlatformInstructions = Object.prototype.hasOwnProperty.call(draft, "offPlatformInstructions");
  const hasResponseExpectation = Object.prototype.hasOwnProperty.call(draft, "responseExpectation");
  const pickupPolicy = draft.pickupPolicy?.trim() ?? "";
  const handoffPolicy = draft.handoffPolicy?.trim() ?? "";
  const cancellationPolicy = draft.cancellationPolicy?.trim() ?? "";
  const offPlatformInstructions = draft.offPlatformInstructions?.trim() ?? "";
  const responseExpectation = draft.responseExpectation?.trim() ?? "";
  const pickupArea = draft.pickupArea?.trim() ?? "";
  const sellerActivatedAt =
    pickupArea && offPlatformInstructions && responseExpectation && cancellationPolicy ? nowIso() : null;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE users
     SET name = ?,
         bio = ?,
         pickup_area = ?,
         phone_e164 = CASE WHEN ? THEN ? ELSE phone_e164 END,
         pickup_zip = CASE WHEN ? THEN ? ELSE pickup_zip END,
         service_area_miles = CASE WHEN ? THEN ? ELSE service_area_miles END,
         pickup_policy = CASE WHEN ? THEN ? ELSE pickup_policy END,
         handoff_policy = CASE WHEN ? THEN ? ELSE handoff_policy END,
         cancellation_policy = CASE WHEN ? THEN ? ELSE cancellation_policy END,
         off_platform_instructions = CASE WHEN ? THEN ? ELSE off_platform_instructions END,
         response_expectation = CASE WHEN ? THEN ? ELSE response_expectation END,
         seller_activated_at = CASE
           WHEN ? IS NOT NULL THEN COALESCE(seller_activated_at, ?)
           ELSE seller_activated_at
         END,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      displayName,
      draft.bio?.trim() ?? "",
      pickupArea,
      hasPhone ? 1 : 0,
      draft.phoneE164?.trim() || null,
      hasPickupZip ? 1 : 0,
      pickupZip || null,
      hasServiceAreaMiles ? 1 : 0,
      serviceAreaMiles,
      hasPickupPolicy ? 1 : 0,
      pickupPolicy,
      hasHandoffPolicy ? 1 : 0,
      handoffPolicy,
      hasCancellationPolicy ? 1 : 0,
      cancellationPolicy,
      hasOffPlatformInstructions ? 1 : 0,
      offPlatformInstructions,
      hasResponseExpectation ? 1 : 0,
      responseExpectation,
      sellerActivatedAt,
      sellerActivatedAt,
      now,
      userId
    )
    .run();
}

export function toPublicUser(user: CurrentUser | User) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    emailVerifiedAt: "emailVerifiedAt" in user ? user.emailVerifiedAt : undefined,
    phoneVerifiedAt: "phoneVerifiedAt" in user ? user.phoneVerifiedAt : undefined,
    pickupArea: "pickupArea" in user ? user.pickupArea : undefined,
    pickupZip: "pickupZip" in user ? user.pickupZip : undefined,
    serviceAreaMiles: "serviceAreaMiles" in user ? user.serviceAreaMiles : undefined,
    pickupPolicy: "pickupPolicy" in user ? user.pickupPolicy : undefined,
    handoffPolicy: "handoffPolicy" in user ? user.handoffPolicy : undefined,
    cancellationPolicy: "cancellationPolicy" in user ? user.cancellationPolicy : undefined,
    offPlatformInstructions: "offPlatformInstructions" in user ? user.offPlatformInstructions : undefined,
    responseExpectation: "responseExpectation" in user ? user.responseExpectation : undefined,
    sellerActivatedAt: "sellerActivatedAt" in user ? user.sellerActivatedAt : undefined,
    emailNotificationsEnabled:
      "emailNotificationsEnabled" in user ? user.emailNotificationsEnabled : undefined,
    bio: "bio" in user ? user.bio : undefined,
    avatarUrl: "avatarUrl" in user ? user.avatarUrl : undefined
  };
}

function toCurrentUser(row: CurrentUserRow): CurrentUser {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email ?? undefined,
    emailVerifiedAt: row.email_verified_at ?? undefined,
    phoneE164: row.phone_e164 ?? undefined,
    phoneVerifiedAt: row.phone_verified_at ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    bio: row.bio ?? undefined,
    pickupArea: row.pickup_area ?? undefined,
    pickupZip: row.pickup_zip ?? undefined,
    serviceAreaMiles: row.service_area_miles ?? undefined,
    pickupPolicy: row.pickup_policy ?? undefined,
    handoffPolicy: row.handoff_policy ?? undefined,
    cancellationPolicy: row.cancellation_policy ?? undefined,
    offPlatformInstructions: row.off_platform_instructions ?? undefined,
    responseExpectation: row.response_expectation ?? undefined,
    sellerActivatedAt: row.seller_activated_at ?? undefined,
    emailNotificationsEnabled: row.email_notifications_enabled !== 0
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

async function enforceEmailChallengeRateLimit(env: Env, email: string) {
  const now = Date.now();
  const since = new Date(now - 60 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS count, MAX(created_at) AS latest_created_at
     FROM auth_challenges
     WHERE email_normalized = ?
       AND created_at > ?`
  )
    .bind(email, since)
    .first<{ count: number; latest_created_at?: string | null }>();

  const count = Number(recent?.count ?? 0);
  const latestCreatedAt = recent?.latest_created_at ? Date.parse(recent.latest_created_at) : 0;
  if (latestCreatedAt && now - latestCreatedAt < CHALLENGE_COOLDOWN_MS) {
    throw new ApiError("Wait a minute before requesting another code.", 429);
  }
  if (count >= CHALLENGE_HOURLY_LIMIT) {
    throw new ApiError("Too many login codes requested. Try again later.", 429);
  }
}

async function hashSecret(secret: string) {
  const input = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendVerificationEmail(env: Env, email: string, code: string) {
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) {
    throw new ApiError("Email login is not configured. Set RESEND_API_KEY and AUTH_EMAIL_FROM.", 503);
  }

  let response: Response;
  try {
    response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
        "user-agent": "resell-platform-cloudflare-auth"
      },
      body: JSON.stringify({
        from: env.AUTH_EMAIL_FROM,
        to: email,
        subject: "Your Resell verification code",
        text: `Your Resell verification code is ${code}. It expires in 10 minutes.`,
        html: `<p>Your Resell verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`
      })
    });
  } catch (error) {
    console.error("Resend email request failed.", error);
    throw new ApiError("Could not send verification email. Try again in a few minutes.", 502);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error(`Resend email delivery failed (${response.status}): ${details}`);
    throw new ApiError(
      getEmailDeliveryFailureMessage(response.status, details),
      getEmailDeliveryFailureStatus(response.status)
    );
  }
}

function getEmailDeliveryFailureStatus(status: number) {
  if (status === 429) return 429;
  if (status >= 400 && status < 500) return 400;
  return 502;
}

function getEmailDeliveryFailureMessage(status: number, details: string) {
  const normalizedDetails = details.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    normalizedDetails.includes("api key") ||
    normalizedDetails.includes("sender") ||
    normalizedDetails.includes("verified")
  ) {
    return "Email login is not configured correctly. Contact support.";
  }

  if (status === 429) {
    return "Too many email codes requested. Try again later.";
  }

  if (status >= 400 && status < 500) {
    return "Email delivery rejected this address. Try another email address.";
  }

  return "Email delivery service is temporarily unavailable. Try again in a few minutes.";
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function createSessionCookie(token: string, maxAge: number, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
