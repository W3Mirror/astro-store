export const storefrontPresets = [
  "minimal",
  "editorial",
  "conversion",
] as const;

export type StorefrontPreset = (typeof storefrontPresets)[number];

export const defaultStorefrontPreset: StorefrontPreset = "minimal";

const heroDefaults: Record<
  StorefrontPreset,
  { heading: string; subheading: string }
> = {
  minimal: {
    heading: "Considered goods for everyday life.",
    subheading:
      "A focused collection chosen for quality, utility, and lasting appeal.",
  },
  editorial: {
    heading: "Objects with a point of view.",
    subheading: "Meet the pieces, makers, and details defining this season.",
  },
  conversion: {
    heading: "The things you want, ready when you are.",
    subheading:
      "Shop customer favorites, fresh arrivals, and limited-time offers.",
  },
};

export function getPresetHeroDefaults(preset: StorefrontPreset) {
  return heroDefaults[preset];
}
