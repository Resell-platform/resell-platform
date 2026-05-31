import { requireCurrentUser } from "../../_shared/auth";
import { readState, updateReservationHandoffInDb, type Env, type ReservationHandoffDraft } from "../../_shared/db";
import { handleApi, jsonResponse, readJson } from "../../_shared/http";

export const onRequestPatch: PagesFunction<Env> = async ({ env, params, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const body = await readJson<ReservationHandoffDraft>(request);
    await updateReservationHandoffInDb(env.DB, String(params.id), user.id, body);
    return jsonResponse(await readState(env.DB, user));
  });
