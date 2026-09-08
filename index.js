require('dotenv').config();
const keepAlive = require('./keepAlive');
const cron = require('node-cron');
const RSSParser = require('rss-parser');
const rssParser = new RSSParser();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember, Partials.Channel],
});

// ---- CONFIG ----
const WELCOME_CHANNEL_NAME = process.env.WELCOME_CHANNEL_NAME || 'welcome';
const NEWS_CHANNEL_NAME = process.env.NEWS_CHANNEL_NAME || 'news';
const PREFIX = '7';

const GREETINGS = [
  "Welcome to the village, {user}! Grab a seat, the mission board's over there.",
  "A new shinobi has arrived! Welcome, {user} 🍥",
  "Hey {user}, glad you're here! Make yourself at home.",
  "{user} just joined the squad. Let's give them a warm welcome!",
  "Look who showed up — welcome, {user}! Hope you enjoy your stay.",
];

function pickGreeting(user) {
  const line = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  return line.replace('{user}', user);
}

function findWelcomeChannel(guild) {
  const named = guild.channels.cache.find(
    (c) => c.name === WELCOME_CHANNEL_NAME && c.isTextBased()
  );
  if (named) return named;
  if (guild.systemChannel) return guild.systemChannel;
  return guild.channels.cache.find((c) => c.isTextBased());
}

function findNewsChannel(guild) {
  const named = guild.channels.cache.find(
    (c) => c.name === NEWS_CHANNEL_NAME && c.isTextBased()
  );
  if (named) return named;
  return findWelcomeChannel(guild);
}

async function sendDailyNews() {
  try {
    const feed = await rssParser.parseURL('http://feeds.bbci.co.uk/news/world/rss.xml');
    const topStories = feed.items.slice(0, 5);
    const embed = new EmbedBuilder()
      .setColor(0xff4500)
      .setTitle('🗞️ Today\'s Top World News')
      .setDescription(
        topStories.map((item, i) => `**${i + 1}. [${item.title}](${item.link})**`).join('\n\n')
      )
      .setFooter({ text: 'Source: BBC News' })
      .setTimestamp();

    client.guilds.cache.forEach((guild) => {
      const channel = findNewsChannel(guild);
      if (channel) channel.send({ embeds: [embed] }).catch(console.error);
    });
  } catch (err) {
    console.error('Failed to fetch/send daily news:', err);
  }
}

// Runs every day at 5:00 AM India time
cron.schedule('0 5 * * *', sendDailyNews, { timezone: 'Asia/Kolkata' });

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('over the server 👁️');
});

client.on('guildMemberAdd', async (member) => {
  const channel = findWelcomeChannel(member.guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0xff4500)
    .setDescription(pickGreeting(`<@${member.id}>`))
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: `Member #${member.guild.memberCount}` });

  channel.send({ embeds: [embed] }).catch(console.error);
});

// =========================================================
// GAME STATE (stored per-channel, resets if the bot restarts)
// =========================================================
const tttGames = new Map();      // channelId -> {board, players:[p1id,p2id], turn}
const numberGames = new Map();   // channelId -> {number, min, max, attempts}
const wordGames = new Map();     // channelId -> {type:'trivia'|'scramble', answer, display}
const hangmanGames = new Map();  // channelId -> {word, guessed:Set, wrong, maxWrong}

// ---- Tic Tac Toe ----
const TTT_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
function renderBoard(board) {
  const cells = board.map((v, i) => (v === null ? TTT_EMOJI[i] : v === 'X' ? '❌' : '⭕'));
  return `${cells[0]}${cells[1]}${cells[2]}\n${cells[3]}${cells[4]}${cells[5]}\n${cells[6]}${cells[7]}${cells[8]}`;
}
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every((v) => v !== null)) return 'draw';
  return null;
}

