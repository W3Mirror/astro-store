import type { APIRoute } from "astro";
import { config } from "../../../utils/config";
import {
  accountErrorRedirect,
  customerRequest,
  formString,
  setCustomerToken,
} from "../../../utils/customer-account";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = formString(form, "email").toLowerCase();
  const password = formString(form, "password");
  const firstName = formString(form, "first_name");
  const lastName = formString(form, "last_name");
  if (!email || password.length < 8 || !firstName || !lastName) {
    return redirect(
      accountErrorRedirect(
        "/account/register",
        "Enter your name, email, and a password of at least 8 characters.",
      ),
      303,
    );
  }
  try {
    const { token } = await customerRequest<{ token: string }>(
      "/auth/customer/emailpass/register",
      { method: "POST", body: { email, password } },
    );
    await customerRequest("/store/customers", {
      method: "POST",
      token,
      body: { email, first_name: firstName, last_name: lastName },
    });
    setCustomerToken(cookies, token);
    if (config.customerEngagementEnabled) {
      await customerRequest("/store/customers/me/engagement/initialize", {
        method: "POST",
        token,
      });
    }
    return redirect("/account", 303);
  } catch (error) {
    return redirect(
      accountErrorRedirect(
        "/account/register",
        error instanceof Error ? error.message : "Registration failed.",
      ),
      303,
    );
  }
};
