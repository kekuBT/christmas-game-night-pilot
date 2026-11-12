/**
 * Spectrum (Stage 9.2): an ORIGINAL pack of opposing pairs, written for this
 * project (docs/stage9/stage92.md §9). Each pair is a scale from its left end
 * (0) to its right end (100), with a one-line meaning of what it measures.
 *
 * Rules for this pack: year-round (nothing Christmas-specific), and nothing
 * that ranks people (looks, wealth, nationality, religion, body,
 * intelligence): pairs measure things, places, foods, activities and moments.
 * Ids are stable and never reused. Status: provisional, practice-only; before
 * any official use it would move into the reviewed content-pack system.
 * The server keeps it: it never ships to browsers.
 */
export interface SpectrumPair {
  id: string;
  /** The 0 end of the scale. */
  left: string;
  /** The 100 end of the scale. */
  right: string;
  /** What the scale measures, in one line. */
  meaning: string;
}

export const SPECTRUM_PACK_VERSION = "sp-pairs-1";

export const SPECTRUM_PAIRS: readonly SpectrumPair[] = [
  { id: "sp-cold-hot", left: "Cold", right: "Hot", meaning: "How hot something is." },
  { id: "sp-quiet-loud", left: "Quiet", right: "Loud", meaning: "How much noise it makes." },
  { id: "sp-tiny-huge", left: "Tiny", right: "Huge", meaning: "How big it is." },
  { id: "sp-slow-fast", left: "Slow", right: "Fast", meaning: "How fast it goes." },
  { id: "sp-boring-exciting", left: "Boring", right: "Exciting", meaning: "How exciting it is." },
  { id: "sp-easy-difficult", left: "Easy", right: "Difficult", meaning: "How hard it is to do." },
  { id: "sp-cheap-pricey", left: "Cheap", right: "Pricey", meaning: "How much it usually costs." },
  { id: "sp-soft-firm", left: "Soft", right: "Firm", meaning: "How it feels when you press it." },
  { id: "sp-useless-useful", left: "Useless", right: "Useful", meaning: "How handy it is." },
  { id: "sp-calm-chaotic", left: "Calm", right: "Chaotic", meaning: "How wild things get." },
  { id: "sp-oldfashioned-modern", left: "Old-fashioned", right: "Modern", meaning: "How up to date it feels." },
  { id: "sp-sweet-savoury", left: "Sweet", right: "Savoury", meaning: "How it tastes." },
  { id: "sp-indoors-outdoors", left: "Indoors", right: "Outdoors", meaning: "Where you'd usually do it." },
  { id: "sp-rare-everyday", left: "Rare", right: "Everyday", meaning: "How often you come across it." },
  { id: "sp-brief-lasting", left: "Over in a moment", right: "Lasts for ages", meaning: "How long it lasts." },
  { id: "sp-light-heavy", left: "Light", right: "Heavy", meaning: "How much it weighs." },
  { id: "sp-safe-risky", left: "Safe", right: "Risky", meaning: "How much could go wrong." },
  { id: "sp-tidy-messy", left: "Tidy", right: "Messy", meaning: "How much mess it makes." },
  { id: "sp-plain-colourful", left: "Plain", right: "Colourful", meaning: "How colourful it is." },
  { id: "sp-restful-tiring", left: "Restful", right: "Tiring", meaning: "How worn out it leaves you." },
  { id: "sp-silly-serious", left: "Silly", right: "Serious", meaning: "How serious it is." },
  { id: "sp-mild-strong", left: "Mild", right: "Strong", meaning: "How strong its taste or smell is." },
  { id: "sp-morning-night", left: "Early morning", right: "Late at night", meaning: "When it best belongs." },
  { id: "sp-alone-crowd", left: "On your own", right: "With a crowd", meaning: "How many people it's best with." },
  { id: "sp-forgettable-unforgettable", left: "Forgettable", right: "Unforgettable", meaning: "How long you'd remember it." },
  { id: "sp-cosy-spooky", left: "Cosy", right: "Spooky", meaning: "How spooky it feels." },
  { id: "sp-dry-wet", left: "Dry", right: "Wet", meaning: "How wet it gets." },
  { id: "sp-smooth-rough", left: "Smooth", right: "Rough", meaning: "How rough it feels." },
  { id: "sp-underrated-overrated", left: "Underrated", right: "Overrated", meaning: "How much fuss people make about it." },
  { id: "sp-simple-complicated", left: "Simple", right: "Complicated", meaning: "How many steps or parts it has." },
];
