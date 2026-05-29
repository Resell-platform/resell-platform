import { requireCurrentUser } from "../_shared/auth";
import { readState, type Env } from "../_shared/db";
import { handleApi, jsonResponse } from "../_shared/http";
import type { ModerationStatus, TrustBadge } from "../../src/data/types";

const moderationStatuses: ModerationStatus[] = ["pending", "approved", "rejected", "flagged"];

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const state = await readState(env.DB, user);
    const trustBadges: TrustBadge[] = [
      ...(user.emailVerifiedAt ? (["email_verified"] as const) : []),
      ...(user.phoneVerifiedAt ? (["phone_verified"] as const) : []),
      ...(user.name && user.pickupArea ? (["profile_complete"] as const) : [])
    ];

    return jsonResponse(
      {
        formatVersion: 2,
        exportedAt: new Date().toISOString(),
        architecture: {
          backend: [
            "Cloudflare Pages Functions / Workers",
            "Cloudflare D1",
            "Cloudflare R2",
            "Resend email login",
            "HttpOnly session cookies",
            "No payment provider"
          ],
          businessModels: [
            "User / Profile",
            "Listing / Seller Post",
            "ListingItem / PostItem",
            "ListingImage",
            "Reservation",
            "ChatMessage",
            "Notification",
            "TrustBadge",
            "ModerationStatus"
          ],
          frontends: [
            "Current H5 / PWA web app",
            "WeChat mini program later",
            "Xiaohongshu mini program later",
            "Messenger WebView later"
          ],
          adapters: [
            "Login adapter",
            "Share adapter",
            "Notification adapter",
            "Image upload adapter",
            "Deep link / open-in-app adapter",
            "No payment adapter"
          ]
        },
        user,
        trustBadges,
        moderationStatuses,
        state
      },
      {
        headers: {
          "content-disposition": `attachment; filename="resell-export-${user.id}.json"`
        }
      }
    );
  });
