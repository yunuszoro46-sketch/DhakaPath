// Language switch: full English or full Bangla (বাংলা) for everything the interface writes, with
// Bangla numerals (০–৯) in Bangla mode. English stays the source text in the code; this module
// translates what is on screen:
//   - EXACT: whole labels, buttons, headings and messages
//   - FRAGMENTS: ordered patterns for sentences with numbers or names in them (the UI's own
//     templates and the engine's most common sentences: directions, why lines, backup, fare verdicts,
//     Monsoon explanations)
//   - hub names from the network data (each hub has its own `bn` name), units and mode names
//   - every ASCII digit becomes a Bangla digit
// A MutationObserver applies this to new content as panels re-render, and remembers the English
// original of every text node and attribute it changes, so switching back restores the exact text.
// Values the code reads (form values, data-* attributes, the API) are never touched.
import { store } from './util.js';

const DIGITS = '০১২৩৪৫৬৭৮৯';
export const bnDigits = (s) => String(s).replace(/[0-9]/g, (d) => DIGITS[d]);

// content that must stay as typed or as sent: code, user posts and messages, sample Banglish inputs, ids
const SKIP = 'script, style, code, svg.sprite, textarea, #me, .toolchip, .msg.user, .reply, .quote, #ingest-examples, #chat-suggest, [translate="no"], .leaflet-control-attribution';
const ATTRS = ['placeholder', 'aria-label', 'title'];
const KEEP_ATTR = new Set(['nl-in', 'chat-in', 'ingest-in', 'hb-en', 'hb-bn', 'ln-id', 'ln-name', 'ln-stops', 'ln-km', 'ln-note', 'f-note']);   // example inputs keep their sample text

