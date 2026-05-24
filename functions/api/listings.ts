import { requireCurrentUser } from "../_shared/auth";
import { createListingInDb, readState, type Env } from "../_shared/db";
import { handleApi, jsonResponse, readJson } from "../_shared/http";
import type { ListingDraft } from "../../src/data/types";

type CreateListingBody = {
  draft: ListingDraft;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const body = await readJson<CreateListingBody>(request);
    await createListingInDb(env, user.id, body.draft);
    return jsonResponse(await readState(env.DB, user), { status: 201 });
  });
