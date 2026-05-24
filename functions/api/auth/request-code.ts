import { requestEmailCode } from "../../_shared/auth";
import { handleApi, jsonResponse, readJson } from "../../_shared/http";
import type { Env } from "../../_shared/db";

type RequestCodeBody = {
  email: string;
  displayName?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const body = await readJson<RequestCodeBody>(request);
    const url = new URL(request.url);
    const includeCode = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const result = await requestEmailCode(env, body.email, body.displayName, includeCode);
    return jsonResponse(result, { status: 201 });
  });
