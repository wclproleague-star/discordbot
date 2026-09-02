-- Table où le bot Discord dépose les soumissions brutes de match.
-- Le champ match_data sera rempli plus tard par l'IA côté Lovable,
-- puis vérifié/corrigé par un humain (status passe à 'verified').
create table if not exists match_submissions (
  id uuid primary key default gen_random_uuid(),
  discord_message_id text unique not null,
  discord_channel_id text not null,
  discord_author_id text not null,
  discord_author_name text not null,
  result_text text not null,
  image1_url text not null,
  image2_url text not null,
  status text not null default 'pending', -- pending | processed | verified
  match_data jsonb,
  created_at timestamptz not null default now()
);

-- Bucket de stockage public pour les screenshots (le bot y upload les images).
insert into storage.buckets (id, name, public)
values ('match-images', 'match-images', true)
on conflict (id) do nothing;
