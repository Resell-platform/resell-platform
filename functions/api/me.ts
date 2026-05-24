import { getOptionalCurrentUser, requireCurrentUser, updateCurrentUserProfile } from "../_shared/auth";
import { readState, type Env } from "../_shared/db";
import { handleApi, jsonResponse, readJson } from "../_shared/http";

type UpdateProfileBody = {
  displayName: string;
  bio?: string;
  pickupArea?: string;
  phoneE164?: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await getOptionalCurrentUser(request, env);
    return jsonResponse({ user: user ?? null });
  });

export const onRequestPatch: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const body = await readJson<UpdateProfileBody>(request);
    await updateCurrentUserProfile(env, user.id, body);
    const nextUser = await requireCurrentUser(request, env);
    return jsonResponse({
      user: nextUser,
      state: await readState(env.DB, nextUser)
    });
  });