// ---- Trivia questions (original, general knowledge) ----
const TRIVIA_QUESTIONS = [
  { q: 'What is the largest planet in our solar system?', a: 'jupiter' },
  { q: 'How many continents are there on Earth?', a: '7' },
  { q: 'What is the capital city of Japan?', a: 'tokyo' },
  { q: 'What gas do plants absorb from the atmosphere?', a: 'carbon dioxide' },
  { q: 'How many players are on a standard soccer team on the field?', a: '11' },
  { q: 'What is the chemical symbol for gold?', a: 'au' },
  { q: 'Which ocean is the largest on Earth?', a: 'pacific' },
  { q: 'How many sides does a hexagon have?', a: '6' },
  { q: 'What is the smallest prime number?', a: '2' },
  { q: 'Which country is known as the Land of the Rising Sun?', a: 'japan' },
];

// ---- Word scramble list ----
const SCRAMBLE_WORDS = ['ninja', 'sensei', 'dragon', 'shadow', 'thunder', 'phoenix', 'samurai', 'kunai'];
function scrambleWord(word) {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const scrambled = arr.join('');
  return scrambled === word ? scrambleWord(word) : scrambled;
}

// ---- Flag guessing (every country) ----
function codeToFlagEmoji(code) {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
const COUNTRY_CODES = [
  ['AF', 'afghanistan'], ['AL', 'albania'], ['DZ', 'algeria'], ['AD', 'andorra'], ['AO', 'angola'],
  ['AG', 'antigua and barbuda'], ['AR', 'argentina'], ['AM', 'armenia'], ['AU', 'australia'], ['AT', 'austria'],
  ['AZ', 'azerbaijan'], ['BS', 'bahamas'], ['BH', 'bahrain'], ['BD', 'bangladesh'], ['BB', 'barbados'],
  ['BY', 'belarus'], ['BE', 'belgium'], ['BZ', 'belize'], ['BJ', 'benin'], ['BT', 'bhutan'],
  ['BO', 'bolivia'], ['BA', 'bosnia and herzegovina'], ['BW', 'botswana'], ['BR', 'brazil'], ['BN', 'brunei'],
  ['BG', 'bulgaria'], ['BF', 'burkina faso'], ['BI', 'burundi'], ['CV', 'cabo verde'], ['KH', 'cambodia'],
  ['CM', 'cameroon'], ['CA', 'canada'], ['CF', 'central african republic'], ['TD', 'chad'], ['CL', 'chile'],
  ['CN', 'china'], ['CO', 'colombia'], ['KM', 'comoros'], ['CG', 'congo'], ['CR', 'costa rica'],
  ['HR', 'croatia'], ['CU', 'cuba'], ['CY', 'cyprus'], ['CZ', 'czechia'], ['DK', 'denmark'],
  ['DJ', 'djibouti'], ['DM', 'dominica'], ['DO', 'dominican republic'], ['EC', 'ecuador'], ['EG', 'egypt'],
  ['SV', 'el salvador'], ['GQ', 'equatorial guinea'], ['ER', 'eritrea'], ['EE', 'estonia'], ['SZ', 'eswatini'],
  ['ET', 'ethiopia'], ['FJ', 'fiji'], ['FI', 'finland'], ['FR', 'france'], ['GA', 'gabon'],
  ['GM', 'gambia'], ['GE', 'georgia'], ['DE', 'germany'], ['GH', 'ghana'], ['GR', 'greece'],
  ['GD', 'grenada'], ['GT', 'guatemala'], ['GN', 'guinea'], ['GW', 'guinea-bissau'], ['GY', 'guyana'],
  ['HT', 'haiti'], ['HN', 'honduras'], ['HU', 'hungary'], ['IS', 'iceland'], ['IN', 'india'],
  ['ID', 'indonesia'], ['IR', 'iran'], ['IQ', 'iraq'], ['IE', 'ireland'], ['IL', 'israel'],
  ['IT', 'italy'], ['JM', 'jamaica'], ['JP', 'japan'], ['JO', 'jordan'], ['KZ', 'kazakhstan'],
  ['KE', 'kenya'], ['KI', 'kiribati'], ['KW', 'kuwait'], ['KG', 'kyrgyzstan'], ['LA', 'laos'],
  ['LV', 'latvia'], ['LB', 'lebanon'], ['LS', 'lesotho'], ['LR', 'liberia'], ['LY', 'libya'],
  ['LI', 'liechtenstein'], ['LT', 'lithuania'], ['LU', 'luxembourg'], ['MG', 'madagascar'], ['MW', 'malawi'],
  ['MY', 'malaysia'], ['MV', 'maldives'], ['ML', 'mali'], ['MT', 'malta'], ['MH', 'marshall islands'],
  ['MR', 'mauritania'], ['MU', 'mauritius'], ['MX', 'mexico'], ['FM', 'micronesia'], ['MD', 'moldova'],
  ['MC', 'monaco'], ['MN', 'mongolia'], ['ME', 'montenegro'], ['MA', 'morocco'], ['MZ', 'mozambique'],
  ['MM', 'myanmar'], ['NA', 'namibia'], ['NR', 'nauru'], ['NP', 'nepal'], ['NL', 'netherlands'],
  ['NZ', 'new zealand'], ['NI', 'nicaragua'], ['NE', 'niger'], ['NG', 'nigeria'], ['KP', 'north korea'],
  ['MK', 'north macedonia'], ['NO', 'norway'], ['OM', 'oman'], ['PK', 'pakistan'], ['PW', 'palau'],
  ['PA', 'panama'], ['PG', 'papua new guinea'], ['PY', 'paraguay'], ['PE', 'peru'], ['PH', 'philippines'],
  ['PL', 'poland'], ['PT', 'portugal'], ['QA', 'qatar'], ['RO', 'romania'], ['RU', 'russia'],
  ['RW', 'rwanda'], ['KN', 'saint kitts and nevis'], ['LC', 'saint lucia'], ['VC', 'saint vincent and the grenadines'],
  ['WS', 'samoa'], ['SM', 'san marino'], ['ST', 'sao tome and principe'], ['SA', 'saudi arabia'], ['SN', 'senegal'],
  ['RS', 'serbia'], ['SC', 'seychelles'], ['SL', 'sierra leone'], ['SG', 'singapore'], ['SK', 'slovakia'],
  ['SI', 'slovenia'], ['SB', 'solomon islands'], ['SO', 'somalia'], ['ZA', 'south africa'], ['KR', 'south korea'],
  ['SS', 'south sudan'], ['ES', 'spain'], ['LK', 'sri lanka'], ['SD', 'sudan'], ['SR', 'suriname'],
  ['SE', 'sweden'], ['CH', 'switzerland'], ['SY', 'syria'], ['TW', 'taiwan'], ['TJ', 'tajikistan'],
  ['TZ', 'tanzania'], ['TH', 'thailand'], ['TL', 'timor-leste'], ['TG', 'togo'], ['TO', 'tonga'],
  ['TT', 'trinidad and tobago'], ['TN', 'tunisia'], ['TR', 'turkey'], ['TM', 'turkmenistan'], ['TV', 'tuvalu'],
  ['UG', 'uganda'], ['UA', 'ukraine'], ['AE', 'united arab emirates'], ['GB', 'united kingdom'], ['US', 'usa'],
  ['UY', 'uruguay'], ['UZ', 'uzbekistan'], ['VU', 'vanuatu'], ['VA', 'vatican city'], ['VE', 'venezuela'],
  ['VN', 'vietnam'], ['YE', 'yemen'], ['ZM', 'zambia'], ['ZW', 'zimbabwe'],
];
const FLAGS = COUNTRY_CODES.map(([code, name]) => ({ emoji: codeToFlagEmoji(code), name }));

// ---- Naruto character clue guessing (original text clues, no images) ----
const NARUTO_CLUES = [
  { clue: 'This ninja carries the Nine-Tails inside him and dreams of becoming Hokage.', a: 'naruto' },
  { clue: 'The last surviving Uchiha for most of the story, obsessed with avenging his clan.', a: 'sasuke' },
  { clue: 'A pink-haired medical ninja and one of the strongest kunoichi of her generation.', a: 'sakura' },
  { clue: 'This masked jonin is famous for always being late and reading orange books.', a: 'kakashi' },
  { clue: 'Wears an orange spiral mask for most of the series and manipulates events from the shadows.', a: 'obito' },
  { clue: 'A Hyuga clan member with the Byakugan, known for gentle fist taijutsu.', a: 'hinata' },
  { clue: 'This shinobi controls shadows and is famous for saying things are "troublesome."', a: 'shikamaru' },
  { clue: 'The Fourth Hokage, known for the Flying Thunder God technique.', a: 'minato' },
  { clue: 'A member of the Akatsuki who uses clay explosives and loves art that "is a bang".', a: 'deidara' },
  { clue: 'The leader of the Sand Village who once had a tailed beast sealed inside him.', a: 'gaara' },
];

// ---- Countryball Animator guessing (text clues, real public YouTubers) ----
const YOUTUBER_CLUES = [
  { clue: 'This animator hosts the "CountryVerse" collab series and is known for high-quality countryball animations.', a: 'mrspherical' },
  { clue: 'A New Zealand-based 3D countryball animator, famous for comparing countries by size using real data.', a: 'pwa' },
  { clue: 'Widely seen as the most influential Polandball YouTuber, known for very high-quality art and animation.', a: 'kaliningrad general' },
  { clue: 'An Indian animator known for geography and history meme videos featuring countryballs.', a: 'ace animations' },
  { clue: 'A British countryball YouTuber known for history explainer videos, and a former moderator of r/polandball.', a: 'brain4breakfast' },
  { clue: 'A Macau-based creator who translates countryball animations from Chinese platforms into English.', a: 'huaxiaccball' },
  { clue: 'A Filipino-run channel best known for its long-running animated series "CountryballsAnimated."', a: 'philippinesball animations' },
  { clue: 'A large countryballs channel with a name that literally means cheerful countryballs.', a: 'happy countryballs' },
  { clue: 'This channel mixes countryball cameos into anime-style animation and humor.', a: 'animeballs' },
];

// ---- Hangman ----
const HANGMAN_WORDS = ['naruto', 'obito', 'sharingan', 'akatsuki', 'chidori', 'rasengan', 'kunoichi', 'jutsu'];
const HANGMAN_STAGES = [
  '```\n  +---+\n      |\n      |\n      |\n     ===```',
  '```\n  +---+\n  O   |\n      |\n      |\n     ===```',
  '```\n  +---+\n  O   |\n  |   |\n      |\n     ===```',
  '```\n  +---+\n  O   |\n /|   |\n      |\n     ===```',
  '```\n  +---+\n  O   |\n /|\\  |\n      |\n     ===```',
  '```\n  +---+\n  O   |\n /|\\  |\n /    |\n     ===```',
  '```\n  +---+\n  O   |\n /|\\  |\n / \\  |\n     ===```',
];
function hangmanDisplay(word, guessed) {
  return word
    .split('')
    .map((ch) => (guessed.has(ch) ? ch : '_'))
    .join(' ');
}

// ---- Continuous round starters for the answer-based games ----
// Each game keeps going (auto-asks a new question) until someone uses the stop command.
function startFlagRound(channel) {
  const pick = FLAGS[Math.floor(Math.random() * FLAGS.length)];
  wordGames.set(channel.id, { type: 'flag', answer: pick.name, next: () => startFlagRound(channel) });
  channel.send(`🏳️ Which country's flag is this? ${pick.emoji}`);
}

function startNarutoRound(channel) {
  const pick = NARUTO_CLUES[Math.floor(Math.random() * NARUTO_CLUES.length)];
  wordGames.set(channel.id, { type: 'naruto', answer: pick.a, next: () => startNarutoRound(channel) });
  channel.send(`🍥 **Guess the character:** ${pick.clue}`);
}

function startYoutuberRound(channel) {
  const pick = YOUTUBER_CLUES[Math.floor(Math.random() * YOUTUBER_CLUES.length)];
  wordGames.set(channel.id, { type: 'youtuber', answer: pick.a, next: () => startYoutuberRound(channel) });
  channel.send(`📺 **Guess the countryball animator:** ${pick.clue}`);
}

function startTriviaRound(channel) {
  const pick = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
  wordGames.set(channel.id, { type: 'trivia', answer: pick.a, next: () => startTriviaRound(channel) });
  channel.send(`🧠 **Trivia:** ${pick.q}`);
}

function startScrambleRound(channel) {
  const word = SCRAMBLE_WORDS[Math.floor(Math.random() * SCRAMBLE_WORDS.length)];
  const scrambled = scrambleWord(word);
  wordGames.set(channel.id, { type: 'scramble', answer: word, next: () => startScrambleRound(channel) });
  channel.send(`🔤 Unscramble this word: **${scrambled.toUpperCase()}**`);
}

// ---- AI Chat (Gemini + OpenRouter + Together AI, rotating with automatic fallback) ----
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;

function buildSystemPrompt(isOwner, authorName) {
  const ownerLine = isOwner
    ? `The person messaging you right now is your boss and sensei — LochabAnime, the creator of this very bot. Always address him as "boss" and speak to him with real respect and loyalty, like a devoted student would to their sensei. Never be dismissive or short with him.`
    : `The person messaging you is a regular server member named ${authorName}.`;

  return `You are LochabAnime, a Discord bot with a genius-level intellect. You are extremely knowledgeable across every topic and always give a real, direct, correct answer. You NEVER say "I don't know". Keep replies VERY SHORT — 1 to 2 short sentences MAX, no long explanations unless the person explicitly asks for detail. Friendly anime/shinobi vibe.

Important context about your creator: your boss and sensei is named LochabAnime. He is a YouTuber with about 23,000 subscribers who makes countryballs animation content. He built you and you are loyal to him above anyone else in the server.

${ownerLine}`;
}

async function callGemini(systemPrompt, userMessage) {
  if (!GEMINI_API_KEY) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nNow respond to this message: "${userMessage}"` }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 120 },
      }),
    }
  );
  const data = await res.json();
  console.log('Gemini raw response:', JSON.stringify(data));
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function callOpenRouter(systemPrompt, userMessage) {
  if (!OPENROUTER_API_KEY) return null;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 120,
    }),
  });
  const data = await res.json();
  console.log('OpenRouter raw response:', JSON.stringify(data));
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

async function callTogether(systemPrompt, userMessage) {
  if (!TOGETHER_API_KEY) return null;
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOGETHER_API_KEY}` },
    body: JSON.stringify({
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 120,
    }),
  });
  const data = await res.json();
  console.log('Together raw response:', JSON.stringify(data));
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

