# Observability as code

| Path | Tool | Contents |
|---|---|---|
| `dynatrace/` | Dynatrace Monaco v2 | management zones per portal, SLOs, alerting profiles, synthetic browser monitors |
| `kibana/saved-objects/` | Kibana saved objects | `selfcare-logs-*` data view, saved searches, visualisations, the **Selfcare - API operations** dashboard |
| `kibana/watchers/` | Elasticsearch Watcher | 5xx-rate and P1-ticket-spike alerts |
| `runbooks/` | Markdown | on-call procedures linked from every alert |

## Log contract

Every service writes one JSON object per line:
`ts`, `level`, `msg`, `service`, `correlationId`, and for HTTP access lines `method`, `path`, `status`, `durationMs`.
Problem responses also log `err.code`, which is the RFC 7807 `code`. Ticket events log `msg: "ticket.created"` with `priority`, `category`, `accountId` and `ticketId`.
The dashboards and watchers depend on these field names. If a service renames one, the change must update this folder in the same PR.

Services tag themselves for Dynatrace with `DT_TAGS="app:<apps folder name> tier:<env>"`. The management zones match on the `app` tag.

## Deploy

```bash
# Dynatrace (tokens/OAuth clients from the environment, see manifest.yaml)
monaco deploy dynatrace/manifest.yaml --group nonprod
monaco deploy dynatrace/manifest.yaml --group prod

# Kibana saved objects (overwrite keeps IDs stable so links survive)
curl -X POST "$KIBANA_URL/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" -H "Authorization: ApiKey $KIBANA_API_KEY" \
  --form file=@kibana/saved-objects/selfcare-logs.ndjson

# Watchers
for w in kibana/watchers/*.json; do
  curl -X PUT "$ES_URL/_watcher/watch/$(basename "$w" .json)" \
    -H "Content-Type: application/json" -H "Authorization: ApiKey $ES_API_KEY" --data-binary @"$w"
done
```

To check Monaco templates without deploying, run `monaco deploy --dry-run`.