const EXACT = {
  // header, nav, chrome
  'Skip to the trip planner': 'রুট পরিকল্পনায় যান', 'Plan': 'পরিকল্পনা', 'Network': 'নেটওয়ার্ক', 'Monsoon': 'বর্ষা', 'Alerts': 'সতর্কতা', 'Share': 'শেয়ার',
  'Admin': 'অ্যাডমিন', 'Chat': 'চ্যাট', 'Close chat': 'চ্যাট বন্ধ করুন', 'Open chat': 'চ্যাট খুলুন', 'Sections': 'বিভাগ',
  'AI: offline parser': 'এআই: অফলাইন পার্সার', 'AI: fallback (offline parser)': 'এআই: ব্যাকআপ (অফলাইন পার্সার)', 'Server': 'সার্ভার', 'In-page engine': 'পেজের ভেতরের ইঞ্জিন',
  'Simulated clock (Asia/Dhaka)': 'সিমুলেটেড ঘড়ি (ঢাকা সময়)', 'Advance the simulated clock 15 minutes': 'ঘড়ি ১৫ মিনিট এগিয়ে দিন', 'Advance the simulated clock 30 minutes': 'ঘড়ি ৩০ মিনিট এগিয়ে দিন', 'Advance the simulated clock 90 minutes': 'ঘড়ি ৯০ মিনিট এগিয়ে দিন',
  '+90 min': '+৯০ মিনিট', 'Where answers are computed': 'উত্তর কোথায় হিসাব হয়',
  'No AI key configured: the rule-based parser answers. This is a feature, not a failure.': 'এআই কী নেই: নিয়মভিত্তিক পার্সার উত্তর দিচ্ছে। এটি ত্রুটি নয়।',
  'The AI only translates text to JSON and phrases results; the engine decides.': 'এআই শুধু লেখা বোঝে ও ফল সাজিয়ে বলে; সিদ্ধান্ত নেয় ইঞ্জিন।',
  'Admin: moderation, network and fare chart': 'অ্যাডমিন: মডারেশন, নেটওয়ার্ক ও ভাড়ার চার্ট', 'Switch to dark theme': 'ডার্ক থিম', 'Switch to light theme': 'লাইট থিম',
  'DhakaPath, home': 'ঢাকাপথ, হোম', 'Trip planner and tools': 'রুট পরিকল্পনা ও টুল', 'Map': 'মানচিত্র',
  // map
  'Fastest': 'দ্রুততম', 'Cheapest': 'সাশ্রয়ী', 'Balanced': 'ভারসাম্য', 'All three': 'তিনটিই', 'Street': 'রাস্তা', 'Schematic': 'নকশা',
  'Route shown on the map': 'মানচিত্রে দেখানো রুট', 'Map type': 'মানচিত্রের ধরন', 'Legend': 'চিহ্ন', 'Backup': 'ব্যাকআপ', 'Blocked / cut': 'বন্ধ / কাটা', 'Start': 'শুরু', 'Destination': 'গন্তব্য',
  'Focus route': 'রুটে ফিরুন', 'STOP': 'স্টপ', 'Zoom in': 'বড় করুন', 'Zoom out': 'ছোট করুন', 'Position approximate.': 'অবস্থান আনুমানিক।', 'Blocked': 'বন্ধ', '⛔ Blocked': '⛔ বন্ধ',
  'Set as Start (A)': 'শুরু করুন এখান থেকে (A)', 'Set as Destination (B)': 'গন্তব্য করুন (B)', '✓ Current Start (A)': '✓ বর্তমান শুরু (A)', '✓ Current End (B)': '✓ বর্তমান গন্তব্য (B)',
  'Street map of the 14 hubs (approximate positions)': '১৪টি হাবের রাস্তার মানচিত্র (আনুমানিক অবস্থান)', 'Schematic network map of the 14 hubs': '১৪টি হাবের নেটওয়ার্ক নকশা',
  'Hub positions are approximate area centres (team KoyJabo data).': 'হাবের অবস্থান এলাকার আনুমানিক কেন্দ্র (দলের KoyJabo ডেটা)।',
  "Street tiles can't load right now (offline?). Hubs and routes are still drawn; switch to": 'রাস্তার টাইল এখন লোড হচ্ছে না (অফলাইন?)। হাব ও রুট আঁকা আছে; পুরো চিত্রের জন্য', 'for the full diagram.': 'দেখুন।',
  'hard alert': 'নিশ্চিত সতর্কতা', 'unverified': 'যাচাই হয়নি', 'fading': 'ম্লান হচ্ছে', 'Hover a link for alert details · Click a hub: To · Shift+click: From': 'সংযোগে কার্সার রাখলে বিস্তারিত · হাবে ক্লিক: গন্তব্য · Shift+ক্লিক: শুরু',
  'contributors': 'অবদানকারী',
  // seed-data notice
  'Seed data, not official.': 'নমুনা ডেটা, সরকারি নয়।', 'Seed data, not official': 'নমুনা ডেটা, সরকারি নয়', 'The 14 hubs, lines, distances and times are illustrative (': '১৪টি হাব, লাইন, দূরত্ব ও সময় উদাহরণমাত্র (',
  '). Bus and MRT-6 fare rules follow published official rates; rickshaw, CNG and leguna fares are team estimates. Routes are not official.': ')। বাস ও মেট্রো রেলের ভাড়া প্রকাশিত সরকারি হারে; রিকশা, সিএনজি ও লেগুনার ভাড়া দলের অনুমান। রুটগুলো সরকারি নয়।',
  'Seed data, not official: distances, times and fares are illustrative and configurable in config.json.': 'নমুনা ডেটা, সরকারি নয়: দূরত্ব, সময় ও ভাড়া উদাহরণমাত্র, config.json-এ বদলানো যায়।',
  // planner
  'Where are you headed?': 'কোথায় যাবেন?', 'From': 'কোথা থেকে', 'To': 'কোথায়', 'Student': 'শিক্ষার্থী', '½ bus fare': 'বাসে অর্ধেক ভাড়া', 'Leave at': 'ছাড়ার সময়', 'Blank = leave now': 'ফাঁকা = এখনই', 'Leave at (blank = now)': 'ছাড়ার সময় (ফাঁকা = এখনই)',
  'More options': 'আরও বিকল্প', 'budget, transfers, avoid': 'বাজেট, বদল, এড়ানো', 'Max budget ৳': 'সর্বোচ্চ বাজেট ৳', 'Max transfers': 'সর্বোচ্চ বদল', 'Max minutes': 'সর্বোচ্চ মিনিট', 'any': 'যেকোনো',
  'Avoid a hub': 'যে হাব এড়াবেন', 'Choose…': 'বেছে নিন…', 'Add': 'যোগ করুন', 'Modes': 'যানবাহন', 'Single mode only': 'শুধু একটি যানবাহন', '(no switching between bus, metro, leguna, rickshaw/CNG or walking)': '(বাস, মেট্রো, লেগুনা, রিকশা/সিএনজি বা হাঁটার মধ্যে বদল নয়)',
  'Find routes': 'রুট খুঁজুন', 'Searching…': 'খোঁজা হচ্ছে…', 'or just type it, Banglish is fine': 'অথবা লিখে দিন, বাংলিশেও চলবে', 'Type your trip in English, Banglish or Bangla': 'ইংরেজি, বাংলিশ বা বাংলায় যাত্রা লিখুন', 'Search': 'খুঁজুন',
  'Swap origin and destination': 'শুরু ও গন্তব্য অদলবদল', 'Speak your trip': 'বলে খুঁজুন', 'Speak your trip (browser speech recognition)': 'বলে খুঁজুন (ব্রাউজারের ভয়েস)',
  'Sort routes by': 'রুট সাজান', 'Best match': 'সবচেয়ে উপযুক্ত', 'Fewest changes': 'কম বদল', 'Fewest transfers': 'কম বদল', 'Remove': 'সরান',
  // results and tickets
  'student': 'শিক্ষার্থী', 'regular': 'সাধারণ', 'min': 'মিনিট', 'transfers': 'বদল', 'transfer': 'বদল', 'Legs': 'ধাপ', 'Verified against network ✓': 'নেটওয়ার্কে যাচাই করা ✓', 'Not verified': 'যাচাই হয়নি',
  'No street reports on this route': 'এই রুটে রাস্তার কোনো খবর নেই', 'Backup route': 'ব্যাকআপ রুট', 'Rush hour applied': 'ভিড়ের সময় ধরা হয়েছে', 'fare unknown': 'ভাড়া অজানা', 'budget: fare unknown': 'বাজেট: ভাড়া অজানা',
  'Step by step': 'ধাপে ধাপে', 'English': 'ইংরেজি', 'Banglish': 'বাংলিশ', 'Directions language': 'নির্দেশনার ভাষা', 'sample note': 'নমুনা নোট', 'Why this route': 'কেন এই রুট', 'Fare breakdown': 'ভাড়ার হিসাব',
  'Leg': 'ধাপ', 'km': 'কিমি', 'Regular': 'সাধারণ', 'Student discount / surge': 'শিক্ষার্থী ছাড় / বাড়তি', 'student discount applies': 'শিক্ষার্থী ছাড় প্রযোজ্য', 'does not apply': 'প্রযোজ্য নয়', 'Trip total': 'মোট',
  '(no surge now)': '(এখন বাড়তি নেই)', 'official source': 'সরকারি সূত্র', 'estimate': 'অনুমান', 'source': 'সূত্র', 'Bus:': 'বাস:', 'MRT-6:': 'মেট্রো রেল:', 'Rickshaw:': 'রিকশা:', 'CNG:': 'সিএনজি:', 'Leguna:': 'লেগুনা:',
  'No open alerts on this route.': 'এই রুটে কোনো সতর্কতা নেই।', 'Alerts on this route': 'এই রুটের সতর্কতা', 'Watch this trip': 'এই যাত্রা নজরে রাখুন', 'Best time to leave': 'কখন বের হবেন', 'Read aloud': 'পড়ে শোনান', 'Offline card (PNG)': 'অফলাইন কার্ড (PNG)',
  'Trip Watch re-checks this trip and warns you, with a detour, when a confirmed alert or rush hour hits it.': 'ট্রিপ ওয়াচ এই যাত্রা বারবার যাচাই করে; নিশ্চিত সতর্কতা বা ভিড়ের সময় পড়লে বিকল্প পথসহ জানায়।',
  'Trip Watch': 'ট্রিপ ওয়াচ', 're-checked every few seconds against confirmed alerts and rush hour': 'নিশ্চিত সতর্কতা ও ভিড়ের সময়ের সাথে কয়েক সেকেন্ড পরপর যাচাই',
  'Show detour': 'বিকল্প পথ দেখুন', 'Switch to it': 'এটিতে বদলান', 'Stop watching': 'নজর বন্ধ', 'Dismiss': 'বন্ধ', 'clear': 'পরিষ্কার', 'slower': 'ধীর', 'faster route': 'দ্রুত রুট', 'reroute': 'পথ বদল', 'no route': 'রুট নেই',
  'Retry': 'আবার চেষ্টা', 'Choose two different hubs.': 'দুটি আলাদা হাব বেছে নিন।', 'Show on map': 'মানচিত্রে দেখুন',
  'Finding routes…': 'রুট খোঁজা হচ্ছে…', 'Trip time by departure': 'ছাড়ার সময় অনুযায়ী যাত্রার সময়', 'Change versus the usual route': 'সাধারণ রুটের তুলনায় পরিবর্তন',
  // Fare Truth
  'Fare Truth': 'ভাড়া যাচাই', "Checks the amount you were asked against the engine's expected fare for the trip above. Bus and MRT-6 use official rates; rickshaw, CNG and leguna are estimates.": 'আপনার কাছে যত ভাড়া চাওয়া হয়েছে তা ওপরের যাত্রার প্রত্যাশিত ভাড়ার সাথে মেলায়। বাস ও মেট্রো রেল সরকারি হারে; রিকশা, সিএনজি ও লেগুনা অনুমান।',
  'Asked ৳': 'চাওয়া হয়েছে ৳', 'Mode': 'যানবাহন', 'bus': 'বাস', 'metro': 'মেট্রো', 'leguna': 'লেগুনা', 'rickshaw': 'রিকশা', 'walk': 'হাঁটা', 'Check for this trip': 'এই যাত্রায় যাচাই করুন',
  'Fair': 'ঠিক আছে', 'Below usual': 'স্বাভাবিকের কম', 'Slightly high': 'একটু বেশি', 'Overcharge': 'অতিরিক্ত ভাড়া', '(against the estimated range)': '(অনুমিত সীমার তুলনায়)', 'official rate': 'সরকারি হার', 'team estimate': 'দলের অনুমান',
  'Say to the conductor:': 'কন্ডাক্টরকে বলুন:', '(phrased by AI, numbers checked)': '(এআই সাজিয়েছে, সংখ্যা যাচাই করা)',
  // modes
  'MRT-6': 'মেট্রো রেল', 'Bus': 'বাস', 'Leguna': 'লেগুনা', 'Rickshaw': 'রিকশা', 'CNG': 'সিএনজি', 'Walk': 'হাঁটা',
  // network
  'Every modelled line and hub, with fares, student eligibility and what is running right now.': 'সব লাইন ও হাব: ভাড়া, শিক্ষার্থী ছাড় এবং এখন কী চলছে।', 'Network size': 'নেটওয়ার্কের আকার', 'hubs': 'হাব', 'lines': 'লাইন', 'links': 'সংযোগ', 'modes': 'যানবাহন',
  'Routes running now': 'এখন যে রুট চলছে', 'Hubs and disruptions': 'হাব ও বিঘ্ন', 'Line': 'লাইন', 'From → To': 'শুরু → শেষ', 'Est. time': 'আনুমানিক সময়', 'Base fare': 'মূল ভাড়া', 'Student ½': 'শিক্ষার্থী ½', 'Now': 'এখন',
  'running': 'চলছে', 'caution': 'সতর্কতা', 'disrupted': 'বিঘ্নিত', 'suspended': 'বন্ধ', 'blocked': 'বন্ধ', 'free': 'বিনামূল্যে', '(sample)': '(নমুনা)',
  // Monsoon
  'Monsoon Mode': 'বর্ষা মোড', 'What if it rains, a hub floods or MRT-6 stops? Re-runs your trip,': 'বৃষ্টি হলে, কোনো হাবে পানি জমলে বা মেট্রো রেল বন্ধ হলে কী হবে? আপনার যাত্রা',
  ', under simulated conditions and compares it with the usual route. Active alerts count in both runs; every delta comes from the engine.': ' সিমুলেটেড অবস্থায় আবার হিসাব করে সাধারণ রুটের সাথে তুলনা করে। সক্রিয় সতর্কতা দুই হিসাবেই ধরা হয়; প্রতিটি পার্থক্য ইঞ্জিনের।',
  'Try a scenario': 'একটি পরিস্থিতি বেছে নিন', 'Rain at Science Lab': 'সায়েন্স ল্যাবে বৃষ্টি', 'Science Lab flooded (rain + blocked)': 'সায়েন্স ল্যাবে পানি (বৃষ্টি + বন্ধ)', 'Rush hour': 'ভিড়ের সময়',
  'Monsoon evening (rain south + rush)': 'বর্ষার সন্ধ্যা (দক্ষিণে বৃষ্টি + ভিড়)', 'Heavy rain south (CNG & leguna off the road)': 'দক্ষিণে ভারী বৃষ্টি (সিএনজি ও লেগুনা বন্ধ)', 'MRT-6 suspended': 'মেট্রো রেল বন্ধ', 'MRT-6 delayed (+50%, +10 min hold-up)': 'মেট্রো রেল দেরি (+৫০%, +১০ মিনিট আটকে)',
  'Or build your own conditions': 'অথবা নিজের মতো অবস্থা ঠিক করুন', 'Rain in zones': 'যে এলাকায় বৃষ্টি', 'Rain at hubs': 'যে হাবে বৃষ্টি', 'Heavy rain': 'ভারী বৃষ্টি', '(CNG & leguna stop in the rain area; others slow more)': '(বৃষ্টির এলাকায় সিএনজি ও লেগুনা বন্ধ; বাকিগুলো আরও ধীর)',
  'Blocked hubs': 'বন্ধ হাব', 'Service changes': 'সার্ভিসে পরিবর্তন', 'Line not running': 'বন্ধ লাইন', 'Delay line': 'দেরির লাইন', 'none': 'কোনোটি নয়', '+ min': '+ মিনিট', 'Clear': 'মুছুন', 'Run scenario': 'হিসাব করুন',
  'Pick a preset or set your own conditions, then run the scenario to see the before / after comparison.': 'একটি পরিস্থিতি বেছে নিন বা নিজে ঠিক করুন, তারপর হিসাব করলে আগে / পরের তুলনা দেখাবে।',
  'Affected segments of the usual route': 'সাধারণ রুটের যে অংশে প্রভাব', 'The usual route is not affected.': 'সাধারণ রুটে প্রভাব নেই।', 'Time': 'সময়', 'Fare': 'ভাড়া', 'Route': 'রুট', '↪ detour': '↪ বিকল্প পথ', 'same route': 'একই রুট',
  'Apply to the whole app': 'পুরো অ্যাপে চালু করুন', 'Every search then runs under these conditions until you clear the banner.': 'ব্যানার মুছে না ফেলা পর্যন্ত প্রতিটি খোঁজ এই অবস্থায় চলবে।', 'Before': 'আগে', 'After': 'পরে',
  'Scenario active for the whole app:': 'পুরো অ্যাপে পরিস্থিতি চালু:', 'Custom scenario': 'নিজের পরিস্থিতি',
  'north': 'উত্তর', 'northwest': 'উত্তর-পশ্চিম', 'central-north': 'মধ্য-উত্তর', 'central-west': 'মধ্য-পশ্চিম', 'east': 'পূর্ব', 'central': 'মধ্য', 'central-south': 'মধ্য-দক্ষিণ', 'west': 'পশ্চিম', 'south-west': 'দক্ষিণ-পশ্চিম', 'far-east': 'দূর-পূর্ব', 'central-east': 'মধ্য-পূর্ব', 'south-east': 'দক্ষিণ-পূর্ব',
  // alerts
  'Street alerts': 'রাস্তার খবর', 'Water-logging, blockades and jams reported by commuters, weighted by how many people confirm them.': 'যাত্রীদের জানানো জলাবদ্ধতা, অবরোধ ও জ্যাম; কতজন নিশ্চিত করেছে সেই অনুযায়ী গুরুত্ব।',
  'Alert Ingestor: paste a street post': 'অ্যালার্ট ইনজেস্টর: রাস্তার পোস্ট দিন',
  'A messy Bangla, Banglish or English post becomes a structured alert that starts at low trust (0.30, "unverified"). It only slows routes a little until other people confirm it; one post never blocks a road on its own.': 'বাংলা, বাংলিশ বা ইংরেজি পোস্ট থেকে একটি সতর্কতা তৈরি হয়, যা কম আস্থায় (০.৩০, "যাচাই হয়নি") শুরু হয়। অন্যরা নিশ্চিত না করা পর্যন্ত এটি রুটকে একটু ধীর করে মাত্র; একটি পোস্ট একা কোনো রাস্তা বন্ধ করে না।',
  'Extract and file': 'সতর্কতা জমা দিন', 'You are': 'আপনি', 'Be someone else': 'অন্য যাত্রী হিসেবে', 'Reported alerts': 'জানানো সতর্কতা', 'Filter by status': 'অবস্থা অনুযায়ী', 'Confidence levels': 'আস্থার স্তর',
  'Visible': 'দৃশ্যমান', 'All, including expired': 'সব, মেয়াদোত্তীর্ণসহ', 'Active': 'সক্রিয়', 'Unverified': 'যাচাই হয়নি', 'Fading': 'ম্লান হচ্ছে', 'Disputed': 'বিতর্কিত',
  '≥ 0.60 active: hard': '≥ ০.৬০ সক্রিয়: কঠোর', '0.30–0.59 unverified: soft ×1.25': '০.৩০–০.৫৯ যাচাই হয়নি: হালকা ×১.২৫', '0.15–0.29 fading: no effect': '০.১৫–০.২৯ ম্লান: প্রভাব নেই', '< 0.15 expired': '< ০.১৫ মেয়াদোত্তীর্ণ',
  'active': 'সক্রিয়', 'disputed': 'বিতর্কিত', 'expired': 'মেয়াদোত্তীর্ণ', 'resolved': 'সমাধান', 'pending': 'অপেক্ষমাণ', 'rejected': 'বাতিল', 'removed': 'সরানো', 'stale': 'পুরনো',
  'Confirm': 'নিশ্চিত করুন', "It's clear": 'এখন পরিষ্কার', 'Simulate 2 other users confirm': 'আরও ২ জন নিশ্চিত করলে কী হয়', 'No alerts in this view.': 'এই তালিকায় কোনো সতর্কতা নেই।',
  'Read by': 'পড়েছে', 'Hub': 'হাব', 'Type': 'ধরন', 'Severity': 'তীব্রতা', 'Keywords': 'মূল শব্দ', 'confidence': 'আস্থা', 'user': 'ব্যবহারকারী', 'demo': 'ডেমো',
  'gridlock': 'জ্যাম', 'waterlogging': 'জলাবদ্ধতা', 'protest': 'মিছিল', 'construction': 'নির্মাণকাজ', 'accident': 'দুর্ঘটনা', 'blockade': 'অবরোধ',
  'Filed as unverified (soft effect until confirmed).': 'যাচাই হয়নি হিসেবে জমা হয়েছে (নিশ্চিত না হওয়া পর্যন্ত হালকা প্রভাব)।', 'Matched an open alert: counted as your confirmation.': 'চালু একটি সতর্কতার সাথে মিলেছে: আপনার নিশ্চিতকরণ হিসেবে গোনা হয়েছে।',
  'Matched an open alert you already reported or voted on, so it counts once. Press “Be someone else” to confirm as another commuter.': 'আপনি আগেই জানিয়েছেন বা ভোট দিয়েছেন, তাই একবারই গোনা হবে। অন্য যাত্রী হিসেবে নিশ্চিত করতে “অন্য যাত্রী হিসেবে” চাপুন।',
  // share
  'Share a ride': 'ভাড়া ভাগ করুন', 'Going the same way? Split a rickshaw or CNG with commuters at the same hub.': 'একই দিকে যাচ্ছেন? একই হাবের যাত্রীদের সাথে রিকশা বা সিএনজি ভাড়া ভাগ করুন।', 'Share a rickshaw or CNG': 'রিকশা বা সিএনজি শেয়ার',
  "Commuters at the same hub split one ride. The split bot divides the engine's fare range for that link (with rush / rain surge) and rounds each share up to whole taka.": 'একই হাবের যাত্রীরা একটি গাড়ি ভাগ করেন। ভাগের বট ওই পথের ভাড়ার সীমা (ভিড় / বৃষ্টির বাড়তিসহ) ভাগ করে প্রতিজনের অংশ পূর্ণ টাকায় ওপরে গোল করে।',
  'From hub': 'যে হাব থেকে', 'Ride': 'গাড়ি', 'Rickshaw (2 seats)': 'রিকশা (২ আসন)', 'CNG (3 seats)': 'সিএনজি (৩ আসন)', 'Find or start a share': 'শেয়ার খুঁজুন বা শুরু করুন', 'Open shares': 'চালু শেয়ার', 'posts expire after 20 min': 'পোস্ট ২০ মিনিট পর মুছে যায়',
  'No open shares from this hub. Start one above; others at the hub will see it here.': 'এই হাব থেকে কোনো শেয়ার নেই। ওপরে একটি শুরু করুন; হাবের অন্যরা এখানে দেখবেন।', 'Join': 'যোগ দিন', 'Leave': 'ছেড়ে দিন', 'Cancel': 'বাতিল',
  // admin
  'Moderation, landmark notes, lines and the fare chart. Changes apply to every commuter immediately.': 'মডারেশন, ল্যান্ডমার্ক নোট, লাইন ও ভাড়ার চার্ট। পরিবর্তন সাথে সাথে সবার জন্য কার্যকর।', 'Admin login': 'অ্যাডমিন লগইন',
  'Moderation and network editing need the admin password (set ADMIN_PASSWORD in .env).': 'মডারেশন ও নেটওয়ার্ক সম্পাদনায় অ্যাডমিন পাসওয়ার্ড লাগে (.env-এ ADMIN_PASSWORD)।', 'Password': 'পাসওয়ার্ড', 'Log in': 'লগইন', 'Log out': 'লগআউট',
  'Moderation queue': 'মডারেশনের তালিকা', 'Reset demo data': 'ডেমো ডেটা রিসেট', 'Boarding landmark notes': 'ওঠার জায়গার নোট', 'Note (English)': 'নোট (ইংরেজি)', 'Note (Banglish)': 'নোট (বাংলিশ)', 'Save note': 'নোট সংরক্ষণ',
  'Add a line': 'লাইন যোগ করুন', 'Line ID': 'লাইন আইডি', 'Name': 'নাম', 'Leguna flat fare ৳': 'লেগুনার নির্দিষ্ট ভাড়া ৳', 'Stops in order': 'ক্রমানুসারে স্টপ', '(hub names or IDs, comma-separated)': '(হাবের নাম বা আইডি, কমা দিয়ে)',
  'km between stops': 'স্টপের মধ্যে কিমি', '(one per pair)': '(প্রতি জোড়ায় একটি)', 'Boarding note': 'ওঠার নোট', 'Student half fare is set by the mode: buses only. Bus minutes default to km × 3.': 'শিক্ষার্থীর অর্ধেক ভাড়া শুধু বাসে। বাসের সময় ধরা হয় কিমি × ৩ মিনিট।',
  'Add line': 'লাইন যোগ করুন', 'Fare chart': 'ভাড়ার চার্ট', 'Bus ৳/km': 'বাস ৳/কিমি', 'Bus minimum ৳': 'বাসের সর্বনিম্ন ৳', 'MRT ৳/km': 'মেট্রো ৳/কিমি', 'MRT min / max ৳': 'মেট্রো সর্বনিম্ন / সর্বোচ্চ ৳',
  'Rickshaw ৳/km low / high': 'রিকশা ৳/কিমি কম / বেশি', 'Rickshaw minimum ৳': 'রিকশার সর্বনিম্ন ৳', 'CNG ৳/km low / high': 'সিএনজি ৳/কিমি কম / বেশি', 'CNG minimum ৳': 'সিএনজির সর্বনিম্ন ৳',
  'Fuel-price adjustment %': 'জ্বালানির দামে সমন্বয় %', 'Reason / notice': 'কারণ / নোটিশ', '(kept in the fare history)': '(ভাড়ার ইতিহাসে থাকে)', 'Save fare chart': 'ভাড়ার চার্ট সংরক্ষণ', 'Lines and edges': 'লাইন ও সংযোগ', 'Stops': 'স্টপ', 'Delete': 'মুছুন', 'Audit log': 'অডিট লগ',
  'Fare table': 'ভাড়ার টেবিল',
  // chat, dialog, footer
  'Ask DhakaPath': 'ঢাকাপথকে জিজ্ঞেস করুন', 'English · Banglish ·': 'ইংরেজি · বাংলিশ ·', 'Message': 'বার্তা', 'Send': 'পাঠান', 'Verified ✓': 'যাচাই করা ✓',
  'Assalamualaikum! Ask a trip in English, Banglish or Bangla. The AI only reads your message; routes and fares come from the network graph, and every route answer is checked against it.': 'আসসালামু আলাইকুম! ইংরেজি, বাংলিশ বা বাংলায় যাত্রার কথা জিজ্ঞেস করুন। এআই শুধু আপনার বার্তা পড়ে; রুট ও ভাড়া আসে নেটওয়ার্ক গ্রাফ থেকে, আর প্রতিটি উত্তর সেখানে যাচাই করা হয়।',
  'Offline route card': 'অফলাইন রুট কার্ড', 'Download PNG': 'PNG ডাউনলোড', 'Close': 'বন্ধ', 'If the download is blocked here, long-press or right-click the image to save it.': 'ডাউনলোড না হলে ছবিতে লম্বা চাপ বা রাইট-ক্লিক করে সংরক্ষণ করুন।',
  'DhakaPath · INIF 2026 prototype · the network graph decides routes, fares and alert status; AI only reads messages and phrases explanations ·': 'ঢাকাপথ · INIF ২০২৬ প্রোটোটাইপ · রুট, ভাড়া ও সতর্কতার অবস্থা ঠিক করে নেটওয়ার্ক গ্রাফ; এআই শুধু বার্তা পড়ে ও ব্যাখ্যা সাজায় ·',
  'Test AI hallucination': 'এআই ভুল তথ্য পরীক্ষা', 'Rejected: not in network': 'বাতিল: নেটওয়ার্কে নেই',
  'Where are you headed? ': 'কোথায় যাবেন? ',
  'Voice language Bangla, tap to switch': 'ভয়েসের ভাষা বাংলা, বদলাতে চাপুন', 'Voice language English, tap to switch': 'ভয়েসের ভাষা ইংরেজি, বদলাতে চাপুন',
  'Voice language: Bangla (tap to switch)': 'ভয়েসের ভাষা: বাংলা (বদলাতে চাপুন)', 'Voice language: English (tap to switch)': 'ভয়েসের ভাষা: ইংরেজি (বদলাতে চাপুন)', 'Voice language': 'ভয়েসের ভাষা',
  'MRT minimum': 'মেট্রো সর্বনিম্ন', 'MRT maximum': 'মেট্রো সর্বোচ্চ', 'Rickshaw low per km': 'রিকশা কিমিপ্রতি কম', 'Rickshaw high per km': 'রিকশা কিমিপ্রতি বেশি', 'CNG low per km': 'সিএনজি কিমিপ্রতি কম', 'CNG high per km': 'সিএনজি কিমিপ্রতি বেশি',
  '(bus, CNG, rickshaw per-km rates; e.g. 8 or −5)': '(বাস, সিএনজি, রিকশার কিমিপ্রতি হার; যেমন ৮ বা −৫)', 'MRT Line-6': 'মেট্রো রেল লাইন-৬',
  'Joined an open share going there.': 'সেদিকে যাওয়া একটি চালু শেয়ারে যোগ দিয়েছেন।', 'Share posted. Others at the hub can join for the next 20 min.': 'শেয়ার পোস্ট হয়েছে। হাবের অন্যরা পরের ২০ মিনিট যোগ দিতে পারবেন।',
  'Students with ID pay half on buses (minimum ৳10).': 'আইডি থাকলে শিক্ষার্থীরা বাসে অর্ধেক ভাড়া দেন (সর্বনিম্ন ৳১০)।', 'No student discount on this mode.': 'এই যানবাহনে শিক্ষার্থী ছাড় নেই।', 'Student half fare applied (bus only).': 'শিক্ষার্থীর অর্ধেক ভাড়া ধরা হয়েছে (শুধু বাসে)।',
  'MRT: use the Farmgate station entrance; the bus stop is on the opposite side of the road.': 'মেট্রো: ফার্মগেট স্টেশনের প্রবেশপথ ব্যবহার করুন; বাস স্টপ রাস্তার উল্টো পাশে।',
  'Every connection between these hubs is closed or filtered out by the current disruptions and your filters.': 'বর্তমান বিঘ্ন ও আপনার ফিল্টারের কারণে এই হাবগুলোর মধ্যে সব সংযোগ বন্ধ।',
};