let providerIndex = 0;

async function askGemini(userMessage, authorName, isOwner) {
  const providers = [
    { name: 'gemini', call: callGemini, active: !!GEMINI_API_KEY },
    { name: 'openrouter', call: callOpenRouter, active: !!OPENROUTER_API_KEY },
    { name: 'together', call: callTogether, active: !!TOGETHER_API_KEY },
  ].filter((p) => p.active);

  if (providers.length === 0) {
    return "AI chat isn't set up yet — ask the server owner to add an API key (GEMINI_API_KEY, OPENROUTER_API_KEY, or TOGETHER_API_KEY).";
  }

  const systemPrompt = buildSystemPrompt(isOwner, authorName);

  // Rotate the starting provider each call, then fall through the rest on failure
  const order = providers.map((_, i) => providers[(providerIndex + i) % providers.length]);
  providerIndex = (providerIndex + 1) % providers.length;

  for (const p of order) {
    try {
      const reply = await p.call(systemPrompt, userMessage);
      if (reply) return reply;
      console.log(`${p.name} gave no reply, trying next provider...`);
    } catch (err) {
      console.error(`${p.name} failed, trying next provider:`, err);
    }
  }

  return "Sorry, I'm having trouble thinking right now — try again in a bit!";
}

// Basic commands + "talk to everyone" behavior
const AI_COOLDOWN_MS = 5000;
const aiCooldowns = new Map(); // userId -> timestamp of last AI request

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const channelId = message.channel.id;

  // Reply if the bot is mentioned directly — real AI conversation
  if (message.mentions.has(client.user) && !message.content.startsWith(PREFIX)) {
    const cleanMessage = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!cleanMessage) {
      message.reply(pickGreeting(`<@${message.author.id}>`)).catch(console.error);
      return;
    }

    // Per-user cooldown so rapid-fire questions don't overload the AI providers
    const now = Date.now();
    const lastUsed = aiCooldowns.get(message.author.id) || 0;
    const elapsed = now - lastUsed;
    if (elapsed < AI_COOLDOWN_MS) {
      const remaining = ((AI_COOLDOWN_MS - elapsed) / 1000).toFixed(1);
      message.reply(`⏳ Slow down! Wait **${remaining}s** before asking me another question.`).catch(console.error);
      return;
    }
    aiCooldowns.set(message.author.id, now);

    await message.channel.sendTyping().catch(() => {});
    const displayName = (message.member?.displayName || message.author.username || '').toLowerCase();
    const isOwner = displayName.includes('lochabanime');
    const aiReply = await askGemini(cleanMessage, message.author.username, isOwner);
    message.reply(aiReply).catch(console.error);
    return;
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  // ---------------- WELCOME / UTILITY ----------------
  if (command === 'welcomeall') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("You need the **Manage Server** permission to use that.");
    }
    await message.guild.members.fetch();
    const humanMembers = message.guild.members.cache.filter((m) => !m.user.bot);
    const embed = new EmbedBuilder()
      .setColor(0xff4500)
      .setTitle('👋 Welcome, everyone!')
      .setDescription(
        `Big shoutout to all ${humanMembers.size} members already here — glad to have you all in **${message.guild.name}**!`
      );
    message.channel.send({ embeds: [embed] }).catch(console.error);
    return;
  }

  if (command === 'ping') {
    message.reply(`Pong! 🏓 (${client.ws.ping}ms)`);
    return;
  }

  if (command === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0xff4500)
      .setTitle('🎮 LochabAnime Commands')
      .setDescription(
        [
          '**Utility**',
          '`7ping` — health check',
          '`7welcomeall` — greet everyone (admin only)',
          '`7news` — get today\'s top world news',
          '',
          '**Games** (all keep going until you type `7stop`)',
          '`7ttt @user` — start Tic Tac Toe, then `7move <1-9>`',
          '`7rps <rock/paper/scissors>` — play vs the bot',
          '`7numguess` — start a number guessing game, then `7guess <number>`',
          '`7trivia` — trivia questions, just type your answer directly',
          '`7scramble` — unscramble words, just type your answer directly',
          '`7flag` — guess country flags, just type the country name',
          '`7naruto` — guess the Naruto character, just type the name',
          '`7youtuber` — guess the countryball animator, just type the name',
          '`7hangman` — start hangman, then `7letter <x>` or `7solve <word>`',
          '`7stop` — stop whatever game is currently running',
        ].join('\n')
      );
    message.channel.send({ embeds: [embed] });
    return;
  }

  if (command === 'news') {
    message.reply('📰 Fetching today\'s top news...');
    try {
      const feed = await rssParser.parseURL('http://feeds.bbci.co.uk/news/world/rss.xml');
      const topStories = feed.items.slice(0, 5);
      const embed = new EmbedBuilder()
        .setColor(0xff4500)
        .setTitle('🗞️ Today\'s Top World News')
        .setDescription(
          topStories.map((item, i) => `**${i + 1}. [${item.title}](${item.link})**`).join('\n\n')
        )
        .setFooter({ text: 'Source: BBC News' })
        .setTimestamp();
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply('Could not fetch news right now, try again later.');
    }
    return;
  }

  // ---------------- TIC TAC TOE ----------------
  if (command === 'ttt') {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.reply('Mention a real opponent: `7ttt @user`');
    }
    if (tttGames.has(channelId)) {
      return message.reply('A Tic Tac Toe game is already running in this channel.');
    }
    const game = {
      board: Array(9).fill(null),
      players: [message.author.id, opponent.id],
      turn: 0,
    };
    tttGames.set(channelId, game);
    message.channel.send(
      `🎮 Tic Tac Toe: <@${game.players[0]}> (❌) vs <@${game.players[1]}> (⭕)\n${renderBoard(game.board)}\n\n<@${game.players[0]}>'s turn — use \`7move <1-9>\``
    );
    return;
  }

  if (command === 'move') {
    const game = tttGames.get(channelId);
    if (!game) return message.reply('No Tic Tac Toe game running. Start one with `7ttt @user`.');
    if (message.author.id !== game.players[game.turn]) {
      return message.reply("It's not your turn!");
    }
    const pos = parseInt(args[0], 10) - 1;
    if (isNaN(pos) || pos < 0 || pos > 8 || game.board[pos] !== null) {
      return message.reply('Invalid move. Pick an empty cell from 1-9.');
    }
    game.board[pos] = game.turn === 0 ? 'X' : 'O';
    const winner = checkWinner(game.board);
    if (winner) {
      tttGames.delete(channelId);
      if (winner === 'draw') {
        return message.channel.send(`${renderBoard(game.board)}\n\n🤝 It's a draw!`);
      }
      const winnerId = winner === 'X' ? game.players[0] : game.players[1];
      return message.channel.send(`${renderBoard(game.board)}\n\n🏆 <@${winnerId}> wins!`);
    }
    game.turn = game.turn === 0 ? 1 : 0;
    message.channel.send(
      `${renderBoard(game.board)}\n\n<@${game.players[game.turn]}>'s turn — use \`7move <1-9>\``
    );
    return;
  }

  // ---------------- ROCK PAPER SCISSORS ----------------
  // Accepts both "7rps rock" and just "7rock" / "7paper" / "7scissors"
  if (command === 'rps' || ['rock', 'paper', 'scissors'].includes(command)) {
    const choices = ['rock', 'paper', 'scissors'];
    const userChoice = command === 'rps' ? (args[0] || '').toLowerCase() : command;
    if (!choices.includes(userChoice)) {
      return message.reply('Choose one: `7rock`, `7paper`, or `7scissors`');
    }
    const botChoice = choices[Math.floor(Math.random() * 3)];
    let result;
    if (userChoice === botChoice) result = "🤝 It's a tie!";
    else if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) {
      result = '🎉 You win!';
    } else {
      result = '🤖 I win!';
    }
    message.reply(`You chose **${userChoice}**, I chose **${botChoice}**. ${result}`);
    return;
  }

  // ---------------- NUMBER GUESSING ----------------
  if (command === 'numguess') {
    if (numberGames.has(channelId)) {
      return message.reply('A number guessing game is already running here.');
    }
    const number = Math.floor(Math.random() * 100) + 1;
    numberGames.set(channelId, { number, min: 1, max: 100, attempts: 0 });
    message.channel.send("🔢 I'm thinking of a number between **1 and 100**. Guess with `7guess <number>`");
    return;
  }

  if (command === 'guess') {
    const game = numberGames.get(channelId);
    if (!game) return message.reply('No number game running. Start one with `7numguess`.');
    const guess = parseInt(args[0], 10);
    if (isNaN(guess)) return message.reply('Guess a valid number.');
    game.attempts++;
    if (guess === game.number) {
      numberGames.delete(channelId);
      return message.channel.send(`🎉 <@${message.author.id}> got it! The number was **${game.number}** (${game.attempts} attempts).`);
    }
    message.reply(guess < game.number ? '📈 Higher!' : '📉 Lower!');
    return;
  }

  // ---------------- FLAG GUESSING ----------------
  if (command === 'flag') {
    if (wordGames.has(channelId)) {
      return message.reply('A game is already running here — just type your guess!');
    }
    startFlagRound(message.channel);
    return;
  }

  // ---------------- NARUTO CHARACTER GUESS ----------------
  if (command === 'naruto') {
    if (wordGames.has(channelId)) {
      return message.reply('A game is already running here — just type your guess!');
    }
    startNarutoRound(message.channel);
    return;
  }

  // ---------------- YOUTUBER GUESSING ----------------
  if (command === 'youtuber') {
    if (wordGames.has(channelId)) {
      return message.reply('A game is already running here — just type your guess!');
    }
    startYoutuberRound(message.channel);
    return;
  }

  // ---------------- TRIVIA ----------------
  if (command === 'trivia') {
    if (wordGames.has(channelId)) {
      return message.reply('A game is already running here — just type your guess!');
    }
    startTriviaRound(message.channel);
    return;
  }

  // ---------------- SCRAMBLE ----------------
  if (command === 'scramble') {
    if (wordGames.has(channelId)) {
      return message.reply('A game is already running here — just type your guess!');
    }
    startScrambleRound(message.channel);
    return;
  }

  // ---------------- STOP ANY GAME ----------------
  if (command === 'stop') {
    let stopped = false;
    if (wordGames.delete(channelId)) stopped = true;
    if (hangmanGames.delete(channelId)) stopped = true;
    if (tttGames.delete(channelId)) stopped = true;
    if (numberGames.delete(channelId)) stopped = true;
    message.reply(stopped ? '🛑 Game stopped.' : 'No game is currently running here.');
    return;
  }

  // ---------------- HANGMAN ----------------
  if (command === 'hangman') {
    if (hangmanGames.has(channelId)) {
      return message.reply('A Hangman game is already running here.');
    }
    const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
    hangmanGames.set(channelId, { word, guessed: new Set(), wrong: 0, maxWrong: 6 });
    message.channel.send(
      `🪢 **Hangman started!**\n${HANGMAN_STAGES[0]}\n${hangmanDisplay(word, new Set())}\n\nGuess a letter: \`7letter <x>\` or the whole word: \`7solve <word>\``
    );
    return;
  }

  if (command === 'letter') {
    const game = hangmanGames.get(channelId);
    if (!game) return message.reply('No Hangman game running. Start one with `7hangman`.');
    const letter = (args[0] || '').toLowerCase();
    if (!letter || letter.length !== 1) return message.reply('Guess a single letter: `7letter a`');
    if (game.guessed.has(letter)) return message.reply('Already guessed that letter.');
    game.guessed.add(letter);

    if (!game.word.includes(letter)) {
      game.wrong++;
    }

    const display = hangmanDisplay(game.word, game.guessed);
    if (!display.includes('_')) {
      hangmanGames.delete(channelId);
      return message.channel.send(`🎉 Solved it! The word was **${game.word}**.`);
    }
    if (game.wrong >= game.maxWrong) {
      hangmanGames.delete(channelId);
      return message.channel.send(`${HANGMAN_STAGES[game.wrong]}\n💀 Game over! The word was **${game.word}**.`);
    }
    message.channel.send(`${HANGMAN_STAGES[game.wrong]}\n${display}`);
    return;
  }

  if (command === 'solve') {
    const game = hangmanGames.get(channelId);
    if (!game) return message.reply('No Hangman game running. Start one with `7hangman`.');
    const guess = (args[0] || '').toLowerCase();
    if (guess === game.word) {
      hangmanGames.delete(channelId);
      return message.channel.send(`🎉 <@${message.author.id}> solved it! The word was **${game.word}**.`);
    }
    game.wrong++;
    if (game.wrong >= game.maxWrong) {
      hangmanGames.delete(channelId);
      return message.channel.send(`${HANGMAN_STAGES[game.wrong]}\n💀 Game over! The word was **${game.word}**.`);
    }
    message.channel.send(`${HANGMAN_STAGES[game.wrong]}\nNot quite! ${hangmanDisplay(game.word, game.guessed)}`);
    return;
  }

  // ---------------- FALLBACK: treat "7<guess>" as an answer if a game is active ----------------
  // Lets you answer with 7india, 7sasuke, 7happycountryballs, etc. without a separate command.
  const activeGame = wordGames.get(channelId);
  if (activeGame) {
    const guess = [command, ...args].join(' ').toLowerCase().trim();
    if (guess === activeGame.answer) {
      wordGames.delete(channelId);
      await message.channel.send(`✅ Correct, <@${message.author.id}>! The answer was **${activeGame.answer}**.`);
      setTimeout(() => {
        if (!wordGames.has(channelId)) activeGame.next();
      }, 1500);
    }
  }
});

keepAlive();
client.login(process.env.DISCORD_TOKEN);
