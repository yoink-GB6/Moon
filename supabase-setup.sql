-- ============================================================
-- 多页面协作网站 · Supabase 初始化脚本
-- 在 Supabase Dashboard → SQL Editor 全选粘贴运行
-- ============================================================

-- ────────────────────────────────────────
-- 1. 主页内容表（可编辑文字段落 + 链接）
-- ────────────────────────────────────────
create table if not exists site_content (
  key         text primary key,   -- 内容标识符，如 'home_title', 'home_body'
  value       text not null default '',
  updated_at  timestamptz default now()
);

-- 默认内容
insert into site_content (key, value) values
  ('home_title', '欢迎来到这个网站'),
  ('home_body',  '这里是主页正文，可以编辑这段文字。'),
  ('home_links', '[]')   -- JSON 数组，格式：[{"label":"链接名","url":"https://..."}]
on conflict (key) do nothing;

-- ────────────────────────────────────────
-- 2. 人物时间轴表
-- ────────────────────────────────────────
create table if not exists characters (
  id          bigserial primary key,
  name        text        not null unique,
  base_age    integer     not null,
  age_limit   integer     default null,
  color       text        not null default '#7c83f7',
  avatar_url  text        default null,
  sort_order  integer     default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ────────────────────────────────────────
-- 3. 时间轴全局配置
-- ────────────────────────────────────────
create table if not exists timeline_config (
  id         integer primary key default 1,
  age_offset integer     default 0,
  scale      numeric     default 60,
  view_off_x numeric     default 0,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);
insert into timeline_config (id) values (1) on conflict (id) do nothing;

-- ────────────────────────────────────────
-- 4. （预留）地图页面表 — 以后填充字段
-- ────────────────────────────────────────
create table if not exists map_locations (
  id          bigserial primary key,
  name        text        not null,
  country     text        default null,
  lat         numeric     default null,
  lng         numeric     default null,
  size        integer     default 1,    -- 标记大小/重要程度
  description text        default null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ────────────────────────────────────────
-- 5. updated_at 触发器
-- ────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_characters_updated  on characters;
drop trigger if exists trg_config_updated      on timeline_config;
drop trigger if exists trg_map_updated         on map_locations;
drop trigger if exists trg_content_updated     on site_content;

create trigger trg_characters_updated  before update on characters      for each row execute function update_updated_at();
create trigger trg_config_updated      before update on timeline_config for each row execute function update_updated_at();
create trigger trg_map_updated         before update on map_locations   for each row execute function update_updated_at();
-- site_content uses text primary key, updated_at managed same way
create or replace function update_site_content_ts()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger trg_content_updated before update on site_content for each row execute function update_site_content_ts();

-- ────────────────────────────────────────
-- 6. Row Level Security
-- ────────────────────────────────────────
alter table site_content    enable row level security;
alter table characters      enable row level security;
alter table timeline_config enable row level security;
alter table map_locations   enable row level security;

-- 所有人可读
create policy "public read site_content"    on site_content    for select using (true);
create policy "public read characters"      on characters      for select using (true);
create policy "public read config"          on timeline_config for select using (true);
create policy "public read map_locations"   on map_locations   for select using (true);

-- 所有人可写（密码在前端控制）
create policy "anon write site_content"    on site_content    for all using (true) with check (true);
create policy "anon write characters"      on characters      for all using (true) with check (true);
create policy "anon write config"          on timeline_config for all using (true) with check (true);
create policy "anon write map_locations"   on map_locations   for all using (true) with check (true);

-- ────────────────────────────────────────
-- 7. Storage bucket
-- ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

create policy "public read avatars"  on storage.objects for select using (bucket_id = 'avatars');
create policy "anon upload avatars"  on storage.objects for insert with check (bucket_id = 'avatars');
create policy "anon delete avatars"  on storage.objects for delete using (bucket_id = 'avatars');

-- ────────────────────────────────────────
-- 完成！去 Project Settings → API 获取 URL 和 anon key
-- ────────────────────────────────────────

-- ════════════════════════════════════════
-- 地图页面新增表（在已有脚本基础上追加执行）
-- ════════════════════════════════════════

-- 地图区域表
create table if not exists map_regions (
  id              bigserial primary key,
  name            text        not null default '',
  description     text        default '',
  color           text        default '#7c83f7',
  points_json     text        default '[]',      -- [{x,y},...]  世界坐标
  characters_json text        default '[]',      -- [character_id,...]
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 地图坐标点表
create table if not exists map_points (
  id              bigserial primary key,
  name            text        not null default '',
  description     text        default '',
  x               numeric     not null default 0,
  y               numeric     not null default 0,
  characters_json text        default '[]',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- updated_at 触发器
drop trigger if exists trg_map_regions_updated on map_regions;
drop trigger if exists trg_map_points_updated  on map_points;
create trigger trg_map_regions_updated before update on map_regions for each row execute function update_updated_at();
create trigger trg_map_points_updated  before update on map_points  for each row execute function update_updated_at();

-- RLS
alter table map_regions enable row level security;
alter table map_points  enable row level security;
create policy "public read map_regions"  on map_regions for select using (true);
create policy "public read map_points"   on map_points  for select using (true);
create policy "anon write map_regions"   on map_regions for all using (true) with check (true);
create policy "anon write map_points"    on map_points  for all using (true) with check (true);

-- ════════════════════════════════════════
-- 修复：添加缺失的 description 字段
-- ════════════════════════════════════════
alter table characters add column if not exists description text default '';

-- ════════════════════════════════════════
-- 修复：移除 base_age 的唯一约束（允许多个 null 或相同年龄）
-- ════════════════════════════════════════
-- 注意：PostgreSQL 中 unique 约束对 null 的处理是：多个 null 不算重复
-- 但如果有显式的 unique index on (base_age)，需要删除
-- 如果约束是在 create table 时的 unique，需要先删除约束
-- 检查是否有名为 characters_base_age_key 的约束并删除
do $$
begin
  if exists (
    select 1 from pg_constraint 
    where conname = 'characters_base_age_key' 
    and conrelid = 'characters'::regclass
  ) then
    alter table characters drop constraint characters_base_age_key;
  end if;
end $$;

-- 如果报错是 characters_name_key（名字唯一约束冲突），需要保留它
-- 这里只移除 base_age 相关的唯一约束

-- ════════════════════════════════════════
-- 修复：允许 base_age 为 null（年龄可选）
-- ════════════════════════════════════════
alter table characters alter column base_age drop not null;

-- ════════════════════════════════════════
-- 文本/图片库表
-- ════════════════════════════════════════
create table if not exists library_items (
  id          bigserial   primary key,
  content     text        not null,
  author      text,
  tags_json   text        default '[]',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Triggers for updated_at
drop trigger if exists trg_library_items_updated on library_items;
create trigger trg_library_items_updated before update on library_items for each row execute function update_updated_at();

-- RLS policies
alter table library_items enable row level security;

create policy "public read library_items" on library_items for select using (true);
create policy "anon write library_items" on library_items for all using (true) with check (true);

-- ════════════════════════════════════════
-- 指令集点赞功能
-- ════════════════════════════════════════
alter table library_items add column if not exists likes integer default 0;

-- 创建索引加速排序
create index if not exists idx_library_items_likes on library_items(likes desc);
