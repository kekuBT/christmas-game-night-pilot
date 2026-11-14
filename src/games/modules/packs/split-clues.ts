/**
 * Split Clues puzzles (Stage 12.10, original, provisional, practice-only). One answer, six clues: each clue alone is
 * weak, and together they point to one answer. Every teammate holds different clues, so the team has to talk.
 *
 * `kind` is shown to everyone ("An animal"). `alts` are other answers accepted (matching also ignores case, accents,
 * punctuation, a leading "a/an/the", a plural, and one typo in an answer of 7+ letters). A clue never contains its
 * answer. Ids are stable: never reuse one for a different puzzle. `season: "christmas"` puzzles are dealt only in
 * Christmas sessions (Stage 8.2).
 */
import type { ItemSeason } from "../../../shared/season.js";

export interface SplitPuzzle {
  id: string;
  kind: string;
  answer: string;
  alts?: string[];
  clues: readonly [string, string, string, string, string, string];
  season?: ItemSeason;
}

export const SPLIT_PUZZLES: readonly SplitPuzzle[] = [
  // ---- Everyday ----
  { id: "sc-001", kind: "A place", answer: "Kilimanjaro", alts: ["Mount Kilimanjaro", "Mt Kilimanjaro"], clues: [
    "Climbers walk through rainforest on the way up.", "It's in Tanzania.", "There's snow at the top, close to the equator.",
    "Volcanoes made it.", "Its highest point is Uhuru Peak.", "From far away it looks flat on top."] },
  { id: "sc-002", kind: "An animal", answer: "Giraffe", clues: [
    "It eats leaves from thorny trees.", "Its tongue can be dark purple.", "It sleeps only a few minutes at a time.",
    "No two have the same pattern of patches.", "It has as many neck bones as you do.", "It spreads its front legs wide to drink."] },
  { id: "sc-003", kind: "A thing", answer: "Umbrella", clues: [
    "You open it, then close it again.", "It has a handle.", "Some fold up small enough for a bag.",
    "It has thin metal ribs.", "Two people can share one.", "Opening it indoors is said to be bad luck."] },
  { id: "sc-004", kind: "A food", answer: "Chapati", alts: ["Chapatti", "Chapo"], clues: [
    "It's made from flour, water and oil.", "It's rolled out flat and round.", "It's cooked in a pan, not an oven.",
    "People tear it by hand to scoop up stew.", "It came to East Africa from India.", "In Kenya it's a favourite at celebrations."] },
  { id: "sc-005", kind: "A building", answer: "Lighthouse", clues: [
    "It's tall and round.", "It stands by the sea.", "At night its light turns or flashes.",
    "It keeps ships away from rocks.", "You climb a spiral staircase to the top.", "Some once had a keeper living inside."] },
  { id: "sc-006", kind: "A musical instrument", answer: "Piano", clues: [
    "Most have 88 of something.", "Some are 'grand', some are 'upright'.", "Inside, little hammers hit strings.",
    "It has pedals for your feet.", "It's black and white.", "You play it sitting on a stool."] },
  { id: "sc-007", kind: "An animal", answer: "Elephant", clues: [
    "It flaps its ears to keep cool.", "Its babies are called calves.", "The oldest female leads the family.",
    "It can sense sounds through its feet.", "It's the largest animal on land.", "It uses its nose like a hand."] },
  { id: "sc-008", kind: "A river", answer: "Nile", alts: ["River Nile", "The Nile"], clues: [
    "It flows north.", "It runs through Egypt.", "One of its sources is Lake Victoria.",
    "It has a White branch and a Blue branch.", "It ends in a delta on the Mediterranean.", "It's one of the longest in the world."] },
  { id: "sc-009", kind: "A sport", answer: "Football", alts: ["Soccer"], clues: [
    "Eleven players on each side.", "Only one player on each side may use their hands.", "A match has two halves.",
    "The referee can show yellow and red cards.", "Its World Cup is every four years.", "You can't be offside in your own half."] },
  { id: "sc-010", kind: "A fruit", answer: "Pineapple", clues: [
    "It's spiky on the outside.", "It has a crown of leaves.", "Its inside is yellow and juicy.",
    "It can make your tongue tingle.", "Each one takes over a year to grow.", "Some people put it on pizza."] },
  { id: "sc-011", kind: "A thing", answer: "Bicycle", alts: ["Bike", "Cycle", "Push bike"], clues: [
    "It has a chain.", "It has two wheels.", "It has pedals.",
    "You steer it with handlebars.", "It needs no fuel.", "Learners may use small extra wheels."] },
  { id: "sc-012", kind: "Something in nature", answer: "Rainbow", clues: [
    "You see it with the sun behind you.", "It needs rain or spray.", "It's shaped like an arc.",
    "It has seven colours, from red to violet.", "You can never reach its end.", "Stories say there's gold at the end."] },
  { id: "sc-013", kind: "A bird", answer: "Ostrich", clues: [
    "It can't fly.", "It lays the biggest eggs of any living bird.", "It can run at about 70 km/h.",
    "It has two toes on each foot.", "It's the tallest bird.", "People wrongly say it buries its head in sand."] },
  { id: "sc-014", kind: "A drink", answer: "Coffee", clues: [
    "Its beans are roasted.", "Kenya and Ethiopia are famous for growing it.", "An espresso is one way to serve it.",
    "It keeps people awake.", "Its plant has red berries called cherries.", "In Ethiopia it's poured from a jebena."] },
  { id: "sc-015", kind: "A thing", answer: "Mobile phone", alts: ["Phone", "Mobile", "Cell phone", "Cellphone", "Smartphone"], clues: [
    "It needs charging.", "It has a SIM card.", "M-Pesa runs on it.",
    "It can take photos.", "Most have a touch screen now.", "You can put it on silent."] },
  { id: "sc-016", kind: "An animal", answer: "Zebra", clues: [
    "It lives on the savannah.", "It travels with wildebeest in the great migration.", "It's related to the horse.",
    "Its stripes may confuse biting flies.", "No two have the same pattern.", "It's black and white."] },
  { id: "sc-017", kind: "A building", answer: "Pyramid", alts: ["Pyramids", "Great Pyramid"], clues: [
    "It has a square base.", "Its sides are triangles.", "The most famous are near Cairo.",
    "Some were built as tombs for kings.", "It's made of huge stone blocks.", "It comes to a point at the top."] },
  { id: "sc-018", kind: "A fruit", answer: "Mango", clues: [
    "It has one big flat seed.", "It's sweet and juicy.", "It can be green, yellow or red.",
    "It's India's national fruit.", "Its tree can live for over a hundred years.", "Some eat it with chilli and salt."] },
  { id: "sc-019", kind: "Something in the sky", answer: "Moon", alts: ["The moon"], clues: [
    "It has no light of its own.", "It pulls on the sea and makes tides.", "People first walked on it in 1969.",
    "It has craters.", "It always shows us the same side.", "Sometimes it's full, sometimes a crescent."] },
  { id: "sc-020", kind: "An animal", answer: "Lion", clues: [
    "It sleeps up to 20 hours a day.", "It lives in a group called a pride.", "The females do most of the hunting.",
    "Its roar carries for kilometres.", "The males have a mane.", "People call it the king of the jungle."] },
  { id: "sc-021", kind: "A thing", answer: "Toothbrush", clues: [
    "You use it twice a day.", "It has bristles.", "Dentists say to change it every three months.",
    "Some are electric.", "It goes with paste.", "It lives in the bathroom."] },
  { id: "sc-022", kind: "An event", answer: "Olympics", alts: ["Olympic Games", "The Olympics"], clues: [
    "It happens every four years.", "Its flag has five coloured rings.", "A flame is carried a long way before it starts.",
    "Kenyan runners win many medals there.", "It began in ancient Greece.", "Winners get gold medals."] },
  { id: "sc-023", kind: "A drink", answer: "Tea", alts: ["Chai"], clues: [
    "Kenya grows a lot of it around Kericho.", "It's made from dried leaves.", "Many have it with milk and sugar.",
    "It comes in bags.", "It's brewed in a pot.", "Some like it with ginger or masala spices."] },
  { id: "sc-024", kind: "A bird", answer: "Penguin", clues: [
    "It can't fly.", "It swims very well.", "It lives in the southern half of the world.",
    "Some huddle together through the winter.", "It looks like it's wearing a suit.", "It waddles."] },
  { id: "sc-025", kind: "Something in nature", answer: "Volcano", clues: [
    "It can be active, dormant or extinct.", "It may smoke.", "Mount Kenya is an old one.",
    "Its melted rock is called lava.", "It has a crater.", "Pompeii was buried by one."] },
  { id: "sc-026", kind: "A thing", answer: "Clock", clues: [
    "It has a face.", "It has hands.", "Big Ben's tower has a famous one.",
    "It ticks.", "Some have a cuckoo.", "Some ring an alarm."] },
  { id: "sc-027", kind: "A food", answer: "Honey", clues: [
    "It doesn't go off.", "It's sticky and sweet.", "It's made from nectar.",
    "It's stored in combs.", "It's golden.", "Some people stir it into tea."] },
  { id: "sc-028", kind: "A thing", answer: "Passport", clues: [
    "It has your photo.", "It collects stamps.", "You show it at airports.",
    "It has an expiry date.", "It shows your nationality.", "It's a small booklet."] },
  { id: "sc-029", kind: "An animal", answer: "Cheetah", clues: [
    "It's a big cat.", "It can't roar.", "It has black 'tear lines' on its face.",
    "It hunts in the daytime.", "It's the fastest land animal.", "It has spots."] },
  { id: "sc-030", kind: "Weather", answer: "Rain", clues: [
    "Kenya has long ones and short ones.", "It falls from clouds.", "Farmers wait for it.",
    "It can come with thunder.", "It fills dams.", "You might need an umbrella."] },
  { id: "sc-031", kind: "A place", answer: "Library", clues: [
    "It's quiet.", "You need a card to borrow.", "Things are sorted by number on shelves.",
    "You bring things back by a date.", "It's full of books.", "You can read there for free."] },
  { id: "sc-032", kind: "A place", answer: "Hospital", clues: [
    "It's open all night.", "It has wards.", "Ambulances arrive there.",
    "Nurses work there.", "Many babies are born there.", "It has an emergency room."] },
  { id: "sc-033", kind: "A vehicle", answer: "Matatu", alts: ["Matatus"], clues: [
    "It's a minibus.", "It often plays loud music.", "Many are painted with bright art.",
    "It carries passengers in Kenya.", "A conductor calls out the route.", "Its name comes from the Swahili for three."] },
  { id: "sc-034", kind: "A bird", answer: "Flamingo", clues: [
    "It's pink because of what it eats.", "It often stands on one leg.", "Lake Nakuru is famous for it.",
    "It eats with its head upside down.", "It has a long neck.", "It lives in large flocks."] },
  { id: "sc-035", kind: "A game", answer: "Chess", clues: [
    "It's played on 64 squares.", "Each side has 16 pieces.", "The horse-shaped piece moves in an L.",
    "A pawn can become a queen.", "The game ends with checkmate.", "Players often use a clock."] },
  { id: "sc-036", kind: "A tree", answer: "Baobab", clues: [
    "It can store water in its trunk.", "It can live for over a thousand years.", "Its fruit is dry, with a powdery inside.",
    "It loses its leaves in the dry season.", "Its trunk can be wider than a car.", "It's sometimes called the upside-down tree."] },
  { id: "sc-037", kind: "A place", answer: "Sahara", alts: ["Sahara Desert", "The Sahara"], clues: [
    "It's in Africa.", "Camels cross it.", "It has huge sand dunes.",
    "It's the largest hot desert.", "It gets very cold at night.", "It stretches from the Atlantic to the Red Sea."] },
  { id: "sc-038", kind: "An animal", answer: "Spider", clues: [
    "It has eight legs.", "It spins silk.", "Some are venomous.",
    "It isn't an insect.", "It catches flies.", "Anansi is a famous one in stories."] },
  // ---- Christmas (dealt only in Christmas sessions) ----
  { id: "sc-101", kind: "An animal", answer: "Reindeer", season: "christmas", clues: [
    "It pulls a sleigh.", "It has antlers.", "Both males and females grow antlers.",
    "It lives in the far north.", "Rudolph is one.", "In North America it's called a caribou."] },
  { id: "sc-102", kind: "Something you make", answer: "Snowman", alts: ["Snow man"], season: "christmas", clues: [
    "It melts.", "It has a carrot nose.", "It's built, not born.",
    "It may wear a scarf.", "Its eyes can be lumps of coal.", "Frosty is a famous one."] },
  { id: "sc-103", kind: "A thing", answer: "Stocking", alts: ["Christmas stocking", "Stockings"], season: "christmas", clues: [
    "It's hung up on Christmas Eve.", "It's shaped like a big sock.", "It's filled with small gifts.",
    "It may have your name on it.", "It hangs by the fireplace.", "Some families put an orange at the bottom."] },
  { id: "sc-104", kind: "A thing", answer: "Christmas tree", alts: ["Xmas tree", "Fir tree"], season: "christmas", clues: [
    "It stays green all year.", "It gets a star or an angel on top.", "It's covered in lights.",
    "Presents go under it.", "It drops needles.", "It can be real or plastic."] },
  { id: "sc-105", kind: "A plant", answer: "Mistletoe", season: "christmas", clues: [
    "It grows on other trees.", "It has white berries.", "People hang it in doorways.",
    "Standing under it may get you a kiss.", "Its berries are poisonous.", "It's a plant used at Christmas."] },
  { id: "sc-106", kind: "A food", answer: "Gingerbread", alts: ["Gingerbread man", "Gingerbread house"], season: "christmas", clues: [
    "It's spicy and sweet.", "It's baked.", "It can be built into a house.",
    "It can be shaped like a person.", "'Run, run, as fast as you can' is from its story.", "It's decorated with icing."] },
  { id: "sc-107", kind: "A song", answer: "Carol", alts: ["Carols", "Christmas carol", "Christmas carols"], season: "christmas", clues: [
    "It's sung.", "Singers go door to door with them.", "'Silent Night' is one.",
    "Choirs sing them in church.", "It's a festive song.", "Charles Dickens put one in a story's title."] },
  { id: "sc-108", kind: "A person", answer: "Santa", alts: ["Santa Claus", "Father Christmas", "Saint Nicholas", "St Nicholas"], season: "christmas", clues: [
    "He has a big white beard.", "He lives at the North Pole.", "He checks a list twice.",
    "He comes down the chimney.", "He wears red.", "He says 'Ho ho ho'."] },
  { id: "sc-109", kind: "A place", answer: "Bethlehem", season: "christmas", clues: [
    "It's a town.", "It's south of Jerusalem.", "Its name means 'house of bread'.",
    "A star is said to have shone over it.", "In the Christmas story, Jesus was born there.", "A carol calls it a 'little town'."] },
  { id: "sc-110", kind: "A thing", answer: "Cracker", alts: ["Christmas cracker", "Crackers"], season: "christmas", clues: [
    "Two people pull it.", "It goes bang.", "There's a paper crown inside.",
    "It has a bad joke inside.", "It's wrapped like a giant sweet.", "It's set on the table for Christmas dinner."] },
  { id: "sc-111", kind: "A sweet", answer: "Candy cane", alts: ["Candycane"], season: "christmas", clues: [
    "It's shaped like a hook.", "It's red and white.", "It tastes of peppermint.",
    "It can hang on a tree.", "It's hard and sweet.", "It looks like a walking stick."] },
  { id: "sc-112", kind: "A thing", answer: "Advent calendar", alts: ["Advent"], season: "christmas", clues: [
    "It counts down.", "It has little doors.", "You open one each day.",
    "Some have chocolates inside.", "It starts on the first of December.", "It ends on Christmas Eve."] },
  { id: "sc-113", kind: "A decoration", answer: "Wreath", season: "christmas", clues: [
    "It's round.", "It hangs on a door.", "It's made of evergreen branches.",
    "It may have a bow.", "It has a hole in the middle.", "Some hold four candles for Advent."] },
];