// [pattern, replacement]; applied in order to whatever text is left after the exact lookup
const T = (s) => s;   // marks Bangla templates for readability
const FRAGMENTS = [
  // UI templates (searchPanel, simPanel, alertsPanel, networkPanel, watchPanel, bestTime)
  [/^(\d+) paths checked( · partial)?$/, (m, n, p) => `${n}টি পথ যাচাই হয়েছে${p ? ' · আংশিক' : ''}`],
  [/^Leaving (\d\d:\d\d)( \(now\))?: off-peak\.$/, (m, t, now) => `যাত্রা ${t}${now ? ' (এখন)' : ''}: ভিড়ের সময় নয়।`],
  [/^\((auto|manual|scenario|[^,]+), leaving (\d\d:\d\d)\): buses ×1\.5, rickshaw\/CNG fares surge\.$/, (m, s, t) => `(${s === 'auto' ? 'স্বয়ংক্রিয়' : s === 'manual' ? 'নিজে ঠিক করা' : s}, যাত্রা ${t}): বাস ×১.৫, রিকশা/সিএনজির ভাড়া বেশি।`],
  [/^Scenario active: (.+)\.$/, 'পরিস্থিতি চালু: $1।'],
  [/^(\d+) street alert\(s\) are shaping these routes\.$/, '$1টি রাস্তার সতর্কতা এই রুটগুলোকে প্রভাবিত করছে।'],
  [/^(\d+) more option\(s\)$/, 'আরও $1টি বিকল্প'],
  [/^(\d+) route\(s\) might fit your budget \(typical fare fits, top estimate does not\)$/, '$1টি রুট বাজেটে হতে পারে (সাধারণ ভাড়া মেলে, সর্বোচ্চ অনুমান মেলে না)'],
  [/^Fits ৳(\d+)$/, '৳$1-এর মধ্যে'], [/^Might fit ৳(\d+)$/, '৳$1-এ হতে পারে'],
  [/^\(([+-]?\d+) min, ([+-]?\d+)(?: to ([+-]?\d+))? ৳, ([+-]?\d+) transfers vs main\)$/, (m, a, b, c, d) => `(মূল রুটের চেয়ে ${a} মিনিট, ${c ? `${b} থেকে ${c}` : b} ৳, ${d} বদল)`],
  [/Use if any service on the main route stops \(most exposed: ([^)]+)\)\./g, 'মূল রুটের কোনো সার্ভিস বন্ধ হলে এটি নিন (সবচেয়ে ঝুঁকিতে: $1)।'],
  [/Use if (.+?) stops\./g, '$1 বন্ধ হলে এটি নিন।'],
  [/Shares no bus, train or rickshaw\/CNG link with the main route\./g, 'মূল রুটের সাথে কোনো বাস, ট্রেন বা রিকশা/সিএনজি সংযোগ মেলে না।'],
  [/Avoids the main route’s most exposed leg\./g, 'মূল রুটের সবচেয়ে ঝুঁকির অংশ এড়ায়।'],
  [/It is the card tagged\s*$/, 'এটি এই চিহ্নের কার্ড:'], [/^\s*above\.$/, ' (ওপরে)।'], [/^\s*under “more options”\.$/, ' (“আরও বিকল্প”-এ)।'],
  [/^No backup: (.+)$/, 'ব্যাকআপ নেই: $1'],
  [/No other valid route avoids (.+?) under the current conditions and filters\./g, 'বর্তমান অবস্থা ও ফিল্টারে $1 এড়িয়ে আর কোনো রুট নেই।'],
  [/^Includes (\d+) min of transfer walking\.$/, 'এর মধ্যে $1 মিনিট বদলের জন্য হাঁটা।'],
  [/^Ranking cost uses the rickshaw\/CNG midpoint: regular ≈(৳\d+), student ≈(৳\d+)\.(.*)$/, (m, r, s, rest) => `সাজানোর হিসাবে রিকশা/সিএনজির মাঝামাঝি ভাড়া ধরা হয়েছে: সাধারণ ≈${r}, শিক্ষার্থী ≈${s}।${rest.replace(/Fare table v(\d+)(?:, updated ([^.]+))? ?(\(seed\))?\./, (x, v, u, seed) => ` ভাড়ার টেবিল v${v}${u ? `, হালনাগাদ ${u}` : ''}${seed ? ' (নমুনা)' : ''}।`).replace('Part of this route has no fare data; the total is incomplete.', 'এই রুটের কিছু অংশের ভাড়া জানা নেই; মোট হিসাব অসম্পূর্ণ।')}`],
  [/^baseline ([^ ]+)$/, 'স্বাভাবিক $1'], [/^→ surge ×([\d.]+): (.+)$/, '→ বাড়তি ×$1: $2'], [/^surge ×([\d.]+): (.+)$/, 'বাড়তি ×$1: $2'],
  [/^Share this (rickshaw|CNG) and split the fare$/, (m, x) => `এই ${x === 'CNG' ? 'সিএনজি' : 'রিকশা'} শেয়ার করে ভাড়া ভাগ করুন`],
  [/^· checked (.+)$/, '· যাচাই $1'],
  [/^(\d+) reports? incl\. the poster$/, 'পোস্টকারীসহ $1টি রিপোর্ট'],
  [/^(\d+) “clear” votes?$/, '$1টি “পরিষ্কার” ভোট'],
  [/^(\d+) min old · last verified (\d+) min ago$/, '$1 মিনিট আগের · শেষ যাচাই $2 মিনিট আগে'],
  [/^\(started ([\d.]+)\)$/, '(শুরু $1)'],
  [/^routing: (.+)$/, (m, r) => `রুটে প্রভাব: ${r.replace(/^hard: road links broken$/, 'কঠোর: রাস্তার সংযোগ বন্ধ').replace(/^hard: time ×(\d+)$/, 'কঠোর: সময় ×$1').replace(/^soft: time ×([\d.]+)$/, 'হালকা: সময় ×$1').replace(/^none$/, 'নেই').replace(/^none \((.+)\)$/, 'নেই ($1)')}`],
  [/^· (\w+) · severity (\d) ·$/, (m, t, s) => `· ${EXACT[t] || t} · তীব্রতা ${s} ·`],
  [/^Effective confidence ([\d.]+) of 1; marks at 0\.30 \(unverified\) and 0\.60 \(active\)$/, 'কার্যকর আস্থা ১-এর মধ্যে $1; দাগ ০.৩০ (যাচাই হয়নি) ও ০.৬০ (সক্রিয়)'],
  [/^effective confidence ([\d.]+); marks at 0\.30 and 0\.60$/, 'কার্যকর আস্থা $1; দাগ ০.৩০ ও ০.৬০'],
  [/^Confidence ([\d.]+) →$/, 'আস্থা $1 →'],
  [/^rule parser · AI (\w+)$/, 'নিয়মভিত্তিক পার্সার · এআই $1'], [/^demo cache · AI (\w+)$/, 'ডেমো ক্যাশ · এআই $1'], [/^AI \(P2\) · AI (\w+)$/, 'এআই · এআই $1'],
  [/^Counted as a “clear” vote on (\d+) open alert\(s\)\.$/, '$1টি সতর্কতায় “পরিষ্কার” ভোট হিসেবে গোনা হয়েছে।'],
  [/^You \((.+)\) already voted on this alert, so it counts once\. Press “Be someone else” to vote as another commuter\.$/, 'আপনি ($1) আগেই ভোট দিয়েছেন, তাই একবারই গোনা হবে। অন্য যাত্রী হিসেবে ভোট দিতে “অন্য যাত্রী হিসেবে” চাপুন।'],
  [/^as of (\d\d:\d\d)$/, '$1 অনুযায়ী'],
  [/^(\d+) line\(s\) · (.+)$/, (m, n, z) => `${n}টি লাইন · ${EXACT[z] || z}`],
  [/^Full-line fares and times; (.+)$/, (m, r) => `পুরো লাইনের ভাড়া ও সময়; ${tr(r)}`],
  [/^student ৳(\d+)$/, 'শিক্ষার্থী ৳$1'],
  [/^via (.+)$/, '$1 হয়ে'],
  [/^⚠ (\w+) · (\w+) · ([\d.]+) · (\d+) min old$/, (m, t, s, c, a) => `⚠ ${EXACT[t] || t} · ${EXACT[s] || s} · ${c} · ${a} মিনিট আগের`],
  [/^Sample note: ask for the (.+) main stop; buses stop on the main road\.$/, 'নমুনা নোট: $1 মূল স্টপ খুঁজুন; বাস মূল সড়কে থামে।'],
  [/^usual: (.+)$/, 'সাধারণ: $1'],
  [/^Watching (.+)\. You'll be warned here if a confirmed alert or rush hour hits it\.$/, '$1 নজরে রাখা হচ্ছে। নিশ্চিত সতর্কতা বা ভিড়ের সময় পড়লে এখানে জানানো হবে।'],
  [/^(.+): clear again\. (.+)$/, (m, a, b) => `${a}: আবার পরিষ্কার। ${tr(b)}`],
  [/^Open shares from (.+)$/, '$1 থেকে চালু শেয়ার'],
  [/^arrive (\d\d:\d\d)$/, 'পৌঁছানো $1'],
  [/^(\d+)\/(\d+) riders$/, '$1/$2 যাত্রী'],
  // Monsoon delta tiles and cards
  [/^([+-]?\d+) min$/, '$1 মিনিট'], [/^([+-]?\d+)(?: to ([+-]?\d+))? BDT$/, (m, a, b) => `${b ? `${a} থেকে ${b}` : a} টাকা`],
  [/^(\d+) min · (.+) · (\d+) transfer\(s\)$/, '$1 মিনিট · $2 · $3 বদল'],
  [/^Simulated conditions, not live incidents\. Map: red = cut segment, grey dashes = usual route, bold = new route, blue haze = rain\. (.*)$/, (m, r) => `সিমুলেটেড অবস্থা, সত্যিকারের ঘটনা নয়। মানচিত্র: লাল = কাটা অংশ, ধূসর ড্যাশ = সাধারণ রুট, মোটা = নতুন রুট, নীল আভা = বৃষ্টি। ${tr(r)}`],
  [/^Backup planned before the change \((.+)\): still works, (\d+) min( — now the main route)?\.$/, (m, s, n, main) => `পরিবর্তনের আগে ঠিক করা ব্যাকআপ (${s}): এখনও চলে, ${n} মিনিট${main ? ' — এখন এটিই মূল রুট' : ''}।`],
  [/^Backup planned before the change \((.+)\): cut too \((.+)\)\.$/, 'পরিবর্তনের আগে ঠিক করা ব্যাকআপ ($1): এটিও বন্ধ ($2)।'],
  [/^Choose two different hubs on the Search tab\.$/, 'পরিকল্পনা ট্যাবে দুটি আলাদা হাব বেছে নিন।'],
  // engine sentences: directions
  [/^(Take a rickshaw|Take a CNG|Walk|Take (.+?)) from (.+?) to (.+?)(?: via (.+?))?: about (\d+) min ride(?: \+ (\d+) min wait)?\.$/, (m, verb, line, a, b, via, ride, wait) => {
    const how = verb === 'Walk' ? 'হেঁটে যান' : verb === 'Take a rickshaw' ? 'রিকশায় যান' : verb === 'Take a CNG' ? 'সিএনজিতে যান' : `${line}-এ যান`;
    return `${a} থেকে ${b}${via ? ` (${via} হয়ে)` : ''} ${how}: প্রায় ${ride} মিনিট যাত্রা${wait ? ` + ${wait} মিনিট অপেক্ষা` : ''}।`;
  }],
  [/^MRT-6 crowded in rush hour \((.+)\)$/, 'ভিড়ের সময় মেট্রো রেলে ভিড় ($1)'],
  [/^Long cross-city route\.$/, 'শহরের এক প্রান্ত থেকে আরেক প্রান্তে দীর্ঘ রুট।'],
  [/^Parallel to metro, cheaper, slower\.$/, 'মেট্রোর পাশাপাশি; সস্তা, তবে ধীর।'],
  // engine sentences: why lines
  [/^Avoids (.+?): (\w+) confirmed \(([\d.]+), (\d+) reports?\)$/, (m, p, t, c, n) => `${p} এড়ায়: ${EXACT[t] || t} নিশ্চিত (${c}, ${n}টি রিপোর্ট)`],
  [/^Passes (.+?): (\w+) confirmed \(([\d.]+)\) → (.+)$/, (m, p, t, c, e) => `${p} দিয়ে যায়: ${EXACT[t] || t} নিশ্চিত (${c}) → ${e.replace(/^time ×(\d+)$/, 'সময় ×$1').replace(/^road links broken$/, 'রাস্তার সংযোগ বন্ধ')}`],
  [/^Passes (.+?): unverified (\w+) \(([\d.]+), (\d+) reports?\) → only \+25% time, not trusted enough to block$/, (m, p, t, c, n) => `${p} দিয়ে যায়: যাচাই না হওয়া ${EXACT[t] || t} (${c}, ${n}টি রিপোর্ট) → শুধু +২৫% সময়, বন্ধ করার মতো আস্থা নেই`],
  [/^Metro passes over (.+?): (\w+) there does not affect it$/, (m, p, t) => `মেট্রো ${p}-এর ওপর দিয়ে যায়: সেখানকার ${EXACT[t] || t} এতে প্রভাব ফেলে না`],
  [/^Metro passes over (.+?) \(unverified (\w+)\)$/, (m, p, t) => `মেট্রো ${p}-এর ওপর দিয়ে যায় (যাচাই না হওয়া ${EXACT[t] || t})`],
  [/^Ignores fading report at (.+?) \(([\d.]+), last verified (\d+) min ago\)$/, '$1-এর ম্লান রিপোর্ট বাদ ($2, শেষ যাচাই $3 মিনিট আগে)'],
  [/^Ignores disputed report at (.+?) \(conflicting votes\)$/, '$1-এর বিতর্কিত রিপোর্ট বাদ (পরস্পরবিরোধী ভোট)'],
  // engine sentences: fares and best time
  [/^: (৳\d+) is (\d+)% above the expected (৳[\d–]+)\.(.*)$/, (m, c, p, e, rest) => `: ${c} প্রত্যাশিত ${e}-এর চেয়ে ${p}% বেশি।${tr(rest)}`],
  [/^: (৳\d+) is within the expected (৳[\d–]+)\.(.*)$/, (m, c, e, rest) => `: ${c} প্রত্যাশিত ${e}-এর মধ্যে।${tr(rest)}`],
  [/^: (৳\d+) is below the expected (৳[\d–]+)\.(.*)$/, (m, c, e, rest) => `: ${c} প্রত্যাশিত ${e}-এর কম।${tr(rest)}`],
  [/ Student half fare applied \(bus only\)\./g, ' শিক্ষার্থীর অর্ধেক ভাড়া ধরা হয়েছে (শুধু বাসে)।'],
  [/ Student half fare applies to buses only\./g, ' শিক্ষার্থীর অর্ধেক ভাড়া শুধু বাসে।'],
  [/ This amount is flagged as unrealistic \(S1\) and not counted in stats\./g, ' এই অঙ্কটি অবাস্তব হিসেবে চিহ্নিত (S1), পরিসংখ্যানে ধরা হয়নি।'],
  [/^Community reports for this trip and mode under the current fare table: (\d+)(?:, median ৳(\d+))?\.$/, (m, n, md) => `বর্তমান ভাড়ার টেবিলে এই যাত্রা ও যানবাহনের যাত্রী রিপোর্ট: ${n}${md ? `, মাঝামাঝি ৳${md}` : ''}।`],
  [/^\. The verdict compares against that estimate, not an official chart\.$/, '। রায়টি এই অনুমানের সাথে তুলনা, সরকারি চার্টের সাথে নয়।'],
  [/The verdict compares against that estimate, not an official chart\./g, 'রায়টি এই অনুমানের সাথে তুলনা, সরকারি চার্টের সাথে নয়।'],
  [/^(.+): leave now \((\d\d:\d\d)\)\. No departure in the next (\d+) min is meaningfully faster or cheaper\.$/, '$1: এখনই বের হন ($2)। পরের $3 মিনিটে উল্লেখযোগ্যভাবে দ্রুত বা সস্তা কোনো সময় নেই।'],
  [/^Leave now: none of these routes gets meaningfully faster or cheaper in the next (\d+) min\.$/, 'এখনই বের হন: পরের $1 মিনিটে কোনো রুট উল্লেখযোগ্যভাবে দ্রুত বা সস্তা হয় না।'],
  [/^Assumes current alerts, rain and scenario stay as they are; only the departure time changes \(rush-hour multipliers and surges\)\.(.*)$/, (m, rest) => `ধরে নেওয়া হয়েছে সতর্কতা, বৃষ্টি ও পরিস্থিতি একই থাকবে; শুধু ছাড়ার সময় বদলায় (ভিড়ের সময়ের গুণক ও বাড়তি ভাড়া)।${rest.replace(/Rush windows: (.+)\.$/, ' ভিড়ের সময়: $1।')}`],
  // engine sentences: Monsoon
  [/^With (.+?), (.+?) (?:is|are) cut\. /, (m, w, s) => `${tr(w)} হলে ${s} বন্ধ হয়ে যায়। `],
  [/^With (.+?), the usual route is not affected\. /, (m, w) => `${tr(w)} হলেও সাধারণ রুটে প্রভাব নেই। `],
  [/^With (.+?), (\d+) segment\(s\) slow down\. /, (m, w, n) => `${tr(w)} হলে ${n}টি অংশ ধীর হয়। `],
  [/Detour: (.+?)\. (\d+) min/g, 'বিকল্প পথ: $1। $2 মিনিট'], [/Same route\. (\d+) min/g, 'একই রুট। $1 মিনিট'],
  [/ \(([+-]?\d+) min\), /g, ' ($1 মিনিট), '], [/ \(([+-]?\d+)(?: to ([+-]?\d+))? BDT\)\./g, (m, a, b) => ` (${b ? `${a} থেকে ${b}` : a} টাকা)।`],
  [/ The planned backup is cut too\./g, ' পরিকল্পিত ব্যাকআপ রুটও বন্ধ।'], [/ This is the backup planned before the change\./g, ' এটিই পরিবর্তনের আগে ঠিক করা ব্যাকআপ।'],
  [/ The planned backup \((.+?)\) also still works: (\d+) min\./g, ' পরিকল্পিত ব্যাকআপ ($1) এখনও চলে: $2 মিনিট।'],
  [/^There was no open route before the scenario\.$/, 'পরিস্থিতির আগে কোনো চালু রুট ছিল না।'],
  [/^With (.+?), no open route remains between (.+?) and (.+?)\.$/, (m, w, a, b) => `${tr(w)} হলে ${a} ও ${b}-এর মধ্যে কোনো চালু রুট থাকে না।`],
  [/^(✖|⏱) (.+?): (.+)$/, (m, k, s, r) => `${k} ${s}: ${tr(r)}`],
  [/\bheavy rain at\b/g, 'ভারী বৃষ্টি:'], [/\brain at\b/g, 'বৃষ্টি:'], [/\bblocked\b/g, 'বন্ধ'], [/\brush hour\b/g, 'ভিড়ের সময়'], [/\bnot running:/g, 'বন্ধ:'], [/\bdelayed:/g, 'দেরি:'], [/\bsuspended\b/g, 'বন্ধ'],
  [/\bsimulated delay\b/g, 'সিমুলেটেড দেরি'], [/\blink\(s\) closed\b/g, 'সংযোগ বন্ধ'],
  // watch
  [/^Your usual route is cut at (.+?): (.+?)\. Take (.+?) instead: (\d+) min \(([+-]?\d+) min vs usual\), (.+)\.$/, 'আপনার সাধারণ রুট $1-এ বন্ধ: $2। এর বদলে $3 নিন: $4 মিনিট (সাধারণের চেয়ে $5 মিনিট), $6।'],
  [/^Your usual route is cut at (.+?) \((.+?)\) and no open route remains right now\.$/, 'আপনার সাধারণ রুট $1-এ বন্ধ ($2), এখন কোনো চালু রুট নেই।'],
  // stats title on the results header
  [/^(\d+) search steps, (\d+) hub paths, (\d+) distinct routes; rejected: (.+); links skipped: (.+)$/, '$1 ধাপ খোঁজা, $2টি হাব-পথ, $3টি আলাদা রুট; বাদ: $4; বাদ পড়া সংযোগ: $5'],
  [/^(MRT-6|Bus|Leguna|Rickshaw|CNG|Walk) (\S+): (\d+(?:\.\d+)?) min(?: incl\. (\d+) min wait)?$/, (m, md, l, n, w) => `${EXACT[md]} ${l}: ${n} মিনিট${w ? `, ${w} মিনিট অপেক্ষাসহ` : ''}`],
  [/^(.+?) \((.+?)\) · status (\w+)\. Click: set To · Shift\+click: set From$/, (m, n, b, s) => `${b} · অবস্থা ${EXACT[s] || s}। ক্লিক: গন্তব্য · Shift+ক্লিক: শুরু`],
  [/^(.+?): set as destination$/, '$1: গন্তব্য করুন'],
  [/^Show all (\d+) hubs$/, 'সব $1টি হাব দেখুন'],
  [/^Leg (\d+)$/, 'ধাপ $1'],
  [/^\(bus: govt gazette (\d+) Sep (\d{4}) · MRT-6 policy · others estimates\)$/, '(বাস: সরকারি গেজেট $1 সেপ্টেম্বর $2 · মেট্রো রেল: নীতি · বাকিগুলো অনুমান)'],
  [/^· bus: BRTA gazette effective (\d+) Sep (\d{4}); MRT-6: govt fare policy \(station chart approximated\); rickshaw\/CNG: team estimates$/, '· বাস: বিআরটিএ গেজেট, কার্যকর $1 সেপ্টেম্বর $2; মেট্রো রেল: সরকারি ভাড়া নীতি (স্টেশন চার্ট আনুমানিক); রিকশা/সিএনজি: দলের অনুমান'],
  // share bot (server rides.js) and errors
  [/^(🤖 )?Split (\d+) ways?: (৳[\d–]+) each, of (৳[\d–]+) total(?: \(includes ×([\d.]+) (rush \+ rain|rush-hour|rain) surge; baseline (৳[\d–]+)\))?\.( With one more rider: (৳[\d–]+) each\.| Seats full\.) Agree the total with the driver before boarding; split it evenly\.$/,
    (m, bot, n, each, tot, sx, why, base, next, nx) => `${bot || ''}${n} জনে ভাগ: প্রতিজন ${each}, মোট ${tot}${sx ? ` (×${sx} ${why === 'rain' ? 'বৃষ্টির' : why === 'rush-hour' ? 'ভিড়ের' : 'ভিড় + বৃষ্টির'} বাড়তি; স্বাভাবিক ${base})` : ''}।${nx ? ` আরেকজন এলে: প্রতিজন ${nx}।` : ' আসন পূর্ণ।'} ওঠার আগে চালকের সাথে মোট ভাড়া ঠিক করে নিন; সমান ভাগ করুন।`],
  [/^Joined an open share going there\. (.+)$/, (m, r) => `সেদিকে যাওয়া একটি চালু শেয়ারে যোগ দিয়েছেন। ${tr(r)}`],
  [/^Share posted\. Others at the hub can join for the next 20 min\. (.+)$/, (m, r) => `শেয়ার পোস্ট হয়েছে। হাবের অন্যরা পরের ২০ মিনিট যোগ দিতে পারবেন। ${tr(r)}`],
  [/^There is no direct (\w+) link from (.+?) to (.+?) in the network\.$/, (m, md, a, b) => `নেটওয়ার্কে ${a} থেকে ${b} সরাসরি ${EXACT[md] || md} সংযোগ নেই।`],
  [/^No (\w+) connection between (.+?) and (.+?) in the network\.$/, (m, md, a, b) => `নেটওয়ার্কে ${a} ও ${b}-এর মধ্যে ${EXACT[md] || md} সংযোগ নেই।`],
  [/^(\d+)\/(\d+) riders?( \(you are in\))?$/, (m, a, b, me) => `${a}/${b} যাত্রী${me ? ' (আপনি আছেন)' : ''}`],
  [/(৳[\d–]+) each if one more joins/g, 'আরেকজন এলে প্রতিজন $1'],
  // map tooltips (schematic): "⚠ Mohakhali gridlock: active, confidence 1, 0 min old — “…”"
  [/⚠ (.+?) (\w+): (\w+), confidence ([\d.]+), (\d+) min old/g, (m, p, t, st, c, a) => `⚠ ${p} ${EXACT[t] || t}: ${EXACT[st] || st}, আস্থা ${c}, ${a} মিনিট আগের`],
  [/^Rickshaw ([A-Z]{3}-[A-Z]{3})$/, 'রিকশা $1'], [/^CNG ([A-Z]{3}-[A-Z]{3})$/, 'সিএনজি $1'], [/^Walk (.+)$/, 'হাঁটা: $1'],
  // labels joined with commas (best time, tooltips)
  [/^(?:(?:Cheapest|Fastest|Balanced|Fewest transfers)(?:, |$))+$/, (m) => m.split(', ').map((x) => EXACT[x] || x).join(', ')],
  [/ transfers vs main\)/g, ' বদল, মূল রুটের তুলনায়)'], [/\bnot running\b/g, 'চলছে না'],
  // fare sources (server fare table)
  [/^Govt gazette \(BRTA chart\), (৳[\d.]+)\/km, minimum (৳\d+), effective (.+?)( ·)?$/, (m, r, mn, d, dot) => `সরকারি গেজেট (বিআরটিএ চার্ট), ${r}/কিমি, সর্বনিম্ন ${mn}, কার্যকর ${d}${dot || ''}`],
  [/^MRT-6 fare policy, (৳\d+)\/km, (৳[\d–]+) \(official fare is a station chart; per-km rule approximates it\)( ·)?$/, (m, r, rg, dot) => `মেট্রো রেলের ভাড়া নীতি, ${r}/কিমি, ${rg} (সরকারি ভাড়া স্টেশনভিত্তিক চার্ট; কিমি-হিসাব আনুমানিক)${dot || ''}`],
  [/^Team estimate: flat fare per line, no official chart in the app$/, 'দলের অনুমান: লাইনপ্রতি নির্দিষ্ট ভাড়া, অ্যাপে সরকারি চার্ট নেই'],
  [/^Team estimate: unmetered, negotiated fare \(range shown\)$/, 'দলের অনুমান: মিটার নেই, দরদাম করা ভাড়া (সীমা দেখানো)'],
  [/^Team estimate: meters are rarely used, negotiated fare \(range shown\)$/, 'দলের অনুমান: মিটার কম চলে, দরদাম করা ভাড়া (সীমা দেখানো)'],
  [/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})\b/g, (m, d, mo, y) => `${d} ${{ Jan: 'জানুয়ারি', Feb: 'ফেব্রুয়ারি', Mar: 'মার্চ', Apr: 'এপ্রিল', May: 'মে', Jun: 'জুন', Jul: 'জুলাই', Aug: 'আগস্ট', Sep: 'সেপ্টেম্বর', Oct: 'অক্টোবর', Nov: 'নভেম্বর', Dec: 'ডিসেম্বর' }[mo]} ${y}`],
  [/^\(bus: govt gazette 22 Sep 2026 · MRT-6 policy · others estimates\)$/, '(বাস: সরকারি গেজেট ২২ সেপ্টেম্বর ২০২৬ · মেট্রো রেল: নীতি · বাকিগুলো অনুমান)'],
  // mode words inside engine sentences ("rickshaw Dhanmondi→Science Lab · walk …")
  [/\brickshaw\b/g, 'রিকশা'], [/\bwalk\b/g, 'হাঁটা'], [/\bCNG\b/g, 'সিএনজি'], [/\bleguna\b/g, 'লেগুনা'], [/\bMRT-6\b/g, 'মেট্রো রেল'], [/\bbus\b/g, 'বাস'],
  // units and leftovers inside mixed strings
  [/\b(\d+(?:\.\d+)?) km\b/g, '$1 কিমি'], [/\b(\d+(?:\.\d+)?) min\b/g, '$1 মিনিট'], [/\btransfer\(s\)/g, 'বদল'], [/\bBDT\b/g, 'টাকা'],
  [/\bstudent\b/g, 'শিক্ষার্থী'], [/ · (Bus|Leguna|Rickshaw|CNG|Walk|MRT-6) /g, (m, md) => ` · ${EXACT[md]} `],
];

