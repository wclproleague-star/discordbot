import 'dotenv/config';
import WebSocket from 'ws';
import { Client, GatewayIntentBits } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

// Node 20 n'a pas de WebSocket natif (arrivé en Node 22) ; le SDK Supabase
// en a besoin pour s'initialiser même si on n'utilise pas Realtime.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

const requiredEnv = [
  'DISCORD_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Variable d'environnement manquante: ${key}`);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const TARGET_CHANNEL_IDS = (process.env.DISCORD_CHANNEL_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  if (TARGET_CHANNEL_IDS.length) {
    console.log(`Salons surveillés: ${TARGET_CHANNEL_IDS.join(', ')}`);
  } else {
    console.log('Aucun salon spécifique configuré: tous les salons sont surveillés.');
  }
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (TARGET_CHANNEL_IDS.length && !TARGET_CHANNEL_IDS.includes(message.channel.id)) return;

    const images = [...message.attachments.values()].filter((a) =>
      (a.contentType || '').startsWith('image/'),
    );

    // On ne traite que les messages qui ressemblent à un post de match:
    // au moins 2 images. Les autres messages du salon sont ignorés silencieusement.
    if (images.length < 2) return;

    if (!message.content.trim()) {
      await message.reply(
        "Il manque le texte du résultat du match (score, équipes, etc.) dans ce message.",
      );
      return;
    }

    const [img1, img2] = images;

    // On transmet directement les liens CDN Discord (pas de re-upload:
    // la clé anon du bot n'a pas les droits sur le storage). Ces liens
    // signés expirent après un moment, donc le traitement côté Lovable
    // doit récupérer/réuploader les images assez vite après réception.
    const { error } = await supabase.from('match_submissions').insert({
      discord_message_id: message.id,
      discord_channel_id: message.channel.id,
      discord_author_id: message.author.id,
      discord_author_name: message.author.username,
      result_text: message.content.trim(),
      image1_url: img1.url,
      image2_url: img2.url,
      status: 'pending',
    });

    if (error) throw error;

    await message.react('✅');
  } catch (err) {
    console.error('Erreur traitement message:', err);
    await message.react('❌').catch(() => {});
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
