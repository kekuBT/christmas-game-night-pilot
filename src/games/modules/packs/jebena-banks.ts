/**
 * Jebena Rush answer banks (Stage 9.1, docs/stage9/stage91.md §7).
 *
 * Six year-round categories. Each answer has a stable id (never reused for
 * a different answer), a display name, and the other names a player may
 * type for the SAME thing (`aliases`). Matching (src/games/modules/jebenaMatch.ts)
 * also ignores case, accents, punctuation, spacing and a leading
 * "a/an/the", folds a plural onto a listed answer, and accepts a one-edit
 * typo only when it is unambiguous.
 *
 * Provenance: Animals, Fruits, Vegetables, Sports and Jobs start from the
 * reviewed Category Sprint lists (content/packs/category-sprint-s4.json,
 * spr-s4-002/001/004/005/009) and are extended here; Countries in Africa is
 * the source-verified closed set (content/packs/category-sprint-closed.json,
 * spr-cs-africa: the 54 UN member states in Africa), with its aliases and
 * its "not accepted" reasons (including the two Congos). Where the Sprint
 * lists named one thing twice (aubergine/eggplant, courgette/zucchini),
 * the second name is an alias here, so it counts once.
 *
 * Status: provisional and practice-only, like the Majority and Draw packs.
 * Before any official use it would move into the content-pack system for
 * human review. A finite bank never knows every valid answer: the game says
 * "not in this bank", never "wrong".
 *
 * Bump JEBENA_BANK_VERSION whenever an answer, alias or reason changes; a
 * game records the version it started with.
 */

export const JEBENA_BANK_VERSION = "jr-bank-1";

export interface JebenaAnswer {
  /** Stable id, unique across every category. */
  id: string;
  /** Shown once accepted. */
  name: string;
  /** Other names for the same thing, as a player might type them. */
  aliases?: readonly string[];
}

export interface JebenaCategory {
  id: string;
  name: string;
  /** One line shown under the name. */
  definition: string;
  /** Where the list came from, for reviewers. */
  source: string;
  answers: readonly JebenaAnswer[];
  /** Typed answers deliberately not accepted, with the reason the player is shown. */
  notAccepted?: Readonly<Record<string, string>>;
}

const a = (prefix: string, name: string, ...aliases: string[]): JebenaAnswer => ({
  id: `${prefix}-${name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`,
  name,
  ...(aliases.length ? { aliases } : {}),
});

const ANIMALS = (n: string, ...al: string[]) => a("jr-ani", n, ...al);
const FRUITS = (n: string, ...al: string[]) => a("jr-fru", n, ...al);
const VEG = (n: string, ...al: string[]) => a("jr-veg", n, ...al);
const AFRICA = (n: string, ...al: string[]) => a("jr-afr", n, ...al);
const SPORTS = (n: string, ...al: string[]) => a("jr-spo", n, ...al);
const JOBS = (n: string, ...al: string[]) => a("jr-job", n, ...al);