let lang = 'en', hubPairs = [], hubRe = null, observer = null, applying = false;
const origText = new WeakMap();       // text node -> English original
const shownText = new WeakMap();      // text node -> what we last wrote (to notice app updates)
const origAttr = new WeakMap();       // element -> { attr: English original }

export const getLang = () => lang;

// hub names come from the network: { name, bn }
export function setHubs(hubs) {
  hubPairs = (hubs || []).filter((h) => h && h.name && h.bn).map((h) => [h.name, h.bn]).sort((a, b) => b[0].length - a[0].length);
  hubRe = hubPairs.length ? new RegExp(`\\b(${hubPairs.map(([n]) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g') : null;
  if (lang === 'bn') translateTree(document.body);
}
const hubBn = (n) => (hubPairs.find(([en]) => en === n) || [n, n])[1];

// English text -> Bangla text (leading/trailing whitespace kept)
export function tr(s) {
  const m = String(s).match(/^(\s*)([\s\S]*?)(\s*)$/);
  let core = m[2];
  if (!core) return s;
  // hub options "Dhanmondi · ধানমন্ডি" -> "ধানমন্ডি"
  const opt = core.match(/^(.+?) · (\S.*)$/);
  if (opt && hubPairs.some(([en, bn]) => en === opt[1] && bn === opt[2])) return m[1] + opt[2] + m[3];
  let out = EXACT[core];
  if (out == null) {
    out = core;
    for (const [re, rep] of FRAGMENTS) {
      if (re.global) out = out.replace(re, rep);
      else if (re.test(out)) { out = out.replace(re, rep); }
    }
  }
  if (hubRe) out = out.replace(hubRe, (x) => hubBn(x));
  return m[1] + bnDigits(out) + m[3];
}

const skipped = (el) => !el || !!el.closest(SKIP);

function translateNode(n) {
  if (n.nodeType === 3) {
    const v = n.nodeValue;
    if (!v || !v.trim() || skipped(n.parentElement)) return;
    if (shownText.get(n) === v) return;                    // ours, already translated
    const opt = n.parentElement.closest('option');         // an <option> without value= takes its value from its text: pin it first
    if (opt && !opt.hasAttribute('value')) opt.setAttribute('value', opt.value);
    origText.set(n, v);                                    // new or updated by the app: this is the English source
    const t = tr(v);
    shownText.set(n, t);
    if (t !== v) n.nodeValue = t;
    return;
  }
  if (n.nodeType !== 1 || skipped(n)) return;
  for (const a of ATTRS) {
    if (!n.hasAttribute(a) || (a === 'placeholder' && KEEP_ATTR.has(n.id))) continue;
    const saved = origAttr.get(n) || {}, cur = n.getAttribute(a);
    if (saved[a + ':shown'] === cur) continue;
    saved[a] = cur; const t = tr(cur); saved[a + ':shown'] = t; origAttr.set(n, saved);
    if (t !== cur) n.setAttribute(a, t);
  }
}
function translateTree(root) {
  if (!root) return;
  translateNode(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: (x) => (x.nodeType === 1 && skipped(x) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let x; while ((x = w.nextNode())) translateNode(x);
}
function restoreTree(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let x;
  while ((x = w.nextNode())) {
    if (x.nodeType === 3) { if (origText.has(x) && shownText.get(x) === x.nodeValue) x.nodeValue = origText.get(x); origText.delete(x); shownText.delete(x); continue; }
    const saved = origAttr.get(x); if (!saved) continue;
    for (const a of ATTRS) if (a in saved && x.getAttribute(a) === saved[a + ':shown']) x.setAttribute(a, saved[a]);
    origAttr.delete(x);
  }
}

function observe(on) {
  if (!on) { if (observer) observer.disconnect(); observer = null; return; }
  if (observer) return;
  observer = new MutationObserver((recs) => {
    if (applying) return;
    applying = true;
    try {
      for (const r of recs) {
        if (r.type === 'childList') r.addedNodes.forEach((n) => translateTree(n));
        else if (r.type === 'characterData') translateNode(r.target);
        else if (r.type === 'attributes') translateNode(r.target);
      }
    } finally { applying = false; }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

export function setLang(l, { save = true } = {}) {
  lang = l === 'bn' ? 'bn' : 'en';
  if (save) store('dp-lang', lang);
  const root = document.documentElement;
  root.lang = lang; root.dataset.lang = lang;
  applying = true;
  try {
    if (lang === 'bn') { translateTree(document.body); observe(true); }
    else { observe(false); restoreTree(document.body); }
  } finally { applying = false; }
  const b = document.getElementById('lang-toggle');
  if (b) { b.textContent = lang === 'bn' ? 'EN' : 'বাং'; b.setAttribute('aria-label', lang === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন (Switch to Bangla)'); b.title = b.getAttribute('aria-label'); b.setAttribute('aria-pressed', String(lang === 'bn')); }
  document.title = lang === 'bn' ? 'ঢাকাপথ' : 'DhakaPath';
}

export function initLang() {
  const saved = store('dp-lang');
  const want = saved || ((navigator.language || '').toLowerCase().startsWith('bn') ? 'bn' : 'en');
  const b = document.getElementById('lang-toggle');
  if (b) b.onclick = () => setLang(lang === 'bn' ? 'en' : 'bn');
  setLang(want, { save: false });
}
void T;
