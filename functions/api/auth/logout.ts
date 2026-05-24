import { logout } from "../../_shared/auth";
import { handleApi } from "../../_shared/http";
import type { Env } from "../../_shared/db";

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => logout(request, env));

