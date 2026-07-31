import type { AstroCookies } from "astro";
import { config } from "./config";

export const CUSTOMER_TOKEN_COOKIE = "medusa_customer_token";

const errorMessage = async (response: Response) => {
  const body = await response.text();
  try {
    return JSON.parse(body)?.message ?? body ?? response.statusText;
  } catch {
    return body || response.statusText;
  }
};

export async function customerRequest<T>(
  path: string,
  options: {
    token?: string;
    method?: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const response = await fetch(new URL(path, config.medusaBackendUrl), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": config.medusaPublishableKey,
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as T;
}

export const getCustomerToken = (cookies: AstroCookies) =>
  cookies.get(CUSTOMER_TOKEN_COOKIE)?.value ?? null;

export const setCustomerToken = (cookies: AstroCookies, token: string) =>
  cookies.set(CUSTOMER_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

export const clearCustomerToken = (cookies: AstroCookies) =>
  cookies.delete(CUSTOMER_TOKEN_COOKIE, { path: "/" });

export const formString = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

export const accountErrorRedirect = (path: string, message: string) =>
  `${path}?error=${encodeURIComponent(message.slice(0, 240))}`;

export type StoreCustomer = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
};

export type CustomerAddress = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  phone?: string | null;
};

export type WishlistItem = {
  id: string;
  product_id: string;
  product: {
    id: string;
    title: string;
    handle: string;
    thumbnail?: string | null;
  };
};
