import type { APIRoute } from "astro";
import { rejectCrossOriginAccountMutation } from "../../../../utils/account-mutation-security.js";
import {
  customerRequest,
  getCustomerToken,
} from "../../../../utils/customer-account";

export const POST: APIRoute = async ({
  request,
  params,
  cookies,
  redirect,
}) => {
  const originError = rejectCrossOriginAccountMutation(request);
  if (originError) return originError;
  const token = getCustomerToken(cookies);
  if (!token) return redirect("/account/login", 303);
  if (params.id)
    await customerRequest(`/store/customers/me/addresses/${params.id}`, {
      method: "DELETE",
      token,
    });
  return redirect("/account", 303);
};
