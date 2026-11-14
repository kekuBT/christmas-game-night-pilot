/**
 * Know Your Rivals questions (Stage 12.14, original, provisional, practice-only). Each is a light "this or that" about
 * yourself: everyday preferences only, nothing personal or sensitive, and every answer is fine. Players may also say
 * "Rather not say". Only each team's totals are ever shown.
 *
 * Ids are stable: never reuse one for a different question. `season: "christmas"` questions are dealt only in
 * Christmas sessions (Stage 8.2).
 */
import type { ItemSeason } from "../../../shared/season.js";

export interface RivalsQuestion {
  id: string;
  /** The question, e.g. "Tea or coffee?". */
  prompt: string;
  /** The two choices, short enough for a button. */
  a: string;
  b: string;
  season?: ItemSeason;
}

const q = (id: string, prompt: string, a: string, b: string, season?: ItemSeason): RivalsQuestion => ({ id, prompt, a, b, ...(season ? { season } : {}) });

export const RIVALS_QUESTIONS: readonly RivalsQuestion[] = [
  q("kyr-001", "Tea or coffee?", "Tea", "Coffee"),
  q("kyr-002", "Beach or mountains?", "Beach", "Mountains"),
  q("kyr-003", "Early bird or night owl?", "Early bird", "Night owl"),
  q("kyr-004", "Sweet or savoury breakfast?", "Sweet", "Savoury"),
  q("kyr-005", "Cats or dogs?", "Cats", "Dogs"),
  q("kyr-006", "Summer or winter?", "Summer", "Winter"),
  q("kyr-007", "Books or films?", "Books", "Films"),
  q("kyr-008", "Call or text?", "Call", "Text"),
  q("kyr-009", "Window seat or aisle seat?", "Window", "Aisle"),
  q("kyr-010", "Pancakes or waffles?", "Pancakes", "Waffles"),
  q("kyr-011", "Sunrise or sunset?", "Sunrise", "Sunset"),
  q("kyr-012", "City or countryside?", "City", "Countryside"),
  q("kyr-013", "Spicy food?", "Yes please", "No thanks"),
  q("kyr-014", "Board games or video games?", "Board games", "Video games"),
  q("kyr-015", "Plan everything or go with the flow?", "Plan it", "Go with the flow"),
  q("kyr-016", "Ice cream in a cone or a cup?", "Cone", "Cup"),
  q("kyr-017", "Shower in the morning or at night?", "Morning", "Night"),
  q("kyr-018", "Socks on or off in bed?", "On", "Off"),
  q("kyr-019", "Do you sing in the shower?", "Yes", "No"),
  q("kyr-020", "Rain or snow?", "Rain", "Snow"),
  q("kyr-021", "Pizza: thin crust or deep pan?", "Thin crust", "Deep pan"),
  q("kyr-022", "Bus or train?", "Bus", "Train"),
  q("kyr-023", "Early to a party or a little late?", "Early", "A little late"),
  q("kyr-024", "Chocolate or crisps?", "Chocolate", "Crisps"),
  q("kyr-025", "Front row or back row?", "Front row", "Back row"),
  q("kyr-026", "Hot drink or cold drink?", "Hot", "Cold"),
  q("kyr-027", "A scary film or a funny film?", "Scary", "Funny"),
  q("kyr-028", "Lost: check a map or ask someone?", "Map", "Ask someone"),
  q("kyr-029", "Lift or stairs?", "Lift", "Stairs"),
  q("kyr-030", "Bananas: green or spotty?", "Green", "Spotty"),
  q("kyr-031", "Popcorn: sweet or salty?", "Sweet", "Salty"),
  q("kyr-032", "Fruit salad or chocolate cake?", "Fruit salad", "Chocolate cake"),
  q("kyr-033", "Holiday: relax or explore?", "Relax", "Explore"),
  q("kyr-034", "Reply to a message straight away or later?", "Straight away", "Later"),
  q("kyr-035", "Football: watch it or play it?", "Watch", "Play"),
  q("kyr-036", "Morning walk or evening walk?", "Morning", "Evening"),
  q("kyr-037", "Rice or chapati?", "Rice", "Chapati"),
  q("kyr-038", "Mango or pineapple?", "Mango", "Pineapple"),
  q("kyr-039", "Hot weather or cool weather?", "Hot", "Cool"),
  q("kyr-040", "Dance at a party or chat at a party?", "Dance", "Chat"),
  q("kyr-041", "Sing along or listen?", "Sing along", "Listen"),
  q("kyr-042", "Breakfast in bed or at the table?", "In bed", "At the table"),
  q("kyr-101", "A real tree or an artificial tree?", "Real", "Artificial", "christmas"),
  q("kyr-102", "Open presents on Christmas Eve or Christmas morning?", "Eve", "Morning", "christmas"),
  q("kyr-103", "Gift wrapping: neat or \"it'll do\"?", "Neat", "It'll do", "christmas"),
  q("kyr-104", "Christmas songs from November, or only in December?", "November", "December", "christmas"),
  q("kyr-105", "Christmas jumpers?", "Love them", "No thanks", "christmas"),
  q("kyr-106", "Decorations: lots of colours or one or two?", "Lots", "One or two", "christmas"),
  q("kyr-107", "Snowball fight or hot chocolate by the fire?", "Snowballs", "Hot chocolate", "christmas"),
  q("kyr-108", "Carols: sing out loud or hum along?", "Sing out", "Hum along", "christmas"),
  q("kyr-109", "Christmas lights: white or coloured?", "White", "Coloured", "christmas"),
  q("kyr-110", "Christmas dinner: more food or more pudding?", "More food", "More pudding", "christmas"),
  q("kyr-111", "Wrap presents early or the night before?", "Early", "Night before", "christmas"),
  q("kyr-112", "Christmas film: a new one or an old favourite?", "New one", "Old favourite", "christmas"),
];
