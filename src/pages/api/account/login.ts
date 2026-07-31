import type { APIRoute } from "astro";
import {
  accountErrorRedirect,
  customerRequest,
  formString,
  setCustomerToken,
} from "../../../utils/customer-account";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  try {
    const { token } = await customerRequest<{ token: string }>(
      "/auth/customer/emailpass",
      {
        method: "POST",
        body: {
          email: formString(form, "email").toLowerCase(),
          password: formString(form, "password"),
        },
      },
    );
    setCustomerToken(cookies, token);
    return redirect("/account", 303);
  } catch (error) {
    return redirect(
      accountErrorRedirect(
        "/account/login",
        error instanceof Error ? error.message : "Sign in failed.",
      ),
      303,
    );
  }
};
