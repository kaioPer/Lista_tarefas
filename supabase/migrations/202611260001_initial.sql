begin;
create schema if not exists private;
revoke all on schema private from public;
create table public.profiles (
 id uuid primary key references auth.users(id), display_name text not null default 'Participante', avatar_url text, created_at timestamptz not null default now()
);
create table public.boards (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100), description text not null default '',
 owner_id uuid not null references public.profiles(id), archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.board_members (
 board_id uuid references public.boards(id) on delete cascade, user_id uuid references public.profiles(id), role text not null check(role in ('admin','editor','reader')), joined_at timestamptz not null default now(), primary key(board_id,user_id)
);
create table public.board_invitations (
 id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id), email text not null, role text not null check(role in ('admin','editor','reader')),
 token_hash text not null unique, invited_by uuid not null references public.profiles(id), expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz, revoked_at timestamptz
);
create table public.board_columns (
 id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id), name text not null check(length(trim(name)) between 1 and 80),
 kind text not null check(kind in ('todo','in_progress','done')), position double precision not null default 0, unique(board_id,id)
);
create table public.cards (
 id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id), column_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 160), description text not null default '' check(length(description)<=10000), due_date date, position double precision not null default 0,
 completed_at timestamptz, archived_at timestamptz, created_by uuid not null references public.profiles(id), version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(board_id,id),
 foreign key(board_id,column_id) references public.board_columns(board_id,id)
);
create table public.card_assignees (
 board_id uuid not null, card_id uuid not null, user_id uuid not null, primary key(card_id,user_id),
 foreign key(board_id,card_id) references public.cards(board_id,id), foreign key(board_id,user_id) references public.board_members(board_id,user_id) on delete cascade
);
create table public.labels (
 id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id), name text not null check(length(trim(name)) between 1 and 40), color text not null default '#6355dc' check(color ~ '^#[0-9a-fA-F]{6}$'), unique(board_id,id), unique(board_id,name)
);
create table public.card_labels (
 board_id uuid not null, card_id uuid not null, label_id uuid not null, primary key(card_id,label_id),
 foreign key(board_id,card_id) references public.cards(board_id,id), foreign key(board_id,label_id) references public.labels(board_id,id) on delete cascade
);
create table public.comments (
 id uuid primary key default gen_random_uuid(), board_id uuid not null, card_id uuid not null, author_id uuid not null references public.profiles(id), body text not null check(length(trim(body)) between 1 and 5000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), foreign key(board_id,card_id) references public.cards(board_id,id)
);
create table public.card_dependencies (
 board_id uuid not null, card_id uuid not null, depends_on_card_id uuid not null, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), primary key(card_id,depends_on_card_id), check(card_id<>depends_on_card_id),
 foreign key(board_id,card_id) references public.cards(board_id,id), foreign key(board_id,depends_on_card_id) references public.cards(board_id,id)
);
create table public.activity_events (
 id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id), card_id uuid references public.cards(id), actor_id uuid not null references public.profiles(id), event_type text not null, payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create index members_user on public.board_members(user_id,board_id);
create index cards_board on public.cards(board_id,column_id,position);
create index dependency_reverse on public.card_dependencies(board_id,depends_on_card_id);
create index comments_card on public.comments(board_id,card_id,created_at);
create index activity_board on public.activity_events(board_id,created_at desc);
create index invitations_board on public.board_invitations(board_id);

create function private.member_role(b uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.board_members where board_id=b and user_id=auth.uid()
$$;
create function private.shares_board(u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select u=auth.uid() or exists(select 1 from public.board_members a join public.board_members b on a.board_id=b.board_id where a.user_id=auth.uid() and b.user_id=u)
$$;
create function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(left(new.raw_user_meta_data->>'display_name',80),''),'Participante'));
 return new;
end $$;
create trigger create_profile after insert on auth.users for each row execute function private.on_signup();
insert into public.profiles(id,display_name) select id,coalesce(nullif(left(raw_user_meta_data->>'display_name',80),''),'Participante') from auth.users on conflict do nothing;

alter table public.profiles enable row level security;
create policy profile_read on public.profiles for select to authenticated using(private.shares_board(id));
do $$ declare t text; begin
 foreach t in array array['boards','board_members','board_columns','cards','card_assignees','labels','card_labels','comments','card_dependencies','activity_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy member_read on public.%I for select to authenticated using(private.member_role(%I) is not null)',t,case when t='boards' then 'id' else 'board_id' end);
 end loop;
