import type { APIRoute } from "astro";
import { clearCustomerToken } from "../../../utils/customer-account";

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearCustomerToken(cookies);
  return redirect("/account/login", 303);
};
