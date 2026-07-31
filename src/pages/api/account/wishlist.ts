import type { APIRoute } from "astro";
import { rejectCrossOriginAccountMutation } from "../../../utils/account-mutation-security.js";
import { config } from "../../../utils/config";
import {
  customerRequest,
  formString,
  getCustomerToken,
} from "../../../utils/customer-account";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const originError = rejectCrossOriginAccountMutation(request);
  if (originError) return originError;
  const token = getCustomerToken(cookies);
  if (!token) return redirect("/account/login", 303);
  if (!config.customerEngagementEnabled) return redirect("/account", 303);
  const form = await request.formData();
  const productId = formString(form, "product_id");
  const intent = formString(form, "intent");
  const returnTo = formString(form, "return_to");
  const safeReturnTo =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/account/wishlist";
  if (productId) {
    await customerRequest(
      intent === "remove"
        ? `/store/customers/me/wishlist/${productId}`
        : "/store/customers/me/wishlist",
      {
        method: intent === "remove" ? "DELETE" : "POST",
        token,
        ...(intent === "remove" ? {} : { body: { product_id: productId } }),
      },
    );
  }
  return redirect(safeReturnTo, 303);
};
