import type { APIRoute } from "astro";
import { rejectCrossOriginAccountMutation } from "../../../utils/account-mutation-security.js";
import {
  accountErrorRedirect,
  customerRequest,
  formString,
  getCustomerToken,
} from "../../../utils/customer-account";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const originError = rejectCrossOriginAccountMutation(request);
  if (originError) return originError;
  const token = getCustomerToken(cookies);
  if (!token) return redirect("/account/login", 303);
  const form = await request.formData();
  try {
    await customerRequest("/store/customers/me", {
      method: "POST",
      token,
      body: {
        first_name: formString(form, "first_name"),
        last_name: formString(form, "last_name"),
        phone: formString(form, "phone") || null,
      },
    });
    return redirect("/account?saved=profile", 303);
  } catch (error) {
    return redirect(
      accountErrorRedirect(
        "/account",
        error instanceof Error ? error.message : "Profile update failed.",
      ),
      303,
    );
  }
};
