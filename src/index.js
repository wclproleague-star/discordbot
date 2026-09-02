import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

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

client.once('ready', () => {
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

    const [image1_url, image2_url] = await Promise.all([
      uploadImageToSupabase(img1, message.id, 1),
      uploadImageToSupabase(img2, message.id, 2),
    ]);

    const { error } = await supabase.from('match_submissions').insert({
      discord_message_id: message.id,
      discord_channel_id: message.channel.id,
      discord_author_id: message.author.id,
      discord_author_name: message.author.username,
      result_text: message.content.trim(),
      image1_url,
      image2_url,
      status: 'pending',
    });

    if (error) throw error;

    await message.react('✅');
  } catch (err) {
    console.error('Erreur traitement message:', err);
    await message.react('❌').catch(() => {});
  }
});

async function uploadImageToSupabase(attachment, messageId, index) {
  const res = await fetch(attachment.url);
  if (!res.ok) {
    throw new Error(`Échec du téléchargement de l'image ${attachment.url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = attachment.name?.split('.').pop() || 'png';
  const path = `${messageId}/${index}.${ext}`;

  const { error } = await supabase.storage
    .from('match-screenshots')
    .upload(path, buffer, {
      contentType: attachment.contentType || 'image/png',
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage.from('match-screenshots').getPublicUrl(path);
  return data.publicUrl;
}

client.login(process.env.DISCORD_BOT_TOKEN);
