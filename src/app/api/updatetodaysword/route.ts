import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { NextResponse } from "next/server"

const WORDS = [
    "about", "above", "abuse", "actor", "acute", "adapt", "added", "adopt", "adult", "after",
    "again", "agent", "agree", "ahead", "alarm", "album", "alert", "alike", "alive", "allow",
    "alone", "along", "aloud", "alter", "among", "anger", "angle", "angry", "apart", "apple",
    "apply", "arena", "argue", "arise", "armed", "aroma", "arrow", "ashen", "ashes", "aside",
    "asked", "attic", "audio", "avoid", "awake", "award", "aware", "awful", "bacon", "baker",
    "bales", "balky", "balls", "bands", "bases", "basic", "batch", "battle", "beach", "beans",
    "beard", "beast", "beats", "beech", "beefy", "began", "begin", "begun", "being", "below",
    "belts", "bench", "berry", "beset", "betel", "better", "bible", "birds", "birth", "black",
    "blame", "blank", "blast", "blaze", "bleed", "bless", "blind", "block", "blood", "blown",
    "blown", "board", "boast", "boats", "body", "boldly", "bolts", "bones", "bonus", "books",
    "booth", "boots", "bored", "borne", "bound", "bowed", "boxes", "brain", "brake", "brass",
    "brave", "bread", "break", "breed", "brick", "brief", "bright", "bring", "broad", "broke",
    "brown", "brush", "build", "built", "bunch", "burnt", "burst", "cabin", "cable", "cache",
    "cactus", "caged", "cakes", "calls", "calmly", "camel", "camped", "camps", "canal", "candy",
    "canon", "cards", "cares", "carry", "carved", "cases", "catch", "cause", "cells", "cents",
    "chain", "chair", "chalk", "chant", "chaos", "cheap", "cheat", "check", "cheek", "cheer",
    "chess", "chest", "chief", "child", "chill", "china", "chips", "chose", "chuck", "churn",
    "cigar", "cited", "civil", "claim", "clamp", "clash", "clasp", "clean", "clear", "click",
    "climb", "clock", "close", "cloth", "cloud", "clown", "clubs", "coach", "coast", "coats",
    "cocoa", "codes", "coins", "coldly", "color", "comet", "comes", "comic", "comma", "cones",
    "congo", "could", "count", "court", "cover", "crack", "craft", "crane", "crash", "crawl",
    "crazy", "cream", "crime", "cross", "crowd", "crown", "crude", "cruel", "crumb", "crush",
    "cryer", "cubed", "cubes", "cuffs", "cured", "curls", "curve", "cycle", "daily", "dance",
    "daring", "dated", "dates", "death", "debit", "decry", "deeds", "deeply", "defer", "delay",
    "delta", "depth", "derby", "desert", "design", "desire", "devil", "diary", "dicey", "digit",
    "dinner", "dirty", "disco", "ditch", "diver", "divide", "doctor", "dodge", "doing", "dollar",
    "doubt", "dozen", "draft", "drama", "drawn", "dream", "dress", "dried", "drift", "drill",
    "drink", "drive", "drops", "drown", "drunk", "dryer", "ducky", "dusty", "eager", "early",
    "earth", "eased", "easier", "eaten", "edges", "eight", "elbow", "elder", "elect", "email",
    "empty", "ended", "enemy", "enjoy", "enter", "entry", "equal", "error", "escape", "essay",
    "event", "every", "exact", "exalt", "exams", "excel", "except", "excess", "exile", "exist",
    "exits", "expand", "extra", "faced", "faces", "facts", "faded", "fails", "faint", "fairly",
    "faith", "false", "fancy", "farms", "fasten", "fault", "favor", "fears", "feats", "feeds",
    "feels", "feign", "fence", "fever", "field", "fight", "files", "filly", "final", "finds",
    "fired", "fires", "first", "fishy", "fixer", "flame", "flash", "flask", "fleet", "flesh",
    "flight", "float", "flock", "floor", "flour", "flown", "fluid", "focus", "folds", "folly",
    "foods", "force", "forest", "forge", "forgot", "found", "frame", "frank", "fraud", "freak",
    "fresh", "friend", "frown", "fruit", "fuels", "fully", "funds", "funny", "fuses", "future",
    "gains", "galaxy", "gases", "gates", "gauge", "gazed", "gears", "gentle", "ghost", "giant",
    "given", "gives", "glade", "glance", "glass", "globe", "glory", "glove", "goals", "going",
    "golden", "goods", "grace", "grade", "grain", "grant", "grass", "grave", "graze", "great",
    "green", "greet", "grief", "gross", "group", "grown", "guard", "guess", "guest", "guide",
    "guilty", "habits", "hairs", "hands", "handy", "happy", "harms", "harsh", "hasty", "hated",
    "haven", "havoc", "hazed", "heads", "heard", "heart", "heavy", "hedge", "heels", "hello",
    "helps", "hence", "herds", "heroic", "hides", "highs", "hills", "hints", "hired", "hobby",
    "holds", "holes", "hollow", "homes", "honest", "honor", "hopes", "horse", "hosts", "hotel",
    "hours", "house", "human", "humor", "hurry", "hurtful", "icons", "ideas", "ideal", "idiot",
    "image", "impact", "imply", "inbox", "incur", "index", "indie", "inert", "infer", "inner",
    "input", "insect", "inside", "instal", "insult", "intend", "inter", "invest", "invite", "irony",
    "issue", "items", "ivory", "jacks", "jammed", "jeans", "jokes", "joint", "judge", "juicy",
    "jumps", "jungle", "junior", "keeps", "kicks", "kills", "kinds", "kings", "kites", "knees",
    "knife", "knock", "known", "knows", "labor", "lacks", "ladies", "laity", "lamps", "lands",
    "lanes", "large", "laser", "lasts", "laugh", "launch", "layer", "lazy", "leads", "learn",
    "lease", "leaves", "legal", "lemon", "length", "lesson", "letter", "level", "lever", "light",
    "limit", "lined", "linen", "links", "lions", "liquid", "listen", "liter", "little", "lived",
    "lives", "lively", "loads", "loans", "lobby", "local", "locks", "lodge", "logic", "lonely",
    "looks", "loose", "lords", "losses", "loved", "lover", "lower", "lucky", "lunch", "lungs",
    "lyric", "magic", "mails", "major", "makes", "males", "mamma", "march", "mares", "marks",
    "marry", "masks", "match", "mates", "maths", "maybe", "mayor", "meals", "means", "meaty",
    "medal", "media", "medic", "meets", "mercy", "merge", "merit", "merry", "messy", "metal",
    "meter", "micey", "minds", "miner", "minor", "minus", "mirth", "miser", "misses", "model",
    "modem", "moist", "money", "month", "moral", "motor", "mould", "mount", "mouse", "mouth",
    "moves", "movie", "music", "myths", "nails", "naked", "named", "names", "nasty", "naval",
    "nearby", "nearly", "needy", "neigh", "nerdy", "never", "newly", "night", "noble", "noise",
    "north", "nosed", "notes", "novel", "nurse", "nutty", "ocean", "offer", "often", "olive",
    "onion", "opens", "order", "organ", "other", "ought", "ounce", "outer", "owned", "owner",
    "oxide", "pagan", "pages", "paint", "pairs", "palace", "panda", "paper", "parks", "parts",
    "party", "passes", "pasta", "patch", "paths", "pause", "peace", "pearl", "pedal", "peers",
    "pence", "pencil", "people", "pepper", "phone", "photo", "picks", "piece", "piles", "pilot",
    "pitch", "pizza", "place", "plain", "plane", "plant", "plate", "plays", "plaza", "plead",
    "plots", "plunge", "poems", "point", "poise", "poker", "police", "polish", "ponds", "pools",
    "pores", "ports", "posed", "poses", "pound", "power", "praise", "pray", "preach", "press",
    "price", "pride", "prime", "print", "prize", "probe", "proof", "proud", "prove", "proxy",
    "pulse", "punch", "pupil", "puppy", "purse", "pushy", "queen", "query", "quest", "quick",
    "quiet", "quilt", "quite", "quote", "radio", "rainy", "raise", "rally", "range", "ranks",
    "rapid", "rarely", "rated", "reach", "reads", "ready", "real", "rebel", "reels", "reign",
    "relay", "relax", "relay", "relic", "repay", "reply", "resin", "rests", "retch", "return",
    "reuse", "revel", "review", "rhino", "rhyme", "ribbon", "rides", "right", "rigid", "rings",
    "riots", "rises", "risks", "roast", "robot", "rocks", "rocky", "rogue", "roles", "roman",
    "roots", "rough", "round", "route", "royal", "ruler", "rules", "rural", "sadly", "sails",
    "saint", "salad", "sales", "salty", "samey", "saved", "saves", "scale", "scarf", "scene",
    "scent", "scold", "scope", "score", "scrap", "screw", "seeds", "seize", "sells", "sense",
    "serve", "seven", "shade", "shake", "shall", "shape", "share", "sharp", "shave", "sheep",
    "sheet", "shelf", "shell", "shift", "shine", "ships", "shirt", "shook", "shoot", "shops",
    "shore", "short", "shots", "shown", "shows", "shrub", "shrug", "sides", "sight", "signs",
    "silent", "silly", "since", "singly", "siren", "sites", "sixth", "sizes", "skill", "slabs",
    "slain", "slave", "sleep", "slice", "slide", "slight", "slope", "slots", "slowly", "small",
    "smart", "smell", "smile", "smoke", "smooth", "snail", "snake", "sneak", "sober", "socks",
    "soils", "solar", "solid", "solve", "songs", "sorry", "sound", "south", "space", "spare",
    "spark", "speak", "speed", "spell", "spend", "spice", "spike", "spine", "spite", "split",
    "spoil", "spoke", "sport", "spray", "spread", "spring", "squad", "squash", "stable", "stack",
    "staff", "stage", "stain", "stair", "stake", "stale", "stand", "stars", "start", "state",
    "stats", "stays", "steal", "steam", "steel", "steer", "stick", "stiff", "still", "sting",
    "stock", "stone", "stood", "stops", "store", "storm", "story", "stove", "strain", "strap",
    "straw", "stray", "street", "stress", "strict", "strike", "string", "strip", "stroke", "strong",
    "stuck", "study", "stuff", "style", "sugar", "suite", "suits", "sunny", "super", "swarm",
    "swear", "sweet", "sweep", "swift", "swim", "swing", "sword", "table", "taken", "tales",
    "talks", "tanks", "tapes", "tasks", "taste", "taxes", "teach", "tears", "teeth", "tells",
    "tempo", "tends", "tenor", "tenth", "terms", "theft", "theme", "there", "these", "thick",
    "thief", "thigh", "think", "third", "those", "thread", "threw", "thumb", "ticks", "tidal",
    "tides", "tight", "tiled", "tiles", "times", "tired", "title", "today", "token", "tones",
    "tools", "tooth", "topic", "total", "touch", "tough", "tower", "track", "trade", "trail",
    "train", "trait", "tramp", "trash", "treat", "trend", "trial", "tribe", "trick", "tried",
    "tries", "tripe", "troop", "truck", "truly", "trunk", "trust", "truth", "tubes", "tucks",
    "tulip", "turns", "tutor", "twice", "twigs", "types", "tying", "under", "units", "unity",
    "untie", "upper", "upset", "urban", "usage", "usual", "valid", "value", "valve", "vapor",
    "vault", "veils", "verse", "very", "vetoed", "vibes", "video", "views", "villa", "vince",
    "virtue", "visit", "vivid", "vocal", "voice", "votes", "wages", "wagon", "waist", "walks",
    "walls", "wants", "warns", "waste", "watch", "water", "waves", "ways", "weakly", "wealth",
    "wear", "weave", "weeds", "weeks", "weigh", "weird", "wells", "wept", "whale", "wheat",
    "wheel", "where", "which", "while", "white", "whole", "whose", "wider", "widow", "wield",
    "wildly", "winds", "wings", "wiped", "wires", "wisely", "wishy", "within", "witty", "wives",
    "woman", "woods", "words", "works", "world", "worry", "worse", "worst", "worth", "would",
    "wound", "woven", "wraps", "wreck", "wrist", "write", "wrong", "yacht", "years", "yells",
    "young", "yours", "youth"
  ];

export async function GET(req:Request){
    const key = req.headers.get("key")
    if(!key || key !== process.env.WEBHOOK_SECRET_KEY){
        return NextResponse.json("unauthorized", {status: 401})
    }

    const validWords = WORDS.filter((word) => {
        return word.length === 5
    })

    try{
        const colRef = collection(db, "words")
        await addDoc(colRef, {
            word: validWords[Math.floor(Math.random() * validWords.length)],
            createdAt: serverTimestamp()
        })

        return NextResponse.json("ok", {status: 200})
    }
    catch(e){
        console.log(e)
        return NextResponse.json("internal server error", {status: 401})
    }
}