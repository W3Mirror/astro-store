// E.164-like validation: optional leading "+", then 8-15 digits, first
// digit non-zero. Matches (a looser, defensive mirror of) the validation
// ecomm-ai's write-side applies to `whatsapp_number` — this template must
// never trust that upstream data was validated, since the overlay is
// best-effort JSON from a remote endpoint (see `site-config.ts`).
const WHATSAPP_NUMBER_RE = /^\+?[1-9]\d{7,14}$/;

export const isValidWhatsappNumber = (
  value: string | null | undefined,
): value is string =>
  typeof value === "string" && WHATSAPP_NUMBER_RE.test(value.trim());

// Builds a `wa.me` click-to-chat link. `wa.me` expects digits only (no
// leading "+"), so it's stripped here regardless of whether the stored
// value carries one.
export const whatsappLink = (number: string, message?: string): string => {
  const digits = number.trim().replace(/^\+/, "");
  const url = new URL(`https://wa.me/${digits}`);
  if (message) url.searchParams.set("text", message);
  return url.toString();
};
