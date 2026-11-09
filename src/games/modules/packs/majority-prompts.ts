/**
 * Majority Rules: an ORIGINAL provisional prompt pack (Stage 5), written for
 * this project. Family-appropriate either/or questions; none is copied from
 * a commercial party game. Status: provisional. The game is Practice-only;
 * before any official use these would move into the content-pack system for
 * human review (docs/stage5/README.md).
 */
export interface MajorityPrompt { id: string; prompt: string; a: string; b: string }

export const MAJORITY_PACK_VERSION = "mr-provisional-1";

export const MAJORITY_PROMPTS: readonly MajorityPrompt[] = [
  { id: "mr-01", prompt: "Which superpower would this room pick?", a: "Teleporting anywhere", b: "Reading minds" },
  { id: "mr-02", prompt: "A whole year of…", a: "Free holidays", b: "Free restaurant meals" },
  { id: "mr-03", prompt: "One night only:", a: "A sleepover in a haunted mansion", b: "A day alone on a desert island" },
  { id: "mr-04", prompt: "The perfect Sunday morning:", a: "Pancakes at home in pyjamas", b: "A sunrise walk and breakfast out" },
  { id: "mr-05", prompt: "Would the room rather talk to…", a: "Animals", b: "People from 200 years ago" },
  { id: "mr-06", prompt: "Pick a pet for a week:", a: "A very polite penguin", b: "A slightly cheeky monkey" },
  { id: "mr-07", prompt: "Stuck in a lift for an hour with…", a: "A stand-up comedian", b: "A famous chef with snacks" },
  { id: "mr-08", prompt: "Which would this room give up for a month?", a: "Dessert", b: "Their phone's camera" },
  { id: "mr-09", prompt: "Snow day plan:", a: "Snowball fight outside", b: "Blankets, cocoa and a film" },
  { id: "mr-10", prompt: "Would the room rather always be…", a: "Ten minutes early", b: "Exactly on time, out of breath" },
  { id: "mr-11", prompt: "A house with…", a: "A secret slide between floors", b: "A hidden library behind a bookcase" },
  { id: "mr-12", prompt: "Holiday by the…", a: "Sea", b: "Mountains" },
  { id: "mr-13", prompt: "Which job for one day?", a: "Zookeeper", b: "Astronaut on the space station" },
  { id: "mr-14", prompt: "Breakfast forever:", a: "Sweet", b: "Savoury" },
  { id: "mr-15", prompt: "Your talent show act:", a: "Juggling", b: "A song everyone joins in" },
  { id: "mr-16", prompt: "Which would this room rather find in the attic?", a: "A treasure map", b: "A time capsule from a grandparent" },
  { id: "mr-17", prompt: "Games night snack:", a: "Popcorn", b: "Crisps" },
  { id: "mr-18", prompt: "Would the room rather be able to…", a: "Fly, but only one metre off the ground", b: "Be invisible, but only when nobody is looking" },
  { id: "mr-19", prompt: "A robot helper that…", a: "Does the washing-up", b: "Tells brilliant bedtime stories" },
  { id: "mr-20", prompt: "Which season wins?", a: "Summer", b: "Winter" },
  { id: "mr-21", prompt: "Live in…", a: "A treehouse village", b: "An underwater dome" },
  { id: "mr-22", prompt: "The best gift is…", a: "A surprise", b: "Exactly what you asked for" },
  { id: "mr-23", prompt: "Movie night pick:", a: "Something funny", b: "Something scary" },
  { id: "mr-24", prompt: "Would the room rather know…", a: "How every magic trick works", b: "Every joke's perfect punchline" },
  { id: "mr-25", prompt: "Weekend away by…", a: "Train", b: "Road trip" },
  { id: "mr-26", prompt: "Which would this room rather be famous for?", a: "The best cake in town", b: "The loudest laugh in town" },
  { id: "mr-27", prompt: "A day with no…", a: "Music", b: "Television" },
  { id: "mr-28", prompt: "Explore…", a: "A rainforest", b: "The Arctic" },
  { id: "mr-29", prompt: "Would the room rather have a garden full of…", a: "Fruit trees", b: "Flowers" },
  { id: "mr-30", prompt: "Party theme:", a: "Fancy dress", b: "Pyjama party" },
  { id: "mr-31", prompt: "Keep forever:", a: "Every photo you've taken", b: "Every message you've received" },
  { id: "mr-32", prompt: "Which would this room rather master overnight?", a: "Every language", b: "Every instrument" },
];
