const { createClient } = require("@supabase/supabase-js");

const rows = [
  {
    tournamentName: "Idaho Cup",
    sport: "soccer",
    startDate: "2026-05-01",
    endDate: "2026-05-03",
    officialWebsiteUrl: "https://www.idahopremierleague.com/idaho-cup",
    teamFee: "$1050 IPL teams; $1250 non-IPL teams (includes referee fees)",
    ageGroupsOffered: "U13-U19",
    tournamentDirectorContact: "Idaho Premier League",
    tournamentDirectorEmail: "admin@idahopremierleague.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Brothers Park",
    streetAddress: "3719 S Indiana Ave",
    city: "Caldwell",
    state: "ID",
    zipCode: "83605",
    venueWebsiteUrl: "https://www.cityofcaldwell.org/Departments/Parks-Recreation/Parks/Brothers-Park",
  },
  {
    tournamentName: "2026 State Cup",
    sport: "soccer",
    startDate: "2026-04-24",
    endDate: "2026-05-31",
    officialWebsiteUrl: "https://www.idahoyouthsoccer.org/state-cup/",
    teamFee:
      "Qualifying: U12 $108/game; U13-U14 $119.50/game; U15-U16 $140/game; U17-U19 $149/game; State Cup Fee U12-U19 $1350",
    ageGroupsOffered: "U12-U19",
    tournamentDirectorContact: "Steve Frederick",
    tournamentDirectorEmail: "sfrederick@idahoyouthsoccer.org",
    refereeContact: "Riley Jones",
    refereeContactEmail: "rjones@idahoyouthsoccer.org",
    venueName: "Simplot Sports Complex",
    streetAddress: "2401 E Lake Forest Dr",
    city: "Boise",
    state: "ID",
    zipCode: "83716",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Director's Cup",
    sport: "soccer",
    startDate: "2026-05-15",
    endDate: "2026-05-17",
    officialWebsiteUrl: "https://www.idahoyouthsoccer.org/directors-cup/",
    teamFee: null,
    ageGroupsOffered: "U9-U19",
    tournamentDirectorContact: "Steve Frederick",
    tournamentDirectorEmail: "sfrederick@idahoyouthsoccer.org",
    refereeContact: "Riley Jones",
    refereeContactEmail: "rjones@idahoyouthsoccer.org",
    venueName: "Simplot Soccer Complex",
    streetAddress: "2401 E Lake Forest Dr",
    city: "Boise",
    state: "ID",
    zipCode: "83716",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "GEM State Challenge",
    sport: "soccer",
    startDate: "2025-10-03",
    endDate: "2025-10-05",
    officialWebsiteUrl: "https://www.idahoyouthsoccer.org/gem-state-challenge/",
    teamFee: "U9-U10 $850; U11-U12 $900; U13-U15 $950",
    ageGroupsOffered: "U9-U15",
    tournamentDirectorContact: "Steve Frederick",
    tournamentDirectorEmail: "sfrederick@idahoyouthsoccer.org",
    refereeContact: "Riley Jones",
    refereeContactEmail: "rjones@idahoyouthsoccer.org",
    venueName: "Simplot Sports Complex",
    streetAddress: "2401 E Lake Forest Dr",
    city: "Boise",
    state: "ID",
    zipCode: "83716",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Memorial Day Classico",
    sport: "soccer",
    startDate: "2026-05-22",
    endDate: "2026-05-25",
    officialWebsiteUrl: "https://boisetimbersthorns.org/memorial-day-classico-tournament/",
    teamFee:
      "2017/U9 $750; 2016/U10 $750; 2015/U11 $800; 2014/U12 $800; 2013/U13 $900; 2012/U14 $900; 2011/U15 $1000; 2010/U16 $1150; 2009/U17 $1150; 2008/2007/U19 $1150",
    ageGroupsOffered: "U9-U19 (birth years 2017-2007/08)",
    tournamentDirectorContact: "Boise Timbers | Thorns Tournaments Team",
    tournamentDirectorEmail: "tournaments@boisetimbersthorns.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "BTT Complex",
    streetAddress: "3924 E Lake Hazel Rd",
    city: "Meridian",
    state: "ID",
    zipCode: "83642",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Memorial Day Classico",
    sport: "soccer",
    startDate: "2026-05-22",
    endDate: "2026-05-25",
    officialWebsiteUrl: "https://boisetimbersthorns.org/memorial-day-classico-tournament/",
    teamFee:
      "2017/U9 $750; 2016/U10 $750; 2015/U11 $800; 2014/U12 $800; 2013/U13 $900; 2012/U14 $900; 2011/U15 $1000; 2010/U16 $1150; 2009/U17 $1150; 2008/2007/U19 $1150",
    ageGroupsOffered: "U9-U19 (birth years 2017-2007/08)",
    tournamentDirectorContact: "Boise Timbers | Thorns Tournaments Team",
    tournamentDirectorEmail: "tournaments@boisetimbersthorns.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Heroes Park",
    streetAddress: "3064 W Malta Dr",
    city: "Meridian",
    state: "ID",
    zipCode: "83646",
    venueWebsiteUrl: "https://meridiancity.org/parks/current-parks/heroes-park/",
  },
  {
    tournamentName: "Memorial Day Classico",
    sport: "soccer",
    startDate: "2026-05-22",
    endDate: "2026-05-25",
    officialWebsiteUrl: "https://boisetimbersthorns.org/memorial-day-classico-tournament/",
    teamFee:
      "2017/U9 $750; 2016/U10 $750; 2015/U11 $800; 2014/U12 $800; 2013/U13 $900; 2012/U14 $900; 2011/U15 $1000; 2010/U16 $1150; 2009/U17 $1150; 2008/2007/U19 $1150",
    ageGroupsOffered: "U9-U19 (birth years 2017-2007/08)",
    tournamentDirectorContact: "Boise Timbers | Thorns Tournaments Team",
    tournamentDirectorEmail: "tournaments@boisetimbersthorns.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Molenaar Park",
    streetAddress: "2815 S Maple Grove Rd",
    city: "Boise",
    state: "ID",
    zipCode: "83709",
    venueWebsiteUrl: "https://www.cityofboise.org/departments/parks-and-recreation/parks/molenaar-park/",
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Old Butte Soccer Complex",
    streetAddress: "600 Clarence Dr",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83402",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Ravsten Stadium",
    streetAddress: "770 7th St",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83401",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Hillcrest Stadium (Westmark Stadium)",
    streetAddress: "3200 Carolyn Ln",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83406",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Community Park",
    streetAddress: "455 E 25th St",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83404",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Mel Erickson (Sunnyside Park)",
    streetAddress: "E Sunnyside Rd",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83404",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Taylorview Middle School",
    streetAddress: "350 Castlerock Ln",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83404",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Frontier Fields School",
    streetAddress: "899 E 49th S",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83404",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Esquire Park",
    streetAddress: "800 Moonlite Drive",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83402",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Idaho Falls Shootout",
    sport: "soccer",
    startDate: "2026-05-07",
    endDate: "2026-05-09",
    officialWebsiteUrl: "https://www.idahofallsshootout.com/",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Mary Murray",
    tournamentDirectorEmail: "mmurray@byslsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Tautphaus Park",
    streetAddress: "Softball Drive",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83402",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Spooky Sixes 6v6",
    sport: "soccer",
    startDate: null,
    endDate: null,
    officialWebsiteUrl: "https://www.byslsoccer.org/Default.aspx?tabid=1437534",
    teamFee: null,
    ageGroupsOffered: null,
    tournamentDirectorContact: "Idaho Falls FC",
    tournamentDirectorEmail: "contact@idahofallsfc.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Old Butte Soccer Complex",
    streetAddress: "600 Clarence Dr",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83402",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Beat the Freeze 3v3",
    sport: "soccer",
    startDate: null,
    endDate: null,
    officialWebsiteUrl: "https://www.byslsoccer.org/Default.aspx?tabid=1437535",
    teamFee: null,
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Idaho Falls FC",
    tournamentDirectorEmail: "contact@idahofallsfc.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Old Butte Soccer Complex",
    streetAddress: "600 Clarence Dr",
    city: "Idaho Falls",
    state: "ID",
    zipCode: "83402",
    venueWebsiteUrl: null,
  },
  {
    tournamentName: "Montana State Cup",
    sport: "soccer",
    startDate: "2026-05-16",
    endDate: "2026-05-17",
    officialWebsiteUrl: "https://www.montanayouthsoccer.com/montana-state-cup/",
    teamFee: null,
    ageGroupsOffered: "U13-U19 Premier",
    tournamentDirectorContact: null,
    tournamentDirectorEmail: null,
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Amend Park",
    streetAddress: "5101 King Ave E",
    city: "Billings",
    state: "MT",
    zipCode: "59101",
    venueWebsiteUrl: "https://www.amendpark.org/location",
  },
  {
    tournamentName: "Montana Cup",
    sport: "soccer",
    startDate: "2026-05-16",
    endDate: "2026-05-17",
    officialWebsiteUrl: "https://www.montanayouthsoccer.com/montana-cup/",
    teamFee: null,
    ageGroupsOffered: "U13-U19",
    tournamentDirectorContact: null,
    tournamentDirectorEmail: null,
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Siebel Soccer Park",
    streetAddress: "5278 10th Ave N",
    city: "Great Falls",
    state: "MT",
    zipCode: "59405",
    venueWebsiteUrl: "https://www.montanarushsoccer.com/siebel-park",
  },
  {
    tournamentName: "Montana Showcase",
    sport: "soccer",
    startDate: "2026-05-09",
    endDate: "2026-05-10",
    officialWebsiteUrl: "https://www.montanayouthsoccer.com/montana-showcase/",
    teamFee: null,
    ageGroupsOffered: "U9-U12",
    tournamentDirectorContact: null,
    tournamentDirectorEmail: null,
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Siebel Soccer Complex",
    streetAddress: "2550 Skyway Dr",
    city: "Helena",
    state: "MT",
    zipCode: "59601",
    venueWebsiteUrl: "https://www.helenasoccer.org/about-us",
  },
  {
    tournamentName: "3BR",
    sport: "soccer",
    startDate: "2026-06-05",
    endDate: "2026-06-07",
    officialWebsiteUrl: "https://www.flatheadvalleyunited.com/3br",
    teamFee: "U6-U8 $495; U9-U10 $595; U11-U12 $695; U13-U19 $795",
    ageGroupsOffered: "U6-U19",
    tournamentDirectorContact: "Flathead Valley United",
    tournamentDirectorEmail: "admin@flatheadsoccer.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "KidSports Sports Complex",
    streetAddress: "1731 Champion Wy",
    city: "Kalispell",
    state: "MT",
    zipCode: "59901",
    venueWebsiteUrl: "https://www.kalispell.com/835/KYAC---Kidsports",
  },
  {
    tournamentName: "Intermountain Cup",
    sport: "soccer",
    startDate: "2026-06-12",
    endDate: "2026-06-14",
    officialWebsiteUrl: "https://www.strikersfcmt.org/intermountain",
    teamFee: "U9-U10 $650; U11-U12 $750; U13-U19 $850",
    ageGroupsOffered: "U9-U19",
    tournamentDirectorContact: "Chris Essman",
    tournamentDirectorEmail: "chris.essman@strikersfcmt.org",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Fort Missoula Regional Park",
    streetAddress: "3025 South Ave",
    city: "Missoula",
    state: "MT",
    zipCode: "59804",
    venueWebsiteUrl: "https://www.missoulacounty.gov/departments/parks-trails-recreation/fort-missoula-regional-park/",
  },
  {
    tournamentName: "Magic City Classic",
    sport: "soccer",
    startDate: "2026-04-25",
    endDate: "2026-04-26",
    officialWebsiteUrl: "https://sites.google.com/view/billingsunited/magic-city-classic",
    teamFee: "U9-U10 $650; U11-U12 $700; U13-U16 $750",
    ageGroupsOffered: "U9-U16",
    tournamentDirectorContact: null,
    tournamentDirectorEmail: null,
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Amend Park",
    streetAddress: "5101 King Ave E",
    city: "Billings",
    state: "MT",
    zipCode: "59101",
    venueWebsiteUrl: "https://www.amendpark.org/location",
  },
  {
    tournamentName: "SCHEELS 406 CUP",
    sport: "soccer",
    startDate: "2026-05-30",
    endDate: "2026-05-31",
    officialWebsiteUrl: "https://www.realbillingsfc.com/scheels-406-cup",
    teamFee: "U8 $300; U10 $450; U11-U12 $550; U13-U16 $650",
    ageGroupsOffered: "U8-U16",
    tournamentDirectorContact: "REAL Billings FC",
    tournamentDirectorEmail: "registrar@realbillingsfc.com",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Amend Park",
    streetAddress: "5101 King Ave E",
    city: "Billings",
    state: "MT",
    zipCode: "59101",
    venueWebsiteUrl: "https://www.amendpark.org/location",
  },
  {
    tournamentName: "Rumble in the Rockies",
    sport: "soccer",
    startDate: "2026-04-24",
    endDate: "2026-04-26",
    officialWebsiteUrl: "https://www.glaciersurfsoccer.com/my-tournament",
    teamFee: "U8 $525; U9-U10 $695; U11-U12 $795; U13-U19 $895",
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Nate Evans",
    tournamentDirectorEmail: "nate@glaciersurfsoccer.com",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Smith Fields Soccer Complex",
    streetAddress: "1600 Hospital Way",
    city: "Whitefish",
    state: "MT",
    zipCode: "59937",
    venueWebsiteUrl: "https://www.cityofwhitefish.gov/568/City-Parks-Facilities",
  },
  {
    tournamentName: "Rumble in the Rockies",
    sport: "soccer",
    startDate: "2026-04-24",
    endDate: "2026-04-26",
    officialWebsiteUrl: "https://www.glaciersurfsoccer.com/my-tournament",
    teamFee: "U8 $525; U9-U10 $695; U11-U12 $795; U13-U19 $895",
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Nate Evans",
    tournamentDirectorEmail: "nate@glaciersurfsoccer.com",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Columbia Falls Junior High School",
    streetAddress: "1805 Talbot Road",
    city: "Columbia Falls",
    state: "MT",
    zipCode: "59912",
    venueWebsiteUrl: "https://www.cfjuniorhigh.org/about-us/contact-us",
  },
  {
    tournamentName: "Rumble in the Rockies",
    sport: "soccer",
    startDate: "2026-04-24",
    endDate: "2026-04-26",
    officialWebsiteUrl: "https://www.glaciersurfsoccer.com/my-tournament",
    teamFee: "U8 $525; U9-U10 $695; U11-U12 $795; U13-U19 $895",
    ageGroupsOffered: "U8-U19",
    tournamentDirectorContact: "Nate Evans",
    tournamentDirectorEmail: "nate@glaciersurfsoccer.com",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Glacier High School",
    streetAddress: "375 Wolfpack Way",
    city: "Kalispell",
    state: "MT",
    zipCode: "59901",
    venueWebsiteUrl: "https://glacier.sd5.k12.mt.us/",
  },
  {
    tournamentName: "Montana Rush Kick It 3v3 Soccer Tournament",
    sport: "soccer",
    startDate: "2026-08-08",
    endDate: "2026-08-08",
    officialWebsiteUrl: "https://www.kickitsoccer.com/3v3-tournaments/montana-august-2026/",
    teamFee: "Early Bird $269; Standard $289; Late $309",
    ageGroupsOffered: "Youth U6-U19; Mens; Womens; COED",
    tournamentDirectorContact: "Kick It Soccer",
    tournamentDirectorEmail: "contact@kickitsoccer.com",
    refereeContact: null,
    refereeContactEmail: null,
    venueName: "Siebel Soccer Fields/Great Falls Rush Soccer",
    streetAddress: "5278 10th Ave N #5200",
    city: "Great Falls",
    state: "MT",
    zipCode: "59405",
    venueWebsiteUrl: null,
  },
];

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clean(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toUpperCase() === "NA") return null;
  return trimmed;
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function mergeValue(existing, incoming) {
  if (incoming == null || incoming === "") return existing ?? null;
  return incoming;
}

