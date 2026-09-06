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

// ---- CONFIG ----
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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

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
  }
});

keepAlive();
client.login(process.env.DISCORD_TOKEN);
