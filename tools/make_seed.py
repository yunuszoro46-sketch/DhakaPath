#!/usr/bin/env python3
"""Regenerates src/data/seed.json and src/data/config.json from the team build spec tables
(DhakaPath Build Spec, sections 2-4, 7). Edit the JSON directly afterwards if you prefer;
this script is kept so the seed's origin is traceable."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
hubs = [
 ("UTT","Uttara",560,40,"north","উত্তরা",["uttara","uttora","উত্তরা"]),
 ("MIR","Mirpur",200,120,"northwest","মিরপুর",["mirpur","mirpur 10","mirpur10","mirpur-10","মিরপুর","মিরপুর ১০"]),
 ("MOH","Mohakhali",560,170,"central-north","মহাখালী",["mohakhali","মহাখালী"]),
 ("AGA","Agargaon",300,230,"central-west","আগারগাঁও",["agargaon","agargao","আগারগাঁও"]),
 ("BAD","Badda",800,200,"east","বাড্ডা",["badda","বাড্ডা"]),
 ("FAR","Farmgate",440,290,"central","ফার্মগেট",["farmgate","farm gate","farmget","ফার্মগেট"]),
 ("SHA","Shahbagh",540,370,"central","শাহবাগ",["shahbagh","shahbag","sahbag","শাহবাগ"]),
 ("SCI","Science Lab",400,400,"central-south","সায়েন্স ল্যাব",["science lab","sci lab","sciencelab","science lab mor","সায়েন্স ল্যাব","সাইন্স ল্যাব"]),
 ("MPR","Mohammadpur",120,330,"west","মোহাম্মদপুর",["mohammadpur","mohammodpur","mdpur","md pur","মোহাম্মদপুর"]),
 ("DHA","Dhanmondi",260,440,"south-west","ধানমন্ডি",["dhanmondi","dhanmandi","dhanmondi 27","ধানমন্ডি"]),
 ("MAL","Malibagh",760,340,"east","মালিবাগ",["malibagh","malibag","মালিবাগ"]),
 ("BAN","Banasree",900,400,"far-east","বনশ্রী",["banasree","banasri","bonosree","বনশ্রী"]),
 ("MOT","Motijheel",680,470,"central-east","মতিঝিল",["motijheel","motijhil","motijeel","মতিঝিল"]),
 ("JAT","Jatrabari",820,560,"south-east","যাত্রাবাড়ী",["jatrabari","যাত্রাবাড়ী"]),
]
# Map positions (lat, lng): approximate area centres from the team's KoyJabo module
# (koyjabo/src/data/network.js, labelled there "approximate area centres ... replace with surveyed values").
latlng = {"MOT": (23.733, 90.4172), "BAN": (23.7632, 90.4326), "MAL": (23.7497, 90.4126), "SHA": (23.7388, 90.3958),
          "FAR": (23.7561, 90.3872), "SCI": (23.7395, 90.3836), "DHA": (23.7461, 90.3742), "MPR": (23.7662, 90.3589),
          "MIR": (23.8069, 90.3687), "AGA": (23.7775, 90.38), "MOH": (23.7781, 90.405), "BAD": (23.7805, 90.426),
          "UTT": (23.8759, 90.3795), "JAT": (23.7101, 90.4344)}
landmark = {"FAR": ("MRT: use the Farmgate station entrance; the bus stop is on the opposite side of the road.",
                    "MRT er jonno Farmgate station er gate use koren; bus stop rastar opor pashe.")}
H = []
for i, n, x, y, z, bn, al in hubs:
    en, bb = landmark.get(i, (f"Sample note: ask for the {n} main stop; buses stop on the main road.",
                              f"Sample: {n} main stop e namben; bus main road e thame."))
    H.append({"id": i, "name": n, "bn": bn, "x": x, "y": y, "lat": latlng[i][0], "lng": latlng[i][1], "coordsApprox": True, "zone": z, "aliases": al,
              "landmarks": [{"note_en": en, "note_bn_banglish": bb, "sample": True}]})
lines, edges = [], []
def add_line(id, name, mode, stops, kms, minutes=None, fare=None, eligible=False, note=""):
    line = {"id": id, "name": name, "mode": mode, "stops": stops, "status": "active"}
    if fare is not None: line["flatFare"] = fare
    lines.append(line)
    for k in range(len(stops) - 1):
        km = kms[k]
        mins = minutes[k] if minutes else round(km * 3 * 10) / 10
        edges.append({"id": f"{id}:{stops[k]}-{stops[k+1]}", "line": id, "mode": mode, "from": stops[k], "to": stops[k+1],
                      "km": km, "minutes": mins, "studentEligible": eligible, "boardingNote": note})
add_line("MRT6", "MRT Line-6", "metro", ["UTT","MIR","AGA","FAR","SHA","MOT"], [9.0,3.5,2.0,2.5,3.0], [14,6,4,5,6], note="Elevated metro; tap your card at the gate.")
add_line("B1", "B1 Mirpur-Motijheel", "bus", ["MIR","AGA","FAR","SHA","MOT"], [3.5,2.0,2.5,3.0], eligible=True, note="Parallel to metro, cheaper, slower.")
add_line("B2", "B2 Uttara-Farmgate", "bus", ["UTT","MOH","FAR"], [8.0,2.5], eligible=True)
add_line("B3", "B3 Badda-Motijheel", "bus", ["BAD","MAL","MOT"], [3.0,3.0], eligible=True)
add_line("B4", "B4 Mohammadpur-Jatrabari", "bus", ["MPR","DHA","SCI","SHA","MOT","JAT"], [3.0,1.5,1.5,3.0,3.0], eligible=True, note="Long cross-city route.")
add_line("B5", "B5 Banasree-Motijheel", "bus", ["BAN","MAL","MOT"], [2.5,3.0], eligible=True)
add_line("B6", "B6 Agargaon-Mohammadpur", "bus", ["AGA","MPR"], [3.0], eligible=True)
add_line("B7", "B7 Mohakhali-Badda", "bus", ["MOH","BAD"], [4.0], eligible=True)
add_line("L1", "L1 Leguna Motijheel-Jatrabari", "leguna", ["MOT","JAT"], [3.0], [12], fare=15)
add_line("L2", "L2 Leguna Mirpur-Agargaon", "leguna", ["MIR","AGA"], [3.5], [15], fare=15)
for a, b, km, m in [("BAN","MAL",2.5,15),("MAL","BAD",3.0,18),("SHA","SCI",1.5,9),("SCI","DHA",1.5,9),("FAR","SCI",2.0,12),("MOH","FAR",2.5,15),("MPR","DHA",2.5,15)]:
    add_line(f"R-{a}-{b}", f"Rickshaw {a}-{b}", "rickshaw", [a, b], [km], [m], note="Non-metered: agree the fare before you sit.")
for a, b, km, m in [("MOH","BAD",4.0,14),("DHA","FAR",3.0,12),("MAL","SHA",3.0,12),("UTT","MOH",8.5,25),("AGA","DHA",3.5,13)]:
    add_line(f"C-{a}-{b}", f"CNG {a}-{b}", "cng", [a, b], [km], [m], note="CNG: usually unmetered, agree the fare before the ride.")
add_line("W-SHA-SCI", "Walk Shahbagh-Science Lab", "walk", ["SHA","SCI"], [1.5], [20])
seed = {"_notice": "SEED DATA, NOT OFFICIAL. Distances and times are illustrative; landmark notes marked sample are placeholders. Bus and MRT-6 fare rules follow published official sources (see fares.*.source in config.json); rickshaw, CNG and leguna fares are team estimates marked VERIFY.",
        "hubs": H, "lines": lines, "edges": edges}
config = {
 "_notice": "Seed assumptions from the team build spec. Bus and MRT-6 fares cite official sources (checked 2026-10-16); VERIFY items are still estimates.",
 "fares": {
  "version": 1, "effectiveFrom": None, "source": "bus: BRTA gazette effective 22 Sep 2026; MRT-6: govt fare policy (station chart approximated); rickshaw/CNG: team estimates",
  "bus": {"perKm": 2.70, "minimum": 10, "studentDivisor": 2,
          "source": {"official": True, "short": "Govt gazette (BRTA chart), ৳2.70/km, minimum ৳10, effective 22 Sep 2026", "text": "Govt gazette: Dhaka and Chattogram metropolitan buses Tk 2.70 per passenger-km (up from Tk 2.53), minimum Tk 10 unchanged; effective 22 Sep 2026", "url": "https://www.dhakatribune.com/bangladesh/420498/govt-issues-gazette-raising-bus-minibus-fares-by", "checked": "2026-10-16"},
          "_note": "minibuses (Tk 2.60/km, minimum Tk 8) and DTCA-area buses (Tk 2.60/km) are not modelled; the team spec's 2.45 was the 2022 rate"},
  "metro": {"perKm": 5, "minimum": 20, "maximum": 100, "roundTo": 5,
            "source": {"official": True, "short": "MRT-6 fare policy, ৳5/km, ৳20–100 (official fare is a station chart; per-km rule approximates it)", "text": "MRT-6 fare policy: Tk 5 per km, minimum Tk 20, maximum Tk 100; the official fare is a station-to-station chart, approximated here by the per-km rule. No student discount (no decision as of May 2026); 25% off single journeys for citizens 65+ and persons with disabilities (May 2026), not modelled", "url": "https://thefinancialexpress.com.bd/home/metro-rail-fare-chart-published-1662693869", "url2": "https://www.tbsnews.net/bangladesh/elderly-disabled-passengers-get-25-fare-cut-metro-rail-1444361", "checked": "2026-10-16"}},
  "leguna": {"source": {"official": False, "short": "Team estimate: flat fare per line, no official chart in the app"}, "VERIFY": "flat fares per line in seed.json"},
  "rickshaw": {"source": {"official": False, "short": "Team estimate: unmetered, negotiated fare (range shown)"}, "lowPerKm": 20, "highPerKm": 30, "minimum": 20, "roundTo": 5, "surge": {"rush": 1.3, "rain": 1.5, "both": 1.8}, "VERIFY": "current rickshaw rates"},
  "cng": {"source": {"official": False, "short": "Team estimate: meters are rarely used, negotiated fare (range shown)"}, "lowPerKm": 35, "highPerKm": 50, "minimum": 60, "roundTo": 5, "surge": {"rush": 1.3, "rain": 1.4, "both": 1.6}, "VERIFY": "current CNG rates; not in the team spec, added because the problem statement names CNGs as unmetered connectors"}
 },
 "rushHours": [["07:30", "10:30"], ["16:30", "20:00"]],
 "_rushHours_assumption": "Dhaka office peak windows (Asia/Dhaka time); used when the user does not set rush hour explicitly",
 "boardWait": {"bus": 8, "metro": 5, "leguna": 5, "rickshaw": 2, "cng": 4, "walk": 0, "_assumption": "bus and metro waits from the spec; leguna and rickshaw waits are team assumptions"},
 "transferWalkMinutes": 4,
 "conditions": {
  "rush": {"time": {"bus": 1.5, "rickshaw": 1.3, "cng": 1.4, "metro": 1.0, "leguna": 1.5, "walk": 1.0}, "_assumption": "leguna rush multiplier not in spec; set equal to bus"},
  "rain": {"time": {"bus": 1.4, "rickshaw": 1.3, "cng": 1.3, "metro": 1.0, "leguna": 1.4, "walk": 1.3}, "_assumption": "leguna and walk rain multipliers not in spec"},
  "heavyRain": {"time": {"bus": 1.8, "rickshaw": 1.6, "cng": 1.6, "metro": 1.0, "leguna": 1.8, "walk": 1.6}, "blocksModes": ["cng", "leguna"],
   "_assumption": "team assumption, not in spec: heavy rain (rainSeverity 'heavy') slows road modes more and takes CNG and leguna off the road in the rain zone (small engines stall in waterlogging); rickshaws and buses keep running; metro unaffected"}
 },
 "ranking": {"minutesWeight": 1, "fareWeight": 0.4, "transferWeight": 8, "maxEdges": 6, "maxDfsNodes": 200000,
  "_maxDfsNodes": "safety limit on DFS work; if reached the result is marked SEARCH_INCOMPLETE (never reached on the seed network)"},
 "alerts": {
  "initialConfidence": {"user": 0.35, "ai_ingest": 0.30, "admin": 0.90},
  "confirmStep": 0.20, "resolveStep": 0.30, "resolvedVotesToClose": 2,
  "halfLifeMinutes": {"waterlogging": 45, "gridlock": 30, "blockade": 60, "construction": 1440},
  "thresholds": {"active": 0.60, "unverified": 0.30, "fading": 0.15},
  "unverifiedTimeMultiplier": 1.25, "activeTimeMultiplier": 2.0,
  "activeBreaksTypes": ["blockade", "construction", "waterlogging"],
  "_assumption": "spec says hard = 'edge broken/heavy penalty': blockade, construction and waterlogging break road edges; gridlock doubles time"
 },
 "sanity": {"rickshawPerKm": [5, 60], "cngPerKm": [10, 100], "busMaxFactor": 2, "busMinimum": 10, "contradictionWindowMinutes": 10,
            "rateLimit": {"reports": 3, "windowMinutes": 10}, "severityDowngradeMinutes": 30}
}
json.dump(seed, open(os.path.join(ROOT, "server/data/seed.json"), "w"), ensure_ascii=False, indent=1)
json.dump(config, open(os.path.join(ROOT, "server/config.json"), "w"), ensure_ascii=False, indent=1)
print(len(H), "hubs", len(lines), "lines", len(edges), "edges")
