import { getOptionalCurrentUser } from "../_shared/auth";
import { createFeedbackSubmission } from "../_shared/feedback";
import { handleApi, jsonResponse, readJson } from "../_shared/http";
import type { Env } from "../_shared/db";
import type { FeedbackDraft } from "../../src/data/types";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const [user, body] = await Promise.all([getOptionalCurrentUser(request, env), readJson<FeedbackDraft>(request)]);
    return jsonResponse(await createFeedbackSubmission(env, request, user, body), { status: 201 });
  });
