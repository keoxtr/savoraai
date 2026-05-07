create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  handle text not null,
  text text not null,
  topic text default 'Gündem',
  link text,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  result jsonb not null,
  sources jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  reason text not null,
  detail text,
  status text default 'pending',
  created_at timestamptz default now()
);