export const JEBENA_CATEGORIES: readonly JebenaCategory[] = [
  {
    id: "jr-animals",
    name: "Animals",
    definition: "Any animal: mammals, birds, fish, reptiles, insects and more.",
    source: "Category Sprint spr-s4-002 (38 reviewed), extended for Stage 9.1",
    answers: [
      ANIMALS("Badger"), ANIMALS("Bat"), ANIMALS("Bear"), ANIMALS("Camel"), ANIMALS("Cat", "kitten", "kitty"),
      ANIMALS("Cheetah"), ANIMALS("Cow", "cattle", "bull", "calf", "ox", "oxen"), ANIMALS("Deer"), ANIMALS("Dog", "puppy", "doggy"),
      ANIMALS("Dolphin"), ANIMALS("Elephant"), ANIMALS("Fox"), ANIMALS("Giraffe"), ANIMALS("Goat"), ANIMALS("Gorilla"),
      ANIMALS("Hedgehog"), ANIMALS("Hippo", "hippopotamus", "hippopotami"), ANIMALS("Horse", "pony", "foal"),
      ANIMALS("Kangaroo"), ANIMALS("Koala", "koala bear"), ANIMALS("Leopard"), ANIMALS("Lion", "lioness"),
      ANIMALS("Monkey"), ANIMALS("Moose"), ANIMALS("Mouse", "mice"), ANIMALS("Otter"), ANIMALS("Panda", "giant panda"),
      ANIMALS("Pig", "piglet", "hog", "swine"), ANIMALS("Rabbit", "bunny"), ANIMALS("Rat"),
      ANIMALS("Rhino", "rhinoceros"), ANIMALS("Seal"), ANIMALS("Sheep", "lamb", "ram", "ewe"), ANIMALS("Squirrel"),
      ANIMALS("Tiger"), ANIMALS("Whale"), ANIMALS("Wolf", "wolves"), ANIMALS("Zebra"),
      // Added for Stage 9.1: well-known animals beyond the mammals above.
      ANIMALS("Alligator"), ANIMALS("Ant"), ANIMALS("Antelope"), ANIMALS("Bee", "honeybee", "bumblebee"),
      ANIMALS("Beetle"), ANIMALS("Butterfly", "butterflies"), ANIMALS("Chicken", "hen", "rooster", "chick", "cockerel"),
      ANIMALS("Chimpanzee", "chimp"), ANIMALS("Crab"), ANIMALS("Crocodile", "croc"), ANIMALS("Donkey"),
      ANIMALS("Duck", "duckling"), ANIMALS("Eagle"), ANIMALS("Flamingo"), ANIMALS("Frog"), ANIMALS("Goose", "geese"),
      ANIMALS("Hamster"), ANIMALS("Hyena"), ANIMALS("Jaguar"), ANIMALS("Jellyfish"), ANIMALS("Lizard"),
      ANIMALS("Lobster"), ANIMALS("Meerkat"), ANIMALS("Octopus", "octopuses", "octopi"), ANIMALS("Ostrich"),
      ANIMALS("Owl"), ANIMALS("Parrot"), ANIMALS("Peacock", "peafowl"), ANIMALS("Penguin"), ANIMALS("Pigeon"),
      ANIMALS("Polar bear"), ANIMALS("Shark"), ANIMALS("Snail"), ANIMALS("Snake"), ANIMALS("Spider"),
      ANIMALS("Swan"), ANIMALS("Tortoise"), ANIMALS("Turtle"), ANIMALS("Walrus"), ANIMALS("Warthog"),
      ANIMALS("Worm", "earthworm"), ANIMALS("Buffalo"), ANIMALS("Hare"), ANIMALS("Mole"),
      ANIMALS("Salmon"), ANIMALS("Goldfish"), ANIMALS("Gecko"), ANIMALS("Cobra"), ANIMALS("Vulture"),
      ANIMALS("Baboon"), ANIMALS("Gazelle"), ANIMALS("Lemur"), ANIMALS("Sloth"), ANIMALS("Raccoon"),
      ANIMALS("Skunk"), ANIMALS("Beaver"), ANIMALS("Llama"), ANIMALS("Dove"), ANIMALS("Bison"),
    ],
    notAccepted: {
      "animal": "That's the category itself: name a particular animal.",
      "fish": "Name a particular fish, like salmon or shark.",
      "bird": "Name a particular bird, like an eagle or an owl.",
      "insect": "Name a particular insect, like an ant or a bee.",
    },
  },
  {
    id: "jr-fruits",
    name: "Fruits",
    definition: "Fruits people eat as fruit (tomatoes and peppers are in Vegetables here).",
    source: "Category Sprint spr-s4-001 (35 reviewed), extended for Stage 9.1",
    answers: [
      FRUITS("Apple"), FRUITS("Apricot"), FRUITS("Banana"), FRUITS("Blackberry", "blackberries", "bramble"),
      FRUITS("Blueberry", "blueberries"), FRUITS("Cherry", "cherries"), FRUITS("Clementine"), FRUITS("Coconut"),
      FRUITS("Cranberry", "cranberries"), FRUITS("Date"), FRUITS("Fig"), FRUITS("Gooseberry", "gooseberries"),
      FRUITS("Grape"), FRUITS("Grapefruit"), FRUITS("Guava"), FRUITS("Kiwi", "kiwi fruit", "kiwifruit"),
      FRUITS("Lemon"), FRUITS("Lime"), FRUITS("Lychee", "litchi", "lichee"), FRUITS("Mango", "mangoes"),
      FRUITS("Melon"), FRUITS("Nectarine"), FRUITS("Orange"), FRUITS("Papaya", "pawpaw", "paw paw"),
      FRUITS("Passion fruit", "passionfruit", "granadilla"), FRUITS("Peach", "peaches"), FRUITS("Pear"),
      FRUITS("Pineapple"), FRUITS("Plum"), FRUITS("Pomegranate"), FRUITS("Raspberry", "raspberries"),
      FRUITS("Satsuma"), FRUITS("Strawberry", "strawberries"), FRUITS("Tangerine"), FRUITS("Watermelon", "water melon"),
      // Added for Stage 9.1.
      FRUITS("Avocado", "avocados", "avocadoes"), FRUITS("Blackcurrant", "black currant"), FRUITS("Cantaloupe", "rockmelon"),
      FRUITS("Dragon fruit", "dragonfruit", "pitaya", "pitahaya"), FRUITS("Durian"), FRUITS("Honeydew", "honeydew melon"),
      FRUITS("Jackfruit"), FRUITS("Kumquat"), FRUITS("Mandarin"), FRUITS("Mulberry", "mulberries"),
      FRUITS("Persimmon", "sharon fruit"), FRUITS("Plantain"), FRUITS("Quince"), FRUITS("Star fruit", "starfruit", "carambola"),
      FRUITS("Tamarind"), FRUITS("Pomelo"), FRUITS("Custard apple", "cherimoya"), FRUITS("Breadfruit"),
      FRUITS("Elderberry", "elderberries"), FRUITS("Redcurrant", "red currant"), FRUITS("Prickly pear", "cactus fruit"),
    ],
    notAccepted: {
      "tomato": "Botanically a fruit, but here tomatoes are in Vegetables.",
      "rhubarb": "Cooked like a fruit, but it's a stalk: not in Fruits here.",
      "fruit": "That's the category itself: name a particular fruit.",
      "berry": "Name a particular berry, like a strawberry.",
      "raisin": "A dried grape: say grape.",
    },
  },
  {
    id: "jr-vegetables",
    name: "Vegetables",
    definition: "Vegetables, including salad leaves, roots and pulses in the pod.",
    source: "Category Sprint spr-s4-004 (32 reviewed, two pairs merged as aliases), extended for Stage 9.1",
    answers: [
      VEG("Asparagus"), VEG("Aubergine", "eggplant", "brinjal"), VEG("Bean", "green bean", "runner bean", "string bean", "broad bean", "french bean", "fava bean"),
      VEG("Beetroot", "beet"), VEG("Broccoli"), VEG("Cabbage"), VEG("Carrot"), VEG("Cauliflower"), VEG("Celery"),
      VEG("Courgette", "zucchini"), VEG("Cucumber"), VEG("Garlic"), VEG("Kale"), VEG("Leek"), VEG("Lettuce"),
      VEG("Mushroom"), VEG("Onion"), VEG("Parsnip"), VEG("Pea", "garden pea"), VEG("Pepper", "bell pepper", "capsicum", "sweet pepper"),
      VEG("Potato", "potatoes", "spud"), VEG("Pumpkin"), VEG("Radish", "radishes"), VEG("Spinach"),
      VEG("Brussels sprout", "sprout", "brussel sprout"), VEG("Squash", "butternut squash", "butternut"),
      VEG("Swede", "rutabaga"), VEG("Sweetcorn", "corn", "sweet corn", "maize", "corn on the cob"),
      VEG("Tomato", "tomatoes"), VEG("Turnip"),
      // Added for Stage 9.1.
      VEG("Artichoke"), VEG("Bok choy", "pak choi", "bok choi"), VEG("Chilli", "chili", "chilli pepper", "chile"),
      VEG("Collard greens", "collards", "gomen"), VEG("Fennel"), VEG("Okra", "ladies fingers", "lady finger"),
      VEG("Rocket", "arugula"), VEG("Shallot"), VEG("Spring onion", "scallion", "green onion"),
      VEG("Sweet potato", "sweet potatoes"), VEG("Chard", "swiss chard"), VEG("Watercress", "cress"),
      VEG("Yam"), VEG("Cassava", "manioc", "yuca"), VEG("Celeriac"), VEG("Kohlrabi"), VEG("Endive", "chicory"),
      VEG("Mangetout", "snow pea", "sugar snap pea", "sugar snap"),
    ],
    notAccepted: {
      "vegetable": "That's the category itself: name a particular vegetable.",
      "salad": "Name a particular leaf, like lettuce or rocket.",
      "veg": "Name a particular vegetable.",
    },
  },
  {
    id: "jr-africa",
    name: "Countries in Africa",
    definition: "The 54 UN member states in Africa.",
    source: "Category Sprint closed set spr-cs-africa (source-verified, 54), aliases and reasons reused",
    answers: [
      AFRICA("Algeria"), AFRICA("Angola"), AFRICA("Benin"), AFRICA("Botswana"), AFRICA("Burkina Faso"), AFRICA("Burundi"),
      AFRICA("Cabo Verde", "cape verde"), AFRICA("Cameroon"), AFRICA("Central African Republic"), AFRICA("Chad"),
      AFRICA("Comoros"), AFRICA("Côte d'Ivoire", "ivory coast", "cote divoire"),
      AFRICA("Democratic Republic of the Congo", "dr congo", "drc", "democratic republic of congo", "congo kinshasa"),
      AFRICA("Djibouti"), AFRICA("Egypt"), AFRICA("Equatorial Guinea"), AFRICA("Eritrea"), AFRICA("Eswatini", "swaziland"),
      AFRICA("Ethiopia"), AFRICA("Gabon"), AFRICA("Gambia"), AFRICA("Ghana"), AFRICA("Guinea"), AFRICA("Guinea-Bissau"),
      AFRICA("Kenya"), AFRICA("Lesotho"), AFRICA("Liberia"), AFRICA("Libya"), AFRICA("Madagascar"), AFRICA("Malawi"),
      AFRICA("Mali"), AFRICA("Mauritania"), AFRICA("Mauritius"), AFRICA("Morocco"), AFRICA("Mozambique"), AFRICA("Namibia"),
      AFRICA("Niger"), AFRICA("Nigeria"),
      AFRICA("Republic of the Congo", "congo brazzaville", "republic of congo", "congo republic", "congo republic of"),
      AFRICA("Rwanda"), AFRICA("São Tomé and Príncipe", "sao tome"), AFRICA("Senegal"), AFRICA("Seychelles"),
      AFRICA("Sierra Leone"), AFRICA("Somalia"), AFRICA("South Africa"), AFRICA("South Sudan"), AFRICA("Sudan"),
      AFRICA("Tanzania", "united republic of tanzania"), AFRICA("Togo"), AFRICA("Tunisia"), AFRICA("Uganda"),
      AFRICA("Zambia"), AFRICA("Zimbabwe"),
    ],
    notAccepted: {
      "western sahara": "A disputed territory, not a UN member state.",
      "somaliland": "Self-declared state, not a UN member.",
      "sahrawi arab democratic republic": "An African Union member but not a UN member state.",
      "canary islands": "Part of Spain.",
      "madeira": "Part of Portugal.",
      "reunion": "An overseas department of France.",
      "congo": "Two countries are called Congo: type Republic of the Congo (Congo-Brazzaville) or DR Congo (Congo-Kinshasa).",
      "africa": "That's the continent: name a country in it.",
    },
  },
  {
    id: "jr-sports",
    name: "Sports",
    definition: "Sports people play or compete in.",
    source: "Category Sprint spr-s4-005 (30 reviewed), extended for Stage 9.1",
    answers: [
      SPORTS("Archery"), SPORTS("Badminton"), SPORTS("Baseball"), SPORTS("Basketball"), SPORTS("Bowling", "ten pin bowling", "tenpin bowling"),
      SPORTS("Boxing"), SPORTS("Climbing", "rock climbing", "bouldering"), SPORTS("Cricket"), SPORTS("Cycling", "biking", "bike racing"),
      SPORTS("Darts"), SPORTS("Fencing"), SPORTS("Football", "soccer", "association football"), SPORTS("Golf"),
      SPORTS("Gymnastics"), SPORTS("Hockey", "field hockey"), SPORTS("Judo"), SPORTS("Karate"), SPORTS("Netball"),
      SPORTS("Rowing"), SPORTS("Rugby", "rugby union", "rugby league"), SPORTS("Running", "jogging"),
      SPORTS("Sailing"), SPORTS("Skiing"), SPORTS("Snooker"), SPORTS("Snowboarding"), SPORTS("Squash"),
      SPORTS("Surfing"), SPORTS("Swimming"), SPORTS("Tennis"), SPORTS("Volleyball", "beach volleyball"),
      // Added for Stage 9.1.
      SPORTS("American football", "gridiron"), SPORTS("Athletics", "track and field"), SPORTS("Canoeing", "kayaking"),
      SPORTS("Diving"), SPORTS("Horse riding", "equestrian", "showjumping", "horseback riding"), SPORTS("Handball"),
      SPORTS("Ice hockey"), SPORTS("Lacrosse"), SPORTS("Motor racing", "formula one", "f1", "car racing"),
      SPORTS("Polo"), SPORTS("Skateboarding"), SPORTS("Softball"), SPORTS("Table tennis", "ping pong"),
      SPORTS("Taekwondo"), SPORTS("Triathlon"), SPORTS("Water polo"), SPORTS("Weightlifting", "weight lifting"),
      SPORTS("Wrestling"), SPORTS("Ice skating", "figure skating", "skating"), SPORTS("Curling"), SPORTS("Pool", "eight ball"),
      SPORTS("Marathon"), SPORTS("Kickboxing"), SPORTS("Bobsleigh", "bobsled"),
    ],
    notAccepted: {
      "sport": "That's the category itself: name a particular sport.",
      "ball": "Name a sport played with one, like football.",
    },
  },
  {
    id: "jr-jobs",
    name: "Jobs",
    definition: "Jobs and professions.",
    source: "Category Sprint spr-s4-009 (30 reviewed), extended for Stage 9.1",
    answers: [
      JOBS("Actor", "actress"), JOBS("Artist"), JOBS("Baker"), JOBS("Builder", "construction worker", "bricklayer"),
      JOBS("Chef", "cook"), JOBS("Cleaner", "janitor", "caretaker"), JOBS("Dentist"), JOBS("Doctor", "physician", "gp"),
      JOBS("Driver", "taxi driver", "bus driver", "lorry driver", "truck driver", "chauffeur"), JOBS("Electrician"),
      JOBS("Engineer"), JOBS("Farmer"), JOBS("Firefighter", "fireman", "firewoman"), JOBS("Gardener"), JOBS("Judge"),
      JOBS("Lawyer", "solicitor", "barrister", "attorney"), JOBS("Nurse"), JOBS("Pilot"), JOBS("Plumber"),
      JOBS("Police officer", "policeman", "policewoman", "cop", "police"), JOBS("Postal worker", "postman", "postwoman", "mail carrier", "mailman"),
      JOBS("Sailor"), JOBS("Scientist"), JOBS("Shopkeeper"), JOBS("Singer"), JOBS("Soldier"), JOBS("Teacher"),
      JOBS("Vet", "veterinarian", "veterinary surgeon"), JOBS("Waiter", "waitress", "server"), JOBS("Writer", "author", "novelist"),
      // Added for Stage 9.1.
      JOBS("Accountant"), JOBS("Architect"), JOBS("Astronaut"), JOBS("Barber"), JOBS("Butcher"), JOBS("Carpenter", "joiner"),
      JOBS("Cashier"), JOBS("Dancer"), JOBS("Hairdresser", "hair stylist", "hairstylist"), JOBS("Journalist", "reporter"),
      JOBS("Librarian"), JOBS("Mechanic"), JOBS("Midwife"), JOBS("Musician"), JOBS("Paramedic"), JOBS("Pharmacist"),
      JOBS("Photographer"), JOBS("Professor", "lecturer"), JOBS("Programmer", "software developer", "coder", "software engineer"),
      JOBS("Receptionist"), JOBS("Secretary"), JOBS("Security guard"), JOBS("Surgeon"), JOBS("Tailor", "dressmaker", "seamstress"),
      JOBS("Translator", "interpreter"), JOBS("Zookeeper"), JOBS("Banker"), JOBS("Coach"), JOBS("Optician"),
      JOBS("Shop assistant", "sales assistant"), JOBS("Fisherman", "fisher"), JOBS("Designer"), JOBS("Priest"),
      JOBS("Painter", "decorator", "painter and decorator"),
    ],
    notAccepted: {
      "job": "That's the category itself: name a particular job.",
      "worker": "Name a particular job.",
    },
  },
];
