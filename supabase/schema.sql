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

-- Le bot utilise la clé publique "anon" (pas la service_role, inaccessible
-- sur Lovable Cloud). On limite donc ses droits au strict nécessaire :
-- il peut seulement INSÉRER, jamais lire/modifier/supprimer.
-- Les images restent des liens CDN Discord (le bot n'a pas accès au
-- storage à cause des policies existantes liées au système de rôles
-- du site) : le traitement côté Lovable doit les récupérer/réuploader
-- avant qu'ils n'expirent.
alter table match_submissions enable row level security;

create policy "Bot Discord: insertion seule"
on match_submissions
for insert
to anon
with check (true);
