require('dotenv').config();
const keepAlive = require('./keepAlive');
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

const WELCOME_CHANNEL_NAME = process.env.WELCOME_CHANNEL_NAME || 'welcome';
const PREFIX = '!';

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

const tttGames = new Map();
const numberGames = new Map();
const wordGames = new Map();
const hangmanGames = new Map();

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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const channelId = message.channel.id;

  if (message.mentions.has(client.user) && !message.content.startsWith(PREFIX)) {
    message.reply(pickGreeting(`<@${message.author.id}>`)).catch(console.error);
    return;
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

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
          '`!ping` — health check',
          '`!welcomeall` — greet everyone (admin only)',
          '',
          '**Games**',
          '`!ttt @user` — start Tic Tac Toe, then `!move <1-9>`',
          '`!rps <rock/paper/scissors>` — play vs the bot',
          '`!numguess` — start a number guessing game, then `!guess <number>`',
          '`!trivia` — start a trivia question, then `!answer <text>`',
          '`!scramble` — unscramble a word, then `!answer <word>`',
          '`!hangman` — start hangman, then `!letter <x>` or `!solve <word>`',
        ].join('\n')
      );
    message.channel.send({ embeds: [embed] });
    return;
  }

  if (command === 'ttt') {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.reply('Mention a real opponent: `!ttt @user`');
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
      `🎮 Tic Tac Toe: <@${game.players[0]}> (❌) vs <@${game.players[1]}> (⭕)\n${renderBoard(game.board)}\n\n<@${game.players[0]}>'s turn — use \`!move <1-9>\``
    );
    return;
  }

  if (command === 'move') {
    const game = tttGames.get(channelId);
    if (!game) return message.reply('No Tic Tac Toe game running. Start one with `!ttt @user`.');
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
      `${renderBoard(game.board)}\n\n<@${game.players[game.turn]}>'s turn — use \`!move <1-9>\``
    );
    return;
  }

  if (command === 'rps') {
    const choices = ['rock', 'paper', 'scissors'];
    const userChoice = (args[0] || '').toLowerCase();
    if (!choices.includes(userChoice)) {
      return message.reply('Choose one: `!rps rock`, `!rps paper`, or `!rps scissors`');
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

  if (command === 'numguess') {
    if (numberGames.has(channelId)) {
      return message.reply('A number guessing game is already running here.');
    }
    const number = Math.floor(Math.random() * 100) + 1;
    numberGames.set(channelId, { number, min: 1, max: 100, attempts: 0 });
    message.channel.send("🔢 I'm thinking of a number between **1 and 100**. Guess with `!guess <number>`");
    return;
  }

  if (command === 'guess') {
    const game = numberGames.get(channelId);
    if (!game) return message.reply('No number game running. Start one with `!numguess`.');
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

  if (command === 'trivia') {
    if (wordGames.has(channelId)) {
      return message.reply('A game is already running here — finish it first with `!answer`.');
    }
    const pick = TRIVIA_QUESTIONS[Math.floor(Math.random() * TRIVIA_QUESTIONS.length)];
    wordGames.set(channelId, { type: 'trivia', answer: pick.a, display: pick.q });
    message.channel.send(`🧠 **Trivia:** ${pick.q}\nAnswer with \`!answer <your answer>\``);
    return;
  }

  if (command === 'scramble') {
    if (wordGames.has(channelId)) {
      return message.reply('A game is already running here — finish it first with `!answer`.');
    }
    const word = SCRAMBLE_WORDS[Math.floor(Math.random() * SCRAMBLE_WORDS.length)];
    const scrambled = scrambleWord(word);
    wordGames.set(channelId, { type: 'scramble', answer: word, display: scrambled });
    message.channel.send(`🔤 Unscramble this word: **${scrambled.toUpperCase()}**\nAnswer with \`!answer <word>\``);
    return;
  }

  if (command === 'answer') {
    const game = wordGames.get(channelId);
    if (!game) return message.reply('No trivia/scramble game running. Start one with `!trivia` or `!scramble`.');
    const guess = args.join(' ').toLowerCase().trim();
    if (guess === game.answer) {
      wordGames.delete(channelId);
      return message.channel.send(`✅ Correct, <@${message.author.id}>! The answer was **${game.answer}**.`);
    }
    message.reply('❌ Not quite, try again!');
    return;
  }

  if (command === 'hangman') {
    if (hangmanGames.has(channelId)) {
      return message.reply('A Hangman game is already running here.');
    }
    const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
    hangmanGames.set(channelId, { word, guessed: new Set(), wrong: 0, maxWrong: 6 });
    message.channel.send(
      `🪢 **Hangman started!**\n${HANGMAN_STAGES[0]}\n${hangmanDisplay(word, new Set())}\n\nGuess a letter: \`!letter <x>\` or the whole word: \`!solve <word>\``
    );
    return;
  }

  if (command === 'letter') {
    const game = hangmanGames.get(channelId);
    if (!game) return message.reply('No Hangman game running. Start one with `!hangman`.');
    const letter = (args[0] || '').toLowerCase();
    if (!letter || letter.length !== 1) return message.reply('Guess a single letter: `!letter a`');
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
    if (!game) return message.reply('No Hangman game running. Start one with `!hangman`.');
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
});

keepAlive();
client.login(process.env.DISCORD_TOKEN);
