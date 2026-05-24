import { requireCurrentUser } from "../../../_shared/auth";
import { readState, updateReservationStatusInDb, type Env } from "../../../_shared/db";
import { handleApi, jsonResponse, readJson } from "../../../_shared/http";
import type { ReservationStatus } from "../../../../src/data/types";

type UpdateReservationStatusBody = {
  status: ReservationStatus;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const body = await readJson<UpdateReservationStatusBody>(request);
    await updateReservationStatusInDb(env.DB, String(params.id), user.id, body.status);
    return jsonResponse(await readState(env.DB, user));
  });
