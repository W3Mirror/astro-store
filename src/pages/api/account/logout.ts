import type { APIRoute } from "astro";
import { rejectCrossOriginAccountMutation } from "../../../utils/account-mutation-security.js";
import { clearCustomerToken } from "../../../utils/customer-account";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const originError = rejectCrossOriginAccountMutation(request);
  if (originError) return originError;
  clearCustomerToken(cookies);
  return redirect("/account/login", 303);
};
