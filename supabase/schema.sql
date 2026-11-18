-- 可选替代后端：在全新 Supabase 项目的 SQL Editor 中执行一次。
-- 数据表不向访客开放。只能调用受限的提交函数，不能读取、更新或删除愿望。
create table public.christmas_wishes (
  id uuid primary key,
  nickname text not null default '' check (char_length(nickname) <= 30),
  gift text not null check (char_length(trim(gift)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index christmas_wishes_created_at_idx on public.christmas_wishes(created_at);
alter table public.christmas_wishes enable row level security;
revoke all on public.christmas_wishes from anon, authenticated;

create function public.submit_christmas_wish(p_id uuid, p_nickname text, p_gift text, p_consent boolean, p_website text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_row public.christmas_wishes%rowtype;
begin
  if p_id is null or p_consent is distinct from true or coalesce(p_website,'') <> ''
    or p_gift is null or char_length(trim(p_gift)) not between 1 and 500
    or p_nickname is null or char_length(trim(p_nickname)) > 30 then
    raise exception 'invalid_wish' using errcode = 'PT400';
  end if;
  -- Serialize this small private event's submissions, keeping the daily cap atomic.
  perform pg_catalog.pg_advisory_xact_lock(25122026);
  select * into old_row from public.christmas_wishes where id = p_id;
  if found then
    if old_row.nickname <> trim(p_nickname) or old_row.gift <> trim(p_gift) then
      raise exception 'receipt_conflict' using errcode = 'PT409';
    end if;
    return pg_catalog.jsonb_build_object('ok',true,'id',p_id);
  end if;
  if (select count(*) from public.christmas_wishes where created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= 2000 then
    -- PT429：PostgREST 会直接返回 HTTP 429，前端显示“今天的邮袋满了”而不是“内容未通过检查”
    raise exception 'daily_capacity' using errcode = 'PT429';
  end if;
  insert into public.christmas_wishes(id,nickname,gift) values(p_id,trim(p_nickname),trim(p_gift));
  return pg_catalog.jsonb_build_object('ok',true,'id',p_id);
end;
$$;
revoke all on function public.submit_christmas_wish(uuid,text,text,boolean,text) from public;
grant execute on function public.submit_christmas_wish(uuid,text,text,boolean,text) to anon;