function pickFirstVenue(venues) {
  return venues.find((venue) => venue.city && venue.state) ?? venues[0] ?? null;
}

function buildTournamentGroups() {
  const grouped = new Map();
  for (const row of rows) {
    const cleaned = {
      tournamentName: clean(row.tournamentName),
      sport: clean(row.sport),
      startDate: clean(row.startDate),
      endDate: clean(row.endDate),
      officialWebsiteUrl: clean(row.officialWebsiteUrl),
      teamFee: clean(row.teamFee),
      ageGroupsOffered: clean(row.ageGroupsOffered),
      tournamentDirectorContact: clean(row.tournamentDirectorContact),
      tournamentDirectorEmail: clean(row.tournamentDirectorEmail),
      refereeContact: clean(row.refereeContact),
      refereeContactEmail: clean(row.refereeContactEmail),
      venueName: clean(row.venueName),
      streetAddress: clean(row.streetAddress),
      city: clean(row.city),
      state: clean(row.state)?.toUpperCase() ?? null,
      zipCode: clean(row.zipCode),
      venueWebsiteUrl: clean(row.venueWebsiteUrl),
    };
    const key = [
      cleaned.officialWebsiteUrl ?? "",
      cleaned.tournamentName ?? "",
      cleaned.startDate ?? "",
      cleaned.endDate ?? "",
    ].join("|");
    if (!grouped.has(key)) {
      grouped.set(key, {
        tournamentName: cleaned.tournamentName,
        sport: cleaned.sport,
        startDate: cleaned.startDate,
        endDate: cleaned.endDate,
        officialWebsiteUrl: cleaned.officialWebsiteUrl,
        teamFee: cleaned.teamFee,
        ageGroupsOffered: cleaned.ageGroupsOffered,
        tournamentDirectorContact: cleaned.tournamentDirectorContact,
        tournamentDirectorEmail: cleaned.tournamentDirectorEmail,
        refereeContact: cleaned.refereeContact,
        refereeContactEmail: cleaned.refereeContactEmail,
        city: cleaned.city,
        state: cleaned.state,
        zipCode: cleaned.zipCode,
        venues: [],
      });
    }
    if (cleaned.venueName || cleaned.streetAddress || cleaned.city || cleaned.state) {
      grouped.get(key).venues.push({
        name: cleaned.venueName,
        address1: cleaned.streetAddress,
        city: cleaned.city,
        state: cleaned.state,
        zip: cleaned.zipCode,
        venueUrl: cleaned.venueWebsiteUrl,
      });
    }
  }
  return [...grouped.values()];
}

