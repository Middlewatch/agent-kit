-- Independent re-derivation of `sess stat`'s numeric columns for Pi
-- transcripts.
--
-- Written from the transcript format, never from src/main.zig. Note how
-- little this shares with claude.sql: different field names for the same
-- token classes, `toolCall` rather than `tool_use`, and tool results as a
-- message *role* rather than a block inside a user line. That divergence is
-- the reason the tool has a normalization layer at all.
--
-- Parameter: `f` — path to one transcript file.

-- `read_ndjson_objects` rather than `read_json_auto`: see the note in
-- claude.sql. Absent fields must read as null, not fail to bind.
with l as (
  select json->>'$.message.role'    as role,
         json->'$.message.content'  as content,
         json->'$.message.usage'    as usage,
         json->>'$.message.isError' as is_error
  from read_ndjson_objects(getvariable('f'), ignore_errors=true)
  where json->>'$.type' = 'message'
),

-- Pi content is a bare string or an array of blocks; text blocks carry a
-- `text` field.
u as (
  select
    case when json_type(content)='VARCHAR' then [content->>'$']
         else coalesce(list_filter(
                list_transform(json_extract(content,'$[*]')::json[],
                               lambda b: json_extract_string(b,'$.text')),
                lambda x: x is not null), [])
    end as texts
  from l where role='user'
),

-- Same turn rule as the other format: a user line is a turn unless every
-- non-empty text block on it is a harness wrapper. Pi shows no injected
-- lines today; the rule is applied anyway so both formats answer the same
-- question the same way.
turns as (
  select count(*) as n from u
  where len(list_filter(texts, lambda x: trim(x) <> '')) = 0
     or not list_bool_and(list_transform(list_filter(texts, lambda x: trim(x) <> ''),
          lambda x: regexp_matches(ltrim(x),
            '^<(task-notification|command-name|command-message|command-args|local-command-caveat|local-command-stdout|local-command-stderr|bash-input|bash-stdout|bash-stderr|system-reminder)>')))
),

-- Pi writes one line per assistant turn, so there is no request-id dedupe.
api as (
  select count(*) as api_turns,
         coalesce(sum(json_extract(usage,'$.input')::bigint),0)      as in_tok,
         coalesce(sum(json_extract(usage,'$.output')::bigint),0)     as out_tok,
         coalesce(sum(json_extract(usage,'$.cacheRead')::bigint),0)  as cache_r,
         coalesce(sum(json_extract(usage,'$.cacheWrite')::bigint),0) as cache_w,
         coalesce(sum(json_extract(usage,'$.cost.total')::double),0) as cost
  from l where role='assistant'
),

tl as (
  select count(*) as n from l, unnest(json_extract(content,'$[*]')::json[]) as t(x)
  where role='assistant' and json_extract_string(x,'$.type')='toolCall'
),

er as (select count(*) as n from l where role='toolResult' and is_error='true')

select (select n from turns) as turns,
       api_turns              as api,
       (select n from tl)     as tools,
       (select n from er)     as err,
       in_tok, out_tok, cache_r, cache_w, cost
from api;
