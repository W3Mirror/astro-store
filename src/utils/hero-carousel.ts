// The homepage hero carousel's behavior (see `components/Hero.astro`).
// Vanilla TS, no dependencies: a small DOM-free rotation controller (unit
// tested in `scripts/hero-settings.test.mjs`) plus the DOM wiring around it.
//
// Accessibility (WAI-ARIA APG carousel pattern, WCAG 2.2.2):
// - autoplay only when `hero_autoplay_seconds` > 0, and NEVER by default
//   under `prefers-reduced-motion: reduce` — the rotation control then
//   starts in its "Play" state, so a shopper can still opt in;
// - rotation pauses while the pointer is over the carousel and while the
//   tab is hidden, and STOPS when keyboard/pointer focus enters it (it only
//   resumes when the shopper activates the rotation control);
// - the slides region is `aria-live="off"` while rotating and "polite"
//   otherwise, so manual navigation is announced but autoplay isn't.

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const SWIPE_THRESHOLD_PX = 40;

export interface RotationScheduler {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface HeroRotationOptions {
  total: number;
  autoplaySeconds: number;
  reducedMotion: boolean;
  scheduler: RotationScheduler;
  onChange?: (state: HeroRotationState) => void;
}

export interface HeroRotationState {
  index: number;
  rotating: boolean;
  userPaused: boolean;
  canAutoplay: boolean;
}

export interface HeroRotation {
  readonly state: HeroRotationState;
  goTo(index: number): void;
  next(): void;
  prev(): void;
  toggleRotation(): void;
  setHovered(hovered: boolean): void;
  focusEntered(): void;
  focusLeft(): void;
  setPageVisible(visible: boolean): void;
  setReducedMotion(reduced: boolean): void;
  destroy(): void;
}

export function createHeroRotation(options: HeroRotationOptions): HeroRotation {
  const total = Math.max(0, Math.floor(options.total));
  const seconds = Number.isFinite(options.autoplaySeconds)
    ? Math.max(0, Math.floor(options.autoplaySeconds))
    : 0;
  const canAutoplay = total > 1 && seconds > 0;
  let index = 0;
  // Reduced motion: never start rotating on our own.
  let userPaused = options.reducedMotion;
  let hovered = false;
  let pageVisible = true;
  let timer: unknown = null;

  const isRotating = () =>
    canAutoplay && !userPaused && !hovered && pageVisible;

  const snapshot = (): HeroRotationState => ({
    index,
    rotating: isRotating(),
    userPaused,
    canAutoplay,
  });

  const emit = () => options.onChange?.(snapshot());

  const reschedule = () => {
    if (timer !== null) {
      options.scheduler.clear(timer);
      timer = null;
    }
    if (isRotating()) {
      timer = options.scheduler.set(() => {
        timer = null;
        index = (index + 1) % total;
        reschedule();
        emit();
      }, seconds * 1000);
    }
  };

  const goTo = (target: number) => {
    if (total === 0) return;
    index = ((target % total) + total) % total;
    reschedule();
    emit();
  };

  return {
    get state() {
      return snapshot();
    },
    goTo,
    next: () => goTo(index + 1),
    prev: () => goTo(index - 1),
    toggleRotation() {
      if (!canAutoplay) return;
      userPaused = !userPaused;
      reschedule();
      emit();
    },
    setHovered(value) {
      hovered = value;
      reschedule();
      emit();
    },
    focusEntered() {
      if (!canAutoplay || userPaused) return;
      userPaused = true;
      reschedule();
      emit();
    },
    focusLeft() {
      // Deliberately a no-op: once focus stopped rotation, only the
      // rotation control resumes it (APG).
    },
    setPageVisible(value) {
      pageVisible = value;
      reschedule();
      emit();
    },
    setReducedMotion(reduced) {
      if (reduced && !userPaused) {
        userPaused = true;
        reschedule();
        emit();
      }
    },
    destroy() {
      if (timer !== null) options.scheduler.clear(timer);
      timer = null;
    },
  };
}

type HeroWindow = Pick<
  Window,
  "matchMedia" | "setTimeout" | "clearTimeout" | "document"
>;

/** Wires one `[data-hero-carousel]` section to a `createHeroRotation` controller. */
export function initHeroCarousel(root: HTMLElement, win: HeroWindow): void {
  const slides = Array.from(
    root.querySelectorAll<HTMLElement>("[data-hero-slide]"),
  );
  if (slides.length < 2) return;
  const dots = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-hero-dot]"),
  );
  const live = root.querySelector<HTMLElement>("[data-hero-live]");
  const rotationButton = root.querySelector<HTMLButtonElement>(
    "[data-hero-rotation]",
  );
  const reducedMotion = win.matchMedia(REDUCED_MOTION_QUERY);

  const render = (state: HeroRotationState) => {
    slides.forEach((slide, i) => {
      const active = i === state.index;
      slide.toggleAttribute("data-active", active);
      slide.inert = !active;
      if (active) slide.removeAttribute("aria-hidden");
      else slide.setAttribute("aria-hidden", "true");
    });
    dots.forEach((dot, i) => {
      if (i === state.index) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    live?.setAttribute("aria-live", state.rotating ? "off" : "polite");
    if (rotationButton) {
      rotationButton.dataset.state = state.userPaused ? "paused" : "playing";
      rotationButton.setAttribute(
        "aria-label",
        state.userPaused ? "Play slideshow" : "Pause slideshow",
      );
    }
  };

  const rotation = createHeroRotation({
    total: slides.length,
    autoplaySeconds: Number(root.dataset.autoplaySeconds) || 0,
    reducedMotion: reducedMotion.matches,
    scheduler: {
      set: (callback, ms) => win.setTimeout(callback, ms),
      clear: (handle) => win.clearTimeout(handle as number),
    },
    onChange: render,
  });

  root
    .querySelectorAll<HTMLElement>("[data-hero-js]")
    .forEach((element) => (element.hidden = false));

  root
    .querySelector("[data-hero-prev]")
    ?.addEventListener("click", () => rotation.prev());
  root
    .querySelector("[data-hero-next]")
    ?.addEventListener("click", () => rotation.next());
  rotationButton?.addEventListener("click", () => rotation.toggleRotation());
  dots.forEach((dot, i) =>
    dot.addEventListener("click", () => rotation.goTo(i)),
  );

  root.addEventListener("mouseenter", () => rotation.setHovered(true));
  root.addEventListener("mouseleave", () => rotation.setHovered(false));
  root.addEventListener("focusin", (event) => {
    const from = (event as FocusEvent).relatedTarget as Node | null;
    // Focus moving INTO the carousel, and not onto the rotation control
    // itself (activating Play must not immediately stop it again).
    if ((!from || !root.contains(from)) && event.target !== rotationButton) {
      rotation.focusEntered();
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      rotation.prev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      rotation.next();
    }
  });

  let touchX: number | null = null;
  let touchY = 0;
  root.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      touchX = touch ? touch.clientX : null;
      touchY = touch ? touch.clientY : 0;
    },
    { passive: true },
  );
  root.addEventListener(
    "touchend",
    (event) => {
      const touch = event.changedTouches[0];
      if (touchX === null || !touch) return;
      const dx = touch.clientX - touchX;
      const dy = touch.clientY - touchY;
      touchX = null;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) {
        return;
      }
      if (dx < 0) rotation.next();
      else rotation.prev();
    },
    { passive: true },
  );

  win.document.addEventListener("visibilitychange", () =>
    rotation.setPageVisible(win.document.visibilityState === "visible"),
  );
  reducedMotion.addEventListener?.("change", (event) =>
    rotation.setReducedMotion(event.matches),
  );

  rotation.setPageVisible(win.document.visibilityState === "visible");
}
