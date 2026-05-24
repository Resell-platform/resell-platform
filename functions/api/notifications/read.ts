import { requireCurrentUser } from "../../_shared/auth";
import { markNotificationsReadInDb, readState, type Env } from "../../_shared/db";
import { handleApi, jsonResponse } from "../../_shared/http";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    await markNotificationsReadInDb(env.DB, user.id);
    return jsonResponse(await readState(env.DB, user));
  });
