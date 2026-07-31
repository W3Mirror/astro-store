import type { APIRoute } from "astro";
import { config } from "../../../utils/config";
import {
  customerRequest,
  formString,
  getCustomerToken,
} from "../../../utils/customer-account";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const token = getCustomerToken(cookies);
  if (!token) return redirect("/account/login", 303);
  if (!config.customerEngagementEnabled) return redirect("/account", 303);
  const form = await request.formData();
  for (const channel of ["email", "whatsapp"] as const) {
    await customerRequest("/store/customers/me/engagement", {
      method: "POST",
      token,
      body: {
        channel,
        status: form.get(channel) === "on" ? "opted_in" : "opted_out",
      },
    });
  }
  return redirect("/account?saved=consent", 303);
};