async function uniqueSlug(baseSlug) {
  const root = slugify(baseSlug) || `tournament-${Date.now()}`;
  let slug = root;
  for (let index = 2; index < 100; index += 1) {
    const { data } = await supabase.from("tournaments").select("id").eq("slug", slug).maybeSingle();
    if (!data?.id) return slug;
    slug = `${root}-${index}`;
  }
  throw new Error(`Could not find unique slug for ${baseSlug}`);
}

async function findTournamentMatch(group) {
  if (group.officialWebsiteUrl) {
    const { data } = await supabase
      .from("tournaments")
      .select("id,slug,name,city,state,start_date,end_date,official_website_url,source_url")
      .or(`official_website_url.eq.${group.officialWebsiteUrl},source_url.eq.${group.officialWebsiteUrl}`)
      .limit(5);
    if (data?.length) return data[0];
  }

  const firstVenue = pickFirstVenue(group.venues);
  let query = supabase
    .from("tournaments")
    .select("id,slug,name,city,state,start_date,end_date,official_website_url,source_url")
    .ilike("name", `%${group.tournamentName}%`)
    .limit(20);

  if (firstVenue?.state) query = query.eq("state", firstVenue.state);
  if (firstVenue?.city) query = query.ilike("city", `%${firstVenue.city}%`);

  const { data } = await query;
  const candidates = (data ?? []).map((row) => {
    let score = 0;
    if (normalize(row.name) === normalize(group.tournamentName)) score += 10;
    if (normalize(row.city) === normalize(firstVenue?.city)) score += 3;
    if ((row.state ?? "").toUpperCase() === (firstVenue?.state ?? "").toUpperCase()) score += 2;
    if ((row.start_date ?? "") === (group.startDate ?? "")) score += 3;
    if ((row.end_date ?? "") === (group.endDate ?? "")) score += 2;
    return { row, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score >= 10 ? candidates[0].row : null;
}

async function upsertTournament(group, summary) {
  const firstVenue = pickFirstVenue(group.venues);
  const sourceDomain = group.officialWebsiteUrl ? new URL(group.officialWebsiteUrl).hostname : null;
  const basePayload = {
    name: group.tournamentName,
    sport: group.sport,
    start_date: group.startDate,
    end_date: group.endDate,
    official_website_url: group.officialWebsiteUrl,
    source_url: group.officialWebsiteUrl,
    source_domain: sourceDomain,
    team_fee: group.teamFee,
    age_group: group.ageGroupsOffered,
    tournament_director: group.tournamentDirectorContact,
    tournament_director_email: group.tournamentDirectorEmail,
    referee_contact: group.refereeContact,
    referee_contact_email: group.refereeContactEmail,
    city: firstVenue?.city ?? group.city ?? null,
    state: firstVenue?.state ?? group.state ?? null,
    zip: firstVenue?.zip ?? group.zipCode ?? null,
    venue: firstVenue?.name ?? null,
    address: firstVenue?.address1 ?? null,
    sub_type: "website",
    source: "manual_scrape",
    status: "published",
    is_canonical: true,
    updated_at: new Date().toISOString(),
  };

  const existing = await findTournamentMatch(group);
  if (existing?.id) {
    const updatePayload = {};
    for (const [key, value] of Object.entries(basePayload)) {
      if (value != null) updatePayload[key] = value;
    }
    const { error } = await supabase.from("tournaments").update(updatePayload).eq("id", existing.id);
    if (error) throw error;
    summary.tournamentsUpdated += 1;
    return { id: existing.id, slug: existing.slug ?? null, created: false };
  }

  const slug = await uniqueSlug(
    `${group.tournamentName}-${firstVenue?.city ?? ""}-${firstVenue?.state ?? ""}`.replace(/-+/g, "-")
  );
  const insertPayload = {
    ...basePayload,
    slug,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("tournaments").insert(insertPayload).select("id,slug").single();
  if (error || !data?.id) throw error ?? new Error(`Failed to insert tournament ${group.tournamentName}`);
  summary.tournamentsCreated += 1;
  return { id: data.id, slug: data.slug ?? null, created: true };
}

async function findVenueMatch(venue, sport) {
  if (!venue.name && !venue.address1) return null;
  let query = supabase.from("venues").select("id,name,address,address1,city,state,zip,venue_url,sport").limit(100);
  if (venue.city) query = query.eq("city", venue.city);
  if (venue.state) query = query.eq("state", venue.state);
  const { data } = await query;
  const exact = (data ?? []).find((row) => {
    const nameMatch = venue.name && normalize(row.name) === normalize(venue.name);
    const addressMatch =
      venue.address1 && (normalize(row.address1) === normalize(venue.address1) || normalize(row.address) === normalize(venue.address1));
    if (venue.address1) return !!nameMatch && !!addressMatch;
    return !!nameMatch && normalize(row.city) === normalize(venue.city) && normalize(row.state) === normalize(venue.state);
  });
  return exact ?? null;
}

async function upsertVenue(tournamentId, venue, sport, summary) {
  if (!venue.name && !venue.address1) {
    summary.venuesSkipped += 1;
    return null;
  }

  const existing = await findVenueMatch(venue, sport);
  let venueId;

  if (existing?.id) {
    const updatePayload = {
      name: mergeValue(existing.name, venue.name),
      address1: mergeValue(existing.address1, venue.address1),
      address: mergeValue(existing.address1 ?? existing.address, venue.address1),
      city: mergeValue(existing.city, venue.city),
      state: mergeValue(existing.state, venue.state),
      zip: mergeValue(existing.zip, venue.zip),
      venue_url: mergeValue(existing.venue_url, venue.venueUrl),
      sport: mergeValue(existing.sport, sport),
    };
    const changed = Object.entries(updatePayload).some(([key, value]) => value !== existing[key]);
    if (changed) {
      const { error } = await supabase.from("venues").update(updatePayload).eq("id", existing.id);
      if (error) throw error;
      summary.venuesUpdated += 1;
    } else {
      summary.venuesMatched += 1;
    }
    venueId = existing.id;
  } else {
    const insertPayload = {
      name: venue.name,
      address1: venue.address1,
      address: venue.address1,
      city: venue.city,
      state: venue.state,
      zip: venue.zip,
      venue_url: venue.venueUrl,
      sport,
    };
    const { data, error } = await supabase.from("venues").insert(insertPayload).select("id").single();
    if (error || !data?.id) throw error ?? new Error(`Failed to insert venue ${venue.name ?? venue.address1}`);
    summary.venuesCreated += 1;
    venueId = data.id;
  }

  const { error: linkError } = await supabase
    .from("tournament_venues")
    .upsert({ tournament_id: tournamentId, venue_id: venueId }, { onConflict: "tournament_id,venue_id" });
  if (linkError) throw linkError;
  summary.linksUpserted += 1;
  return venueId;
}

async function main() {
  const groups = buildTournamentGroups();
  const summary = {
    tournamentsCreated: 0,
    tournamentsUpdated: 0,
    venuesCreated: 0,
    venuesUpdated: 0,
    venuesMatched: 0,
    venuesSkipped: 0,
    linksUpserted: 0,
    failures: [],
  };

  for (const group of groups) {
    try {
      const tournament = await upsertTournament(group, summary);
      for (const venue of group.venues) {
        await upsertVenue(tournament.id, venue, group.sport, summary);
      }
      console.log(
        `[ok] ${group.tournamentName} -> ${tournament.created ? "created" : "updated"} (${group.venues.length} venue row(s))`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error);
      summary.failures.push({ tournament: group.tournamentName, message });
      console.error(`[fail] ${group.tournamentName}: ${message}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