end $$;
alter table public.board_invitations enable row level security;
create policy admin_read on public.board_invitations for select to authenticated using(private.member_role(board_id)='admin');
-- API writes are exclusively through the validated RPCs below.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.boards,public.board_members,public.board_columns,public.cards,public.card_assignees,public.labels,public.card_labels,public.comments,public.card_dependencies,public.activity_events,public.board_invitations to authenticated;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.member_role(uuid),private.shares_board(uuid) to authenticated;

create function private.blocked(c uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.card_dependencies d join public.cards p on p.id=d.depends_on_card_id where d.card_id=c and p.completed_at is null)
$$;

create function public.create_board(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 if auth.uid() is null then raise exception 'Faça login.'; end if;
 insert into public.boards(name,owner_id) values(trim(p_name),auth.uid()) returning id into b;
 insert into public.board_members values(b,auth.uid(),'admin',now());
 insert into public.board_columns(board_id,name,kind,position) values(b,'A fazer','todo',0),(b,'Em andamento','in_progress',1),(b,'Concluído','done',2);
 return b;
end $$;

-- One lock per board, acquired BEFORE reading dependencies/cards. All mutations use this path.
create function public.board_action(p_board uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r text; b public.boards; c public.cards; col public.board_columns; dep public.cards; target uuid; cid uuid; uid uuid; v text; token text; result jsonb:='{}'; before_ready uuid[]; after_ready uuid[];
begin
 select * into b from public.boards where id=p_board for update;
 r:=private.member_role(p_board);
 if r is null then raise exception 'Sem acesso ao quadro.'; end if;
 if r='reader' then raise exception 'Permissão de edição necessária.'; end if;
 if b.archived_at is not null and p_action<>'board.restore' then raise exception 'Restaure o quadro antes de editar.'; end if;
 if p_action like 'board.%' or p_action like 'member.%' or p_action like 'invite.%' or p_action like 'column.%' then
  if r<>'admin' then raise exception 'Permissão de administrador necessária.'; end if;
 end if;
 cid:=nullif(p_data->>'card_id','')::uuid;
 if cid is not null then
  select * into c from public.cards where id=cid and board_id=p_board;
  if not found then raise exception 'Cartão não encontrado.'; end if;
  if p_action not in ('comment.add') and (p_data->>'version')::integer is distinct from c.version then raise exception 'Este cartão mudou. Atualize antes de salvar.'; end if;
  if c.archived_at is not null and p_action<>'card.restore' then raise exception 'Restaure o cartão antes de editar.'; end if;
 end if;
 if p_action in ('card.update','card.move','card.archive','card.restore','dependency.add','dependency.remove','assignee.toggle','label.toggle','comment.add') and cid is null then raise exception 'Cartão obrigatório.'; end if;
 select coalesce(array_agg(id),'{}') into before_ready from public.cards where board_id=p_board and archived_at is null and completed_at is null and not private.blocked(id);
 case p_action
 when 'board.update' then
  update public.boards set name=trim(p_data->>'name'),description=coalesce(p_data->>'description',''),updated_at=now() where id=p_board;
 when 'board.archive' then update public.boards set archived_at=now(),updated_at=now() where id=p_board;
 when 'board.restore' then update public.boards set archived_at=null,updated_at=now() where id=p_board;
 when 'board.transfer' then
  if b.owner_id<>auth.uid() then raise exception 'Somente o proprietário pode transferir.'; end if;
  uid:=(p_data->>'user_id')::uuid;
  if not exists(select 1 from public.board_members where board_id=p_board and user_id=uid) then raise exception 'Selecione um participante.'; end if;
  update public.board_members set role='admin' where board_id=p_board and user_id=uid;
  update public.boards set owner_id=uid where id=p_board;
 when 'member.role' then
  uid:=(p_data->>'user_id')::uuid;
  if uid=b.owner_id then raise exception 'Transfira a propriedade antes de alterar o proprietário.'; end if;
  update public.board_members set role=p_data->>'role' where board_id=p_board and user_id=uid;
 when 'member.remove' then
  uid:=(p_data->>'user_id')::uuid;
  if uid=b.owner_id then raise exception 'Transfira a propriedade antes de remover o proprietário.'; end if;
  delete from public.board_members where board_id=p_board and user_id=uid;
 when 'invite.create' then
  token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.board_invitations(board_id,email,role,token_hash,invited_by) values(p_board,lower(trim(p_data->>'email')),p_data->>'role',encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid());
  result:=jsonb_build_object('token',token);
 when 'invite.revoke' then update public.board_invitations set revoked_at=now() where id=(p_data->>'invitation_id')::uuid and board_id=p_board and accepted_at is null;
 when 'column.create' then
  insert into public.board_columns(board_id,name,kind,position) values(p_board,trim(p_data->>'name'),p_data->>'kind',coalesce((select max(position)+1 from public.board_columns where board_id=p_board),0));
 when 'column.update' then
  target:=(p_data->>'column_id')::uuid;
  select * into col from public.board_columns where id=target and board_id=p_board;
  if not found then raise exception 'Coluna não encontrada.'; end if;
  if p_data->>'kind' is distinct from col.kind and exists(select 1 from public.cards where column_id=target) then raise exception 'Esvazie a coluna antes de mudar seu tipo.'; end if;
  update public.board_columns set name=trim(p_data->>'name'),kind=p_data->>'kind',position=(p_data->>'position')::double precision where id=target;
 when 'column.delete' then
  target:=(p_data->>'column_id')::uuid;
  if exists(select 1 from public.cards where column_id=target) then raise exception 'Transfira os cartões, inclusive arquivados, antes de excluir.'; end if;
  delete from public.board_columns where id=target and board_id=p_board;
 when 'card.create' then
  target:=(p_data->>'column_id')::uuid;
  select * into col from public.board_columns where id=target and board_id=p_board;
  if not found then raise exception 'Coluna inválida.'; end if;
  insert into public.cards(board_id,column_id,title,created_by,position,completed_at) values(p_board,target,trim(p_data->>'title'),auth.uid(),coalesce((select max(position)+1 from public.cards where column_id=target),0),case when col.kind='done' then now() end) returning id into cid;
 when 'card.update' then
  update public.cards set title=trim(p_data->>'title'),description=coalesce(p_data->>'description',''),due_date=nullif(p_data->>'due_date','')::date where id=cid;
 when 'card.move' then
  target:=(p_data->>'column_id')::uuid;
  select * into col from public.board_columns where id=target and board_id=p_board;
  if not found then raise exception 'Coluna inválida.'; end if;
  if col.kind<>'todo' and private.blocked(cid) then raise exception 'Conclua os pré-requisitos antes de iniciar ou concluir.'; end if;
  if c.completed_at is not null and col.kind<>'done' and exists(
   select 1 from public.card_dependencies d join public.cards x on x.id=d.card_id join public.board_columns xc on xc.id=x.column_id where d.depends_on_card_id=cid and (xc.kind<>'todo' or x.completed_at is not null)
  ) then raise exception 'Reabra primeiro os dependentes iniciados ou concluídos, inclusive arquivados.'; end if;
  update public.cards set column_id=target,position=coalesce((p_data->>'position')::double precision,(select coalesce(max(position),0)+1 from public.cards where column_id=target)),completed_at=case when col.kind='done' then coalesce(c.completed_at,now()) end where id=cid;
 when 'card.archive' then
  if c.completed_at is null and exists(select 1 from public.card_dependencies d join public.cards x on x.id=d.card_id where d.depends_on_card_id=cid and x.archived_at is null) then raise exception 'Este cartão ainda bloqueia tarefas ativas. Resolva as dependências antes de arquivar.'; end if;
  update public.cards set archived_at=now() where id=cid;
 when 'card.restore' then
  if exists(select 1 from public.card_dependencies d join public.cards x on x.id=d.depends_on_card_id where d.card_id=cid and x.archived_at is not null and x.completed_at is null) then raise exception 'Restaure primeiro os pré-requisitos pendentes arquivados.'; end if;
  target:=c.column_id;
  if private.blocked(cid) then
   select id into target from public.board_columns where board_id=p_board and kind='todo' order by position,id limit 1;
   if target is null then raise exception 'Crie uma coluna A fazer para restaurar.'; end if;
  end if;
  update public.cards set archived_at=null,column_id=target,completed_at=case when private.blocked(cid) then null else completed_at end where id=cid;
 when 'dependency.add' then
  target:=(p_data->>'depends_on_card_id')::uuid;
  select * into dep from public.cards where id=target and board_id=p_board and archived_at is null;
  if not found then raise exception 'Pré-requisito inválido ou arquivado.'; end if;
  if target=cid then raise exception 'Uma tarefa não pode depender de si mesma.'; end if;
  if exists(with recursive chain(id) as (select target union select d.depends_on_card_id from public.card_dependencies d join chain on d.card_id=chain.id) select 1 from chain where id=cid) then raise exception 'Essa dependência criaria um ciclo.'; end if;
  if dep.completed_at is null and exists(select 1 from public.board_columns where id=c.column_id and kind<>'todo') then raise exception 'Devolva o cartão para A fazer antes de adicionar um pré-requisito pendente.'; end if;
  insert into public.card_dependencies(board_id,card_id,depends_on_card_id,created_by) values(p_board,cid,target,auth.uid());
 when 'dependency.remove' then delete from public.card_dependencies where card_id=cid and depends_on_card_id=(p_data->>'depends_on_card_id')::uuid;
 when 'assignee.toggle' then
  uid:=(p_data->>'user_id')::uuid;
  if exists(select 1 from public.card_assignees where card_id=cid and user_id=uid) then delete from public.card_assignees where card_id=cid and user_id=uid;
  else insert into public.card_assignees values(p_board,cid,uid); end if;
 when 'label.create' then insert into public.labels(board_id,name,color) values(p_board,trim(p_data->>'name'),p_data->>'color');
 when 'label.toggle' then
  target:=(p_data->>'label_id')::uuid;
  if exists(select 1 from public.card_labels where card_id=cid and label_id=target) then delete from public.card_labels where card_id=cid and label_id=target;
  else insert into public.card_labels values(p_board,cid,target); end if;
 when 'comment.add' then insert into public.comments(board_id,card_id,author_id,body) values(p_board,cid,auth.uid(),trim(p_data->>'body'));
 else raise exception 'Operação desconhecida.';
 end case;
 if cid is not null and p_action<>'comment.add' and p_action<>'card.create' then update public.cards set version=version+1,updated_at=now() where id=cid; end if;
 select coalesce(array_agg(id),'{}') into after_ready from public.cards where board_id=p_board and archived_at is null and completed_at is null and not private.blocked(id) and not(id=any(before_ready));
 insert into public.activity_events(board_id,card_id,actor_id,event_type,payload) values(p_board,cid,auth.uid(),p_action,jsonb_build_object('title',coalesce(p_data->>'title',c.title),'unlocked',to_jsonb(after_ready)));
 return result;
end $$;

create function public.accept_invitation(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.board_invitations; b uuid;
begin
 if auth.uid() is null then raise exception 'Faça login antes de aceitar.'; end if;
 select board_id into b from public.board_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 perform 1 from public.boards where id=b for update;
 select * into i from public.board_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now() then raise exception 'Convite inválido ou expirado.'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and lower(email)=i.email) then raise exception 'Entre com o e-mail confirmado que recebeu o convite.'; end if;
 if exists(select 1 from public.boards where id=b and archived_at is not null) then raise exception 'Quadro arquivado.'; end if;
 insert into public.board_members(board_id,user_id,role) values(i.board_id,auth.uid(),i.role) on conflict do nothing;
 update public.board_invitations set accepted_at=now() where id=i.id;
 insert into public.activity_events(board_id,actor_id,event_type) values(i.board_id,auth.uid(),'member.join');
 return i.board_id;
end $$;
revoke all on function public.create_board(text),public.board_action(uuid,text,jsonb),public.accept_invitation(text) from public,anon;
grant execute on function public.create_board(text),public.board_action(uuid,text,jsonb),public.accept_invitation(text) to authenticated;
-- Only board-scoped data is published; invitations and profiles are fetched through RLS.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['boards','board_members','board_columns','cards','card_assignees','labels','card_labels','comments','card_dependencies','activity_events'] loop
 execute format('alter publication supabase_realtime add table public.%I',t);
 end loop;
 end if;
end $$;
commit;
