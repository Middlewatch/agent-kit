-- Independent re-derivation of `sess stat`'s numeric columns for Claude Code
-- transcripts.
--
-- Written from the transcript format, never from src/main.zig. If this query
-- and the tool disagree, that is the point: one of them has misread the
-- format, and which one is an open question until someone looks.
--
-- Parameter: `f` — path to one transcript file.

-- `read_ndjson_objects` rather than `read_json_auto`: one untyped JSON value
-- per line, with no schema inference. Inference would bind top-level columns
-- from whatever fields happen to occur in this file, so a transcript that
-- never uses `promptSource` would fail to bind it at all rather than
-- returning null. Absent fields are normal in an undocumented, drifting
-- format, and the oracle has to tolerate them exactly as the tool does.
with l as (
  select json->>'$.type'                as type,
         json->>'$.requestId'           as requestId,
         json->>'$.promptSource'        as promptSource,
         coalesce(json->>'$.isMeta' = 'true', false) as is_meta,
         json->'$.message.content'      as content,
         json->'$.message.usage'        as usage
  from read_ndjson_objects(getvariable('f'), ignore_errors=true)
),

-- `content` is polymorphic: a bare string, or an array of typed blocks.
-- Normalize both into a list of text blocks plus a tool_result marker.
u as (
  select promptSource, is_meta,
    case when json_type(content)='VARCHAR' then [content->>'$']
         else list_transform(
                list_filter(json_extract(content,'$[*]')::json[],
                            lambda b: json_extract_string(b,'$.type')='text'),
                lambda b: json_extract_string(b,'$.text'))
    end as texts,
    coalesce(list_contains(
      list_transform(json_extract(content,'$[*]')::json[],
                     lambda b: json_extract_string(b,'$.type')), 'tool_result'), false) as is_result
  from l where type='user'
),

-- A turn is a line a person wrote. Lines carrying tool results are
-- transport; lines the harness generated are marked by `isMeta`, by
-- promptSource='system', or by a leading wrapper tag.
turns as (
  select count(*) as n from u
  where not is_result
    and not is_meta
    and coalesce(promptSource,'') <> 'system'
    and len(list_filter(texts, lambda x: trim(x) <> '')) > 0
    and not list_bool_and(list_transform(list_filter(texts, lambda x: trim(x) <> ''),
          lambda x: regexp_matches(ltrim(x),
            '^<(task-notification|command-name|command-message|command-args|local-command-caveat|local-command-stdout|local-command-stderr|bash-input|bash-stdout|bash-stderr|system-reminder)>')))
),

-- One API request spans several lines and repeats its usage on each, so
-- usage is counted once per distinct requestId.
api as (
  select count(*) as api_turns,
         coalesce(sum(json_extract(usage,'$.input_tokens')::bigint),0)                as in_tok,
         coalesce(sum(json_extract(usage,'$.output_tokens')::bigint),0)               as out_tok,
         coalesce(sum(json_extract(usage,'$.cache_read_input_tokens')::bigint),0)     as cache_r,
         coalesce(sum(json_extract(usage,'$.cache_creation_input_tokens')::bigint),0) as cache_w
  from (select distinct on (requestId) requestId, usage from l where type='assistant')
),

tl as (
  select count(*) as n from l, unnest(json_extract(content,'$[*]')::json[]) as t(x)
  where type='assistant' and json_extract_string(x,'$.type')='tool_use'
),

er as (
  select count(*) as n from l, unnest(json_extract(content,'$[*]')::json[]) as t(x)
  where type='user' and json_extract_string(x,'$.type')='tool_result'
    and json_extract_string(x,'$.is_error')='true'
)

select (select n from turns) as turns,
       api_turns              as api,
       (select n from tl)     as tools,
       (select n from er)     as err,
       in_tok, out_tok, cache_r, cache_w,
       0.0                    as cost  -- Claude transcripts record no cost
from api;
