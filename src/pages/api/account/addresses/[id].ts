import type { APIRoute } from "astro";
import {
  customerRequest,
  getCustomerToken,
} from "../../../../utils/customer-account";

export const POST: APIRoute = async ({ params, cookies, redirect }) => {
  const token = getCustomerToken(cookies);
  if (!token) return redirect("/account/login", 303);
  if (params.id)
    await customerRequest(`/store/customers/me/addresses/${params.id}`, {
      method: "DELETE",
      token,
    });
  return redirect("/account", 303);
};
