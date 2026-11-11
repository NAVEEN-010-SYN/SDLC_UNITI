# Monitoring and alerting: observability

- **Application:** Monitoring and alerting
- **Tech stack:** Dynatrace, Kibana
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 16

## Files

- `observability/README.md` (39 lines)
- `observability/dynatrace/manifest.yaml` (36 lines)
- `observability/dynatrace/selfcare/alerting-profile/alerting-profile.json` (54 lines)
- `observability/dynatrace/selfcare/alerting-profile/config.yaml` (58 lines)
- `observability/dynatrace/selfcare/management-zone/config.yaml` (49 lines)
- `observability/dynatrace/selfcare/management-zone/management-zone.json` (31 lines)
- `observability/dynatrace/selfcare/slo/config.yaml` (90 lines)
- `observability/dynatrace/selfcare/slo/slo-availability.json` (18 lines)
- `observability/dynatrace/selfcare/slo/slo-latency.json` (16 lines)
- `observability/dynatrace/selfcare/synthetic-monitor/browser-checkout.json` (80 lines)
- `observability/dynatrace/selfcare/synthetic-monitor/browser-login.json` (68 lines)
- `observability/dynatrace/selfcare/synthetic-monitor/config.yaml` (59 lines)
- `observability/kibana/saved-objects/selfcare-logs.ndjson` (11 lines)
- `observability/kibana/watchers/selfcare-5xx-rate.json` (90 lines)
- `observability/kibana/watchers/selfcare-p1-ticket-spike.json` (96 lines)
- `observability/runbooks/selfcare-incident-runbook.md` (66 lines)

## observability/README.md

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: markdown. Path: `observability/README.md`.

````markdown
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
````

## observability/dynatrace/manifest.yaml

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: yaml. Path: `observability/dynatrace/manifest.yaml`.

```yaml
manifestVersion: 1.0

projects:
  - name: selfcare
    path: selfcare

environmentGroups:
  - name: nonprod
    environments:
      - name: staging
        url:
          type: environment
          value: DT_STAGING_URL
        auth:
          token:
            name: DT_STAGING_API_TOKEN
          oAuth:
            clientId:
              name: DT_STAGING_OAUTH_CLIENT_ID
            clientSecret:
              name: DT_STAGING_OAUTH_CLIENT_SECRET
  - name: prod
    environments:
      - name: production
        url:
          type: environment
          value: DT_PROD_URL
        auth:
          token:
            name: DT_PROD_API_TOKEN
          oAuth:
            clientId:
              name: DT_PROD_OAUTH_CLIENT_ID
            clientSecret:
              name: DT_PROD_OAUTH_CLIENT_SECRET
```

## observability/dynatrace/selfcare/alerting-profile/alerting-profile.json

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/dynatrace/selfcare/alerting-profile/alerting-profile.json`.

```json
{
  "name": "{{ .profileName }}",
  "managementZone": "{{ .managementZone }}",
  "severityRules": [
    {
      "severityLevel": "AVAILABILITY",
      "delayInMinutes": 0,
      "tagFilterIncludeMode": "NONE"
    },
    {
      "severityLevel": "ERRORS",
      "delayInMinutes": 2,
      "tagFilterIncludeMode": "NONE"
    },
    {
      "severityLevel": "PERFORMANCE",
      "delayInMinutes": {{ .slowdownDelayMinutes }},
      "tagFilterIncludeMode": "NONE"
    },
    {
      "severityLevel": "RESOURCE_CONTENTION",
      "delayInMinutes": 30,
      "tagFilterIncludeMode": "INCLUDE_ANY",
      "tagFilter": ["tier:production"]
    },
    {
      "severityLevel": "CUSTOM_ALERT",
      "delayInMinutes": 0,
      "tagFilterIncludeMode": "NONE"
    }
  ],
  "eventFilters": [
    {
      "type": "PREDEFINED",
      "predefinedFilter": {
        "eventType": "SYNTHETIC_AVAILABILITY_ISSUE",
        "negate": false
      }
    },
    {
      "type": "CUSTOM",
      "customFilter": {
        "titleFilter": {
          "enabled": true,
          "operator": "CONTAINS",
          "value": "SLO",
          "negate": false,
          "caseSensitive": false
        }
      }
    }
  ]
}
```

## observability/dynatrace/selfcare/alerting-profile/config.yaml

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: yaml. Path: `observability/dynatrace/selfcare/alerting-profile/config.yaml`.

```yaml
# Alerting profiles decide which problems page whom. Availability and error
# problems page immediately; slowdowns wait so transient spikes self-heal;
# resource and custom-info problems only reach the team channel.
configs:
  - id: ap-b2c
    type:
      settings:
        schema: builtin:alerting.profile
        scope: environment
    config:
      name: Selfcare B2C on-call
      template: alerting-profile.json
      parameters:
        profileName: Selfcare B2C on-call
        managementZone:
          type: reference
          project: selfcare
          configType: builtin:management-zones
          configId: mz-b2c
          property: id
        slowdownDelayMinutes: 10

  - id: ap-b2b
    type:
      settings:
        schema: builtin:alerting.profile
        scope: environment
    config:
      name: Selfcare B2B on-call
      template: alerting-profile.json
      parameters:
        profileName: Selfcare B2B on-call
        managementZone:
          type: reference
          project: selfcare
          configType: builtin:management-zones
          configId: mz-b2b
          property: id
        slowdownDelayMinutes: 15

  - id: ap-partner
    type:
      settings:
        schema: builtin:alerting.profile
        scope: environment
    config:
      name: Selfcare Partners on-call
      template: alerting-profile.json
      parameters:
        profileName: Selfcare Partners on-call
        managementZone:
          type: reference
          project: selfcare
          configType: builtin:management-zones
          configId: mz-partner
          property: id
        slowdownDelayMinutes: 15
```

## observability/dynatrace/selfcare/management-zone/config.yaml

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: yaml. Path: `observability/dynatrace/selfcare/management-zone/config.yaml`.

```yaml
# One management zone per portal, scoped by the `app` tag every service sets via
# DT_TAGS (app:<folder name under apps/>). Zones drive dashboards, alert routing
# and RBAC for the owning team.
configs:
  - id: mz-b2c
    type:
      settings:
        schema: builtin:management-zones
        scope: environment
    config:
      name: Selfcare B2C
      template: management-zone.json
      parameters:
        zoneName: Selfcare B2C
        description: GoKinetic consumer storefront, Uconnect, consumer iOS and UCE shell
        appTags:
          type: value
          value: [ecom-gokinetic, uconnect, gokinetic-consumer-ios, uce, chatbot]

  - id: mz-b2b
    type:
      settings:
        schema: builtin:management-zones
        scope: environment
    config:
      name: Selfcare B2B
      template: management-zone.json
      parameters:
        zoneName: Selfcare B2B
        description: Business self-care, SD-WAN and hosted services
        appTags:
          type: value
          value: [gokinetic-business, sdwan-portal, hosted-services, uconnect]

  - id: mz-partner
    type:
      settings:
        schema: builtin:management-zones
        scope: environment
    config:
      name: Selfcare Partners
      template: management-zone.json
      parameters:
        zoneName: Selfcare Partners
        description: Enterprise partner portal and iConnect wholesale
        appTags:
          type: value
          value: [enterprise-partner-portal, iconnect-wholesale]
```

## observability/dynatrace/selfcare/management-zone/management-zone.json

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/dynatrace/selfcare/management-zone/management-zone.json`.

```json
{
  "name": "{{ .zoneName }}",
  "description": "{{ .description }}",
  "rules": [
    {{- range $i, $app := .appTags }}{{ if $i }},{{ end }}
    {
      "enabled": true,
      "type": "ME",
      "attributeRule": {
        "entityType": "SERVICE",
        "conditions": [
          { "key": "SERVICE_TAGS", "operator": "EQUALS", "tag": "app:{{ $app }}" }
        ],
        "serviceToHostPropagation": true,
        "serviceToPGPropagation": true
      }
    },
    {
      "enabled": true,
      "type": "ME",
      "attributeRule": {
        "entityType": "WEB_APPLICATION",
        "conditions": [
          { "key": "WEB_APPLICATION_TAGS", "operator": "EQUALS", "tag": "app:{{ $app }}" }
        ]
      }
    }
    {{- end }}
  ]
}
```

## observability/dynatrace/selfcare/slo/config.yaml

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: yaml. Path: `observability/dynatrace/selfcare/slo/config.yaml`.

```yaml
# Service-level objectives per portal. Availability counts 5xx and timeouts as
# failures (4xx are client errors and excluded); latency uses the P95 of
# server-side response time on the key user action. Targets reviewed quarterly.
configs:
  - id: slo-ecom-checkout-availability
    type:
      api: slo
    config:
      name: eCom checkout availability
      template: slo-availability.json
      parameters:
        serviceTag: app:ecom-gokinetic
        requestName: POST /api/v1/checkout
        target: 99.9
        warning: 99.95
        timeframe: -28d
        mzName: Selfcare B2C

  - id: slo-uconnect-billing-availability
    type:
      api: slo
    config:
      name: Uconnect billing availability
      template: slo-availability.json
      parameters:
        serviceTag: app:uconnect
        requestName: /api/v1/accounts/*/invoices
        target: 99.5
        warning: 99.8
        timeframe: -28d
        mzName: Selfcare B2C

  - id: slo-iconnect-order-availability
    type:
      api: slo
    config:
      name: iConnect order placement availability
      template: slo-availability.json
      parameters:
        serviceTag: app:iconnect-wholesale
        requestName: POST /api/v1/wholesale/orders
        target: 99.9
        warning: 99.95
        timeframe: -28d
        mzName: Selfcare Partners

  - id: slo-sdwan-edges-availability
    type:
      api: slo
    config:
      name: SD-WAN edge inventory availability
      template: slo-availability.json
      parameters:
        serviceTag: app:sdwan-portal
        requestName: /api/v1/sdwan/edges*
        target: 99.0
        warning: 99.5
        timeframe: -28d
        mzName: Selfcare B2B

  - id: slo-ecom-checkout-latency
    type:
      api: slo
    config:
      name: eCom checkout P95 under 2s
      template: slo-latency.json
      parameters:
        serviceTag: app:ecom-gokinetic
        requestName: POST /api/v1/checkout
        thresholdMicros: 2000000
        target: 95
        warning: 97
        timeframe: -7d
        mzName: Selfcare B2C

  - id: slo-business-login-latency
    type:
      api: slo
    config:
      name: Business portal login P95 under 1.5s
      template: slo-latency.json
      parameters:
        serviceTag: app:gokinetic-business
        requestName: POST /api/v1/auth/login
        thresholdMicros: 1500000
        target: 95
        warning: 97
        timeframe: -7d
        mzName: Selfcare B2B
```

## observability/dynatrace/selfcare/slo/slo-availability.json

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/dynatrace/selfcare/slo/slo-availability.json`.

```json
{
  "name": "{{ .name }}",
  "enabled": true,
  "description": "Share of {{ .requestName }} requests that did not fail server-side (5xx or timeout).",
  "useRateMetric": false,
  "metricNumerator": "builtin:service.keyRequest.successCount:filter(and(in(\"dt.entity.service_method\",entitySelector(\"type(SERVICE_METHOD),entityName.equals(~\"{{ .requestName }}~\"),fromRelationships.isServiceMethodOfService(type(SERVICE),tag(~\"{{ .serviceTag }}~\"))\")))):splitBy()",
  "metricDenominator": "builtin:service.keyRequest.count.total:filter(and(in(\"dt.entity.service_method\",entitySelector(\"type(SERVICE_METHOD),entityName.equals(~\"{{ .requestName }}~\"),fromRelationships.isServiceMethodOfService(type(SERVICE),tag(~\"{{ .serviceTag }}~\"))\")))):splitBy()",
  "evaluationType": "AGGREGATE",
  "filter": "type(\"SERVICE\"),tag(\"{{ .serviceTag }}\"),mzName(\"{{ .mzName }}\")",
  "target": {{ .target }},
  "warning": {{ .warning }},
  "timeframe": "{{ .timeframe }}",
  "errorBudgetBurnRate": {
    "burnRateVisualizationEnabled": true,
    "fastBurnThreshold": 10
  }
}
```

## observability/dynatrace/selfcare/slo/slo-latency.json

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/dynatrace/selfcare/slo/slo-latency.json`.

```json
{
  "name": "{{ .name }}",
  "enabled": true,
  "description": "Share of {{ .requestName }} requests answered within {{ .thresholdMicros }} microseconds.",
  "metricExpression": "(100)*(builtin:service.keyRequest.response.server:filter(and(in(\"dt.entity.service_method\",entitySelector(\"type(SERVICE_METHOD),entityName.equals(~\"{{ .requestName }}~\"),fromRelationships.isServiceMethodOfService(type(SERVICE),tag(~\"{{ .serviceTag }}~\"))\")))):partition(\"latency\",value(\"good\",lt({{ .thresholdMicros }}))):splitBy():count:default(0))/(builtin:service.keyRequest.response.server:filter(and(in(\"dt.entity.service_method\",entitySelector(\"type(SERVICE_METHOD),entityName.equals(~\"{{ .requestName }}~\"),fromRelationships.isServiceMethodOfService(type(SERVICE),tag(~\"{{ .serviceTag }}~\"))\")))):splitBy():count)",
  "evaluationType": "AGGREGATE",
  "filter": "type(\"SERVICE\"),tag(\"{{ .serviceTag }}\"),mzName(\"{{ .mzName }}\")",
  "target": {{ .target }},
  "warning": {{ .warning }},
  "timeframe": "{{ .timeframe }}",
  "errorBudgetBurnRate": {
    "burnRateVisualizationEnabled": true,
    "fastBurnThreshold": 10
  }
}
```

## observability/dynatrace/selfcare/synthetic-monitor/browser-checkout.json

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/dynatrace/selfcare/synthetic-monitor/browser-checkout.json`.

```json
{
  "name": "{{ .monitorName }}",
  "frequencyMin": {{ .frequencyMin }},
  "enabled": true,
  "type": "BROWSER",
  "locations": [{{ range $i, $l := .locations }}{{ if $i }}, {{ end }}"{{ $l }}"{{ end }}],
  "tags": [{ "key": "app", "value": "{{ .appTag }}" }, { "key": "journey", "value": "checkout" }],
  "anomalyDetection": {
    "outageHandling": {
      "globalOutage": true,
      "globalOutagePolicy": { "consecutiveRuns": 2 },
      "localOutage": false
    },
    "loadingTimeThresholds": {
      "enabled": true,
      "thresholds": [{ "type": "TOTAL", "valueMs": 20000 }]
    }
  },
  "script": {
    "type": "clickpath",
    "version": "1.0",
    "configuration": {
      "device": { "deviceName": "Desktop", "orientation": "landscape" },
      "requestHeaders": { "headers": [{ "name": "X-Synthetic-Monitor", "value": "dynatrace" }] }
    },
    "events": [
      {
        "type": "navigate",
        "description": "Open shop",
        "url": "{{ .startUrl }}",
        "wait": { "waitFor": "page_complete" }
      },
      {
        "type": "keystrokes",
        "description": "Enter service address",
        "target": { "locators": [{ "type": "css", "value": "input[name='line1']" }] },
        "textValue": "{{ .serviceabilityAddress }}",
        "wait": { "waitFor": "time", "milliseconds": 200 }
      },
      {
        "type": "keystrokes",
        "description": "Enter ZIP",
        "target": { "locators": [{ "type": "css", "value": "input[name='postalCode']" }] },
        "textValue": "{{ .serviceabilityZip }}",
        "wait": { "waitFor": "time", "milliseconds": 200 }
      },
      {
        "type": "click",
        "description": "Check availability",
        "target": { "locators": [{ "type": "css", "value": "[data-testid='check-availability']" }] },
        "button": 0,
        "wait": { "waitFor": "element", "timeoutInMilliseconds": 15000,
                  "target": { "locators": [{ "type": "css", "value": "[data-testid='plan-card']" }] } }
      },
      {
        "type": "click",
        "description": "Choose first plan",
        "target": { "locators": [{ "type": "css", "value": "[data-testid='plan-card'] button" }] },
        "button": 0,
        "wait": { "waitFor": "element", "timeoutInMilliseconds": 10000,
                  "target": { "locators": [{ "type": "css", "value": "[data-testid='cart-summary']" }] } }
      },
      {
        "type": "click",
        "description": "Proceed to checkout",
        "target": { "locators": [{ "type": "css", "value": "[data-testid='go-to-checkout']" }] },
        "button": 0,
        "wait": { "waitFor": "element", "timeoutInMilliseconds": 15000,
                  "target": { "locators": [{ "type": "css", "value": "iframe[title*='payment']" }] } }
      },
      {
        "type": "javascript",
        "description": "Assert totals rendered from integer minor units",
        "javaScript": "var t = document.querySelector('[data-testid=\"due-today\"]'); if (!t || !/^\\$\\d{1,3}(,\\d{3})*\\.\\d{2}$/.test(t.textContent.trim())) { api.fail('Due-today total missing or malformed: ' + (t && t.textContent)); }",
        "wait": { "waitFor": "time", "milliseconds": 0 }
      }
    ]
  }
}
```

## observability/dynatrace/selfcare/synthetic-monitor/browser-login.json

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/dynatrace/selfcare/synthetic-monitor/browser-login.json`.

```json
{
  "name": "{{ .monitorName }}",
  "frequencyMin": {{ .frequencyMin }},
  "enabled": true,
  "type": "BROWSER",
  "locations": [{{ range $i, $l := .locations }}{{ if $i }}, {{ end }}"{{ $l }}"{{ end }}],
  "tags": [{ "key": "app", "value": "{{ .appTag }}" }, { "key": "journey", "value": "login" }],
  "anomalyDetection": {
    "outageHandling": {
      "globalOutage": true,
      "globalOutagePolicy": { "consecutiveRuns": 2 },
      "localOutage": true,
      "localOutagePolicy": { "affectedLocations": 1, "consecutiveRuns": 3 }
    },
    "loadingTimeThresholds": {
      "enabled": true,
      "thresholds": [{ "type": "TOTAL", "valueMs": 8000 }]
    }
  },
  "script": {
    "type": "clickpath",
    "version": "1.0",
    "configuration": {
      "device": { "deviceName": "Desktop", "orientation": "landscape" },
      "requestHeaders": { "headers": [{ "name": "X-Synthetic-Monitor", "value": "dynatrace" }] },
      "disableWebSecurity": false
    },
    "events": [
      {
        "type": "navigate",
        "description": "Open login page",
        "url": "{{ .startUrl }}",
        "wait": { "waitFor": "page_complete" },
        "validate": [{ "type": "content_match", "match": "Sign in", "failIfFound": false, "isRegex": false }]
      },
      {
        "type": "keystrokes",
        "description": "Enter email",
        "target": { "locators": [{ "type": "css", "value": "input[name='email']" }] },
        "credential": { "type": "USERNAME_PASSWORD", "field": "username", "id": "{{ .credentialId }}" },
        "wait": { "waitFor": "time", "milliseconds": 200 }
      },
      {
        "type": "keystrokes",
        "description": "Enter password",
        "target": { "locators": [{ "type": "css", "value": "input[name='password']" }] },
        "credential": { "type": "USERNAME_PASSWORD", "field": "password", "id": "{{ .credentialId }}" },
        "masked": true,
        "wait": { "waitFor": "time", "milliseconds": 200 }
      },
      {
        "type": "click",
        "description": "Submit sign-in",
        "target": { "locators": [{ "type": "css", "value": "button[type='submit']" }] },
        "button": 0,
        "wait": { "waitFor": "validation", "timeoutInMilliseconds": 15000,
                  "validation": { "type": "content_match", "match": "{{ .landingText }}", "failIfFound": false, "isRegex": false } }
      },
      {
        "type": "javascript",
        "description": "Fail if an error banner is visible",
        "javaScript": "if (document.querySelector('[role=\"alert\"].error')) { api.fail('Login error banner: ' + document.querySelector('[role=\"alert\"].error').textContent); }",
        "wait": { "waitFor": "time", "milliseconds": 0 }
      }
    ]
  }
}
```

## observability/dynatrace/selfcare/synthetic-monitor/config.yaml

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: yaml. Path: `observability/dynatrace/selfcare/synthetic-monitor/config.yaml`.

```yaml
# Browser clickpaths for the two journeys that matter most to revenue and
# support load. Test accounts are flagged `synthetic` in each app so their
# orders are auto-cancelled and excluded from the Snowflake marts.
configs:
  - id: syn-consumer-login
    type:
      api: synthetic-monitor
    config:
      name: GoKinetic consumer login
      template: browser-login.json
      parameters:
        monitorName: GoKinetic consumer login
        startUrl: https://www.gokinetic.com/account/login
        landingText: My account
        credentialId:
          type: environment
          name: DT_SYNTHETIC_CONSUMER_CREDENTIAL_ID
        frequencyMin: 5
        appTag: ecom-gokinetic
        locations:
          type: value
          value: [GEOLOCATION-9999453BE4BDB3CD, GEOLOCATION-95196F3C9A4F4215]

  - id: syn-business-login
    type:
      api: synthetic-monitor
    config:
      name: Business GoKinetic login
      template: browser-login.json
      parameters:
        monitorName: Business GoKinetic login
        startUrl: https://business.gokinetic.com/login
        landingText: Dashboard
        credentialId:
          type: environment
          name: DT_SYNTHETIC_BUSINESS_CREDENTIAL_ID
        frequencyMin: 10
        appTag: gokinetic-business
        locations:
          type: value
          value: [GEOLOCATION-9999453BE4BDB3CD]

  - id: syn-consumer-checkout
    type:
      api: synthetic-monitor
    config:
      name: GoKinetic checkout to payment step
      template: browser-checkout.json
      parameters:
        monitorName: GoKinetic checkout to payment step
        startUrl: https://www.gokinetic.com/shop
        serviceabilityAddress: 1 Synthetic Test Way
        serviceabilityZip: '36602'
        frequencyMin: 15
        appTag: ecom-gokinetic
        locations:
          type: value
          value: [GEOLOCATION-9999453BE4BDB3CD, GEOLOCATION-95196F3C9A4F4215]
```

## observability/kibana/saved-objects/selfcare-logs.ndjson

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/kibana/saved-objects/selfcare-logs.ndjson`.

```json
{"type":"index-pattern","id":"selfcare-logs","attributes":{"title":"selfcare-logs-*","timeFieldName":"ts","fields":"[]","fieldFormatMap":"{\"durationMs\":{\"id\":\"number\",\"params\":{\"pattern\":\"0,0.0 ms\"}},\"correlationId\":{\"id\":\"url\",\"params\":{\"urlTemplate\":\"/app/discover#/view/selfcare-trace?_a=(query:(language:kuery,query:'correlationId:\\\"{{value}}\\\"'))\",\"labelTemplate\":\"{{value}}\"}}}","runtimeFieldMap":"{\"status_class\":{\"type\":\"keyword\",\"script\":{\"source\":\"if (doc['status'].size() > 0) { emit((doc['status'].value / 100) + 'xx'); }\"}}}"},"references":[],"migrationVersion":{"index-pattern":"8.0.0"}}
{"type":"search","id":"selfcare-trace","attributes":{"title":"Selfcare - request trace by correlationId","description":"Every log line for one request across services. Open from any correlationId link.","columns":["service","level","msg","method","path","status","durationMs"],"sort":[["ts","asc"]],"kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"language\":\"kuery\",\"query\":\"correlationId:*\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"}},"references":[{"name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern","id":"selfcare-logs"}]}
{"type":"search","id":"selfcare-server-errors","attributes":{"title":"Selfcare - server errors","description":"5xx responses and error-level logs, newest first.","columns":["service","correlationId","path","status","msg","err.code"],"sort":[["ts","desc"]],"kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"language\":\"kuery\",\"query\":\"status >= 500 or level:error\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"}},"references":[{"name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern","id":"selfcare-logs"}]}
{"type":"search","id":"selfcare-p1-tickets","attributes":{"title":"Selfcare - P1 tickets opened","description":"ticket.created events at priority P1 from Uconnect and the chatbot escalation path.","columns":["service","accountId","ticketId","category","correlationId"],"sort":[["ts","desc"]],"kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"language\":\"kuery\",\"query\":\"msg:\\\"ticket.created\\\" and priority:P1\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"}},"references":[{"name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern","id":"selfcare-logs"}]}
{"type":"visualization","id":"selfcare-requests-by-status-class","attributes":{"title":"Requests by status class","visState":"{\"title\":\"Requests by status class\",\"type\":\"histogram\",\"params\":{\"type\":\"histogram\",\"addLegend\":true,\"legendPosition\":\"right\",\"seriesParams\":[{\"show\":true,\"type\":\"histogram\",\"mode\":\"stacked\",\"data\":{\"id\":\"1\",\"label\":\"Requests\"},\"valueAxis\":\"ValueAxis-1\"}]},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"schema\":\"metric\",\"params\":{}},{\"id\":\"2\",\"enabled\":true,\"type\":\"date_histogram\",\"schema\":\"segment\",\"params\":{\"field\":\"ts\",\"interval\":\"auto\",\"min_doc_count\":1}},{\"id\":\"3\",\"enabled\":true,\"type\":\"terms\",\"schema\":\"group\",\"params\":{\"field\":\"status_class\",\"size\":5,\"order\":\"desc\",\"orderBy\":\"1\"}}]}","uiStateJSON":"{\"vis\":{\"colors\":{\"2xx\":\"#54B399\",\"3xx\":\"#6092C0\",\"4xx\":\"#D6BF57\",\"5xx\":\"#E7664C\"}}}","description":"","kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"language\":\"kuery\",\"query\":\"status:*\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"}},"references":[{"name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern","id":"selfcare-logs"}]}
{"type":"visualization","id":"selfcare-5xx-rate-by-service","attributes":{"title":"5xx rate by service (%)","visState":"{\"title\":\"5xx rate by service (%)\",\"type\":\"timelion\",\"params\":{\"expression\":\".es(index=selfcare-logs-*, timefield=ts, q='status >= 500', split=service.keyword:12).divide(.es(index=selfcare-logs-*, timefield=ts, q='status:*', split=service.keyword:12)).multiply(100).label(regex='.*service.keyword:(.*) > .*', label='$1').lines(width=2)\",\"interval\":\"5m\"},\"aggs\":[]}","uiStateJSON":"{}","description":"Share of responses that were 5xx, per service, in 5-minute buckets.","kibanaSavedObjectMeta":{"searchSourceJSON":"{}"}},"references":[]}
{"type":"visualization","id":"selfcare-latency-p95-by-service","attributes":{"title":"P95 latency by service","visState":"{\"title\":\"P95 latency by service\",\"type\":\"line\",\"params\":{\"type\":\"line\",\"addLegend\":true,\"legendPosition\":\"right\"},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"percentiles\",\"schema\":\"metric\",\"params\":{\"field\":\"durationMs\",\"percents\":[95]}},{\"id\":\"2\",\"enabled\":true,\"type\":\"date_histogram\",\"schema\":\"segment\",\"params\":{\"field\":\"ts\",\"interval\":\"auto\",\"min_doc_count\":1}},{\"id\":\"3\",\"enabled\":true,\"type\":\"terms\",\"schema\":\"group\",\"params\":{\"field\":\"service.keyword\",\"size\":12,\"order\":\"desc\",\"orderBy\":\"_key\"}}]}","uiStateJSON":"{}","description":"","kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"language\":\"kuery\",\"query\":\"durationMs:*\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"}},"references":[{"name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern","id":"selfcare-logs"}]}
{"type":"visualization","id":"selfcare-top-error-codes","attributes":{"title":"Top problem codes","visState":"{\"title\":\"Top problem codes\",\"type\":\"table\",\"params\":{\"perPage\":10,\"showTotal\":true,\"totalFunc\":\"sum\"},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"schema\":\"metric\",\"params\":{}},{\"id\":\"2\",\"enabled\":true,\"type\":\"terms\",\"schema\":\"bucket\",\"params\":{\"field\":\"err.code.keyword\",\"size\":15,\"order\":\"desc\",\"orderBy\":\"1\",\"missingBucket\":false}},{\"id\":\"3\",\"enabled\":true,\"type\":\"terms\",\"schema\":\"bucket\",\"params\":{\"field\":\"service.keyword\",\"size\":5,\"order\":\"desc\",\"orderBy\":\"1\"}},{\"id\":\"4\",\"enabled\":true,\"type\":\"cardinality\",\"schema\":\"metric\",\"params\":{\"field\":\"correlationId.keyword\",\"customLabel\":\"Distinct requests\"}}]}","uiStateJSON":"{}","description":"RFC 7807 `code` values from problem responses.","kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"language\":\"kuery\",\"query\":\"status >= 400\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"}},"references":[{"name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern","id":"selfcare-logs"}]}
{"type":"visualization","id":"selfcare-tickets-by-priority","attributes":{"title":"Tickets opened by priority","visState":"{\"title\":\"Tickets opened by priority\",\"type\":\"histogram\",\"params\":{\"type\":\"histogram\",\"addLegend\":true,\"legendPosition\":\"right\"},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"schema\":\"metric\",\"params\":{}},{\"id\":\"2\",\"enabled\":true,\"type\":\"date_histogram\",\"schema\":\"segment\",\"params\":{\"field\":\"ts\",\"interval\":\"1h\",\"min_doc_count\":0}},{\"id\":\"3\",\"enabled\":true,\"type\":\"terms\",\"schema\":\"group\",\"params\":{\"field\":\"priority.keyword\",\"size\":4,\"order\":\"asc\",\"orderBy\":\"_key\"}}]}","uiStateJSON":"{\"vis\":{\"colors\":{\"P1\":\"#E7664C\",\"P2\":\"#D6BF57\",\"P3\":\"#6092C0\",\"P4\":\"#AAAAAA\"}}}","description":"","kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"language\":\"kuery\",\"query\":\"msg:\\\"ticket.created\\\"\"},\"filter\":[],\"indexRefName\":\"kibanaSavedObjectMeta.searchSourceJSON.index\"}"}},"references":[{"name":"kibanaSavedObjectMeta.searchSourceJSON.index","type":"index-pattern","id":"selfcare-logs"}]}
{"type":"dashboard","id":"selfcare-operations","attributes":{"title":"Selfcare - API operations","description":"Request health, latency, problem codes and support load across all portals. Click a correlationId in the error table to see the full cross-service trace.","timeRestore":true,"timeFrom":"now-24h","timeTo":"now","refreshInterval":{"pause":false,"value":60000},"optionsJSON":"{\"useMargins\":true,\"syncColors\":true,\"hidePanelTitles\":false}","panelsJSON":"[{\"panelIndex\":\"1\",\"gridData\":{\"x\":0,\"y\":0,\"w\":24,\"h\":12,\"i\":\"1\"},\"panelRefName\":\"panel_0\"},{\"panelIndex\":\"2\",\"gridData\":{\"x\":24,\"y\":0,\"w\":24,\"h\":12,\"i\":\"2\"},\"panelRefName\":\"panel_1\"},{\"panelIndex\":\"3\",\"gridData\":{\"x\":0,\"y\":12,\"w\":24,\"h\":12,\"i\":\"3\"},\"panelRefName\":\"panel_2\"},{\"panelIndex\":\"4\",\"gridData\":{\"x\":24,\"y\":12,\"w\":24,\"h\":12,\"i\":\"4\"},\"panelRefName\":\"panel_3\"},{\"panelIndex\":\"5\",\"gridData\":{\"x\":0,\"y\":24,\"w\":24,\"h\":12,\"i\":\"5\"},\"panelRefName\":\"panel_4\"},{\"panelIndex\":\"6\",\"gridData\":{\"x\":24,\"y\":24,\"w\":24,\"h\":12,\"i\":\"6\"},\"panelRefName\":\"panel_5\"},{\"panelIndex\":\"7\",\"gridData\":{\"x\":0,\"y\":36,\"w\":48,\"h\":15,\"i\":\"7\"},\"panelRefName\":\"panel_6\"}]","kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"language\":\"kuery\",\"query\":\"\"},\"filter\":[]}"}},"references":[{"name":"panel_0","type":"visualization","id":"selfcare-requests-by-status-class"},{"name":"panel_1","type":"visualization","id":"selfcare-5xx-rate-by-service"},{"name":"panel_2","type":"visualization","id":"selfcare-latency-p95-by-service"},{"name":"panel_3","type":"visualization","id":"selfcare-top-error-codes"},{"name":"panel_4","type":"visualization","id":"selfcare-tickets-by-priority"},{"name":"panel_5","type":"search","id":"selfcare-p1-tickets"},{"name":"panel_6","type":"search","id":"selfcare-server-errors"}]}
```

## observability/kibana/watchers/selfcare-5xx-rate.json

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/kibana/watchers/selfcare-5xx-rate.json`.

```json
{
  "metadata": {
    "description": "Pages when any self-care service returns more than 2% 5xx over 5 minutes with at least 50 requests.",
    "threshold_pct": 2,
    "min_requests": 50,
    "runbook": "observability/runbooks/selfcare-incident-runbook.md#elevated-5xx-rate"
  },
  "trigger": {
    "schedule": { "interval": "1m" }
  },
  "input": {
    "search": {
      "request": {
        "indices": ["selfcare-logs-*"],
        "body": {
          "size": 0,
          "query": {
            "bool": {
              "filter": [
                { "range": { "ts": { "gte": "now-5m" } } },
                { "exists": { "field": "status" } }
              ]
            }
          },
          "aggs": {
            "by_service": {
              "terms": { "field": "service.keyword", "size": 25 },
              "aggs": {
                "server_errors": { "filter": { "range": { "status": { "gte": 500 } } } },
                "sample_correlation_ids": {
                  "filter": { "range": { "status": { "gte": 500 } } },
                  "aggs": {
                    "ids": { "terms": { "field": "correlationId.keyword", "size": 5 } },
                    "paths": { "terms": { "field": "path.keyword", "size": 3 } }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "condition": {
    "script": {
      "lang": "painless",
      "source": "for (b in ctx.payload.aggregations.by_service.buckets) { if (b.doc_count >= ctx.metadata.min_requests && b.server_errors.doc_count * 100.0 / b.doc_count > ctx.metadata.threshold_pct) { return true; } } return false;"
    }
  },
  "transform": {
    "script": {
      "lang": "painless",
      "source": "def breaching = []; for (b in ctx.payload.aggregations.by_service.buckets) { if (b.doc_count >= ctx.metadata.min_requests) { double pct = b.server_errors.doc_count * 100.0 / b.doc_count; if (pct > ctx.metadata.threshold_pct) { breaching.add(['service': b.key, 'requests': b.doc_count, 'errors': b.server_errors.doc_count, 'pct': Math.round(pct * 10) / 10.0, 'correlationIds': b.sample_correlation_ids.ids.buckets.collect(x -> x.key), 'paths': b.sample_correlation_ids.paths.buckets.collect(x -> x.key)]); } } } return ['breaching': breaching];"
    }
  },
  "throttle_period": "15m",
  "actions": {
    "pagerduty": {
      "pagerduty": {
        "account": "selfcare-oncall",
        "event": {
          "description": "Selfcare 5xx rate above {{ctx.metadata.threshold_pct}}%: {{#ctx.payload.breaching}}{{service}} {{pct}}% ({{errors}}/{{requests}}) {{/ctx.payload.breaching}}",
          "event_type": "trigger",
          "incident_key": "selfcare-5xx-{{ctx.watch_id}}",
          "client": "Kibana Watcher",
          "context": [
            { "type": "link", "href": "https://kibana.uniti.com/app/dashboards#/view/selfcare-operations", "text": "Operations dashboard" }
          ]
        }
      }
    },
    "slack": {
      "slack": {
        "account": "uniti-ops",
        "message": {
          "to": ["#selfcare-alerts"],
          "text": "5xx rate breach (last 5m)",
          "attachments": [
            {
              "color": "danger",
              "title": "{{#ctx.payload.breaching}}{{service}}: {{pct}}% {{/ctx.payload.breaching}}",
              "text": "{{#ctx.payload.breaching}}*{{service}}* paths: {{paths}} | sample correlationIds: {{correlationIds}}\n{{/ctx.payload.breaching}}Runbook: {{ctx.metadata.runbook}}"
            }
          ]
        }
      }
    }
  }
}
```

## observability/kibana/watchers/selfcare-p1-ticket-spike.json

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: json. Path: `observability/kibana/watchers/selfcare-p1-ticket-spike.json`.

```json
{
  "metadata": {
    "description": "Detects a burst of P1 tickets, which usually means a network outage customers noticed before monitoring did. Fires when the last 15 minutes exceed both an absolute floor and 3x the same-window average over the previous 7 days.",
    "min_count": 5,
    "multiplier": 3,
    "runbook": "observability/runbooks/selfcare-incident-runbook.md#p1-ticket-spike"
  },
  "trigger": {
    "schedule": { "interval": "5m" }
  },
  "input": {
    "chain": {
      "inputs": [
        {
          "current": {
            "search": {
              "request": {
                "indices": ["selfcare-logs-*"],
                "body": {
                  "size": 0,
                  "track_total_hits": true,
                  "query": {
                    "bool": {
                      "filter": [
                        { "range": { "ts": { "gte": "now-15m" } } },
                        { "term": { "msg.keyword": "ticket.created" } },
                        { "term": { "priority.keyword": "P1" } }
                      ]
                    }
                  },
                  "aggs": {
                    "categories": { "terms": { "field": "category.keyword", "size": 5 } },
                    "postcodes": { "terms": { "field": "serviceZip5.keyword", "size": 5 } }
                  }
                }
              }
            }
          }
        },
        {
          "baseline": {
            "search": {
              "request": {
                "indices": ["selfcare-logs-*"],
                "body": {
                  "size": 0,
                  "track_total_hits": true,
                  "query": {
                    "bool": {
                      "filter": [
                        { "range": { "ts": { "gte": "now-7d", "lt": "now-15m" } } },
                        { "term": { "msg.keyword": "ticket.created" } },
                        { "term": { "priority.keyword": "P1" } }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      ]
    }
  },
  "condition": {
    "script": {
      "lang": "painless",
      "source": "long current = ctx.payload.current.hits.total.value; double windows = (7 * 24 * 60 - 15) / 15.0; double baseline = ctx.payload.baseline.hits.total.value / windows; return current >= ctx.metadata.min_count && current > baseline * ctx.metadata.multiplier;"
    }
  },
  "throttle_period": "30m",
  "actions": {
    "slack": {
      "slack": {
        "account": "uniti-ops",
        "message": {
          "to": ["#selfcare-alerts", "#noc"],
          "text": "P1 ticket spike: {{ctx.payload.current.hits.total.value}} in 15m",
          "attachments": [
            {
              "color": "danger",
              "text": "Top categories: {{#ctx.payload.current.aggregations.categories.buckets}}{{key}} ({{doc_count}}) {{/ctx.payload.current.aggregations.categories.buckets}}\nTop ZIPs: {{#ctx.payload.current.aggregations.postcodes.buckets}}{{key}} ({{doc_count}}) {{/ctx.payload.current.aggregations.postcodes.buckets}}\nRunbook: {{ctx.metadata.runbook}}"
            }
          ]
        }
      }
    },
    "index_event": {
      "index": {
        "index": "selfcare-alert-history",
        "execution_time_field": "triggered_at"
      }
    }
  }
}
```

## observability/runbooks/selfcare-incident-runbook.md

Application: Monitoring and alerting. Stack: Dynatrace, Kibana. Language: markdown. Path: `observability/runbooks/selfcare-incident-runbook.md`.

```markdown
# Self-care incident runbook

Applies to every portal under `apps/`. Each section matches an alert's `runbook` link.

## First five minutes

1. Acknowledge the page (PagerDuty `selfcare-oncall`) and post in `#selfcare-incidents`: alert name, start time, who is driving.
2. Open the Dynatrace problem. Its management zone (Selfcare B2C / B2B / Partners) tells you the owning team.
3. Open Kibana **Selfcare - API operations** for the same window. Check which services, routes and problem `code`s are involved.
4. Pick one failing request's `correlationId` and open **Selfcare - request trace by correlationId**. Every service logs the same ID (`X-Correlation-Id`), so this shows the whole call chain and which hop failed first.
5. Decide severity: SEV1 if checkout, login or payments fail for more than 5% of users, otherwise SEV2. Start a status page incident for SEV1.

## Elevated 5xx rate

Watcher `selfcare-5xx-rate`: more than 2% 5xx over 5 minutes, at least 50 requests.

- **One service, one route**: usually a dependency. Look for `err.code` values such as `UPSTREAM_TIMEOUT` or `PAYMENT_GATEWAY_UNAVAILABLE` in the trace. Check the dependency's Dynatrace service page and its status page.
- **One service, every route**: check for a recent deployment (Dynatrace deployment events on the process group). Roll back first and investigate after.
- **Many services**: suspect shared infrastructure, such as the identity provider (401/5xx on token validation), the database cluster or the ingress. Check the Dynatrace host and network views.
- SD-WAN `502 ControllerUnavailable` means VeloCloud Orchestrator or FortiManager is down. Raise it with the vendor and set the portal banner. We can't fix this ourselves.

Close the incident once the rate has stayed below 0.5% for 15 minutes.

## Checkout failures

Synthetic monitor `GoKinetic checkout to payment step` or SLO `eCom checkout availability`.

- `402` responses are declines and normal in small numbers. A rising decline rate with a single `failureCode` means a gateway problem, not a customer problem.
- If orders stay in `DRAFT`, the checkout service could not authorise. Check `paymentGatewayClient` logs for that correlationId.
- Never retry a checkout by hand. The API is idempotent on `Idempotency-Key`, so ask the customer to resubmit from the same browser session.

## Login failures

Synthetic monitors `GoKinetic consumer login` / `Business GoKinetic login`.

- Run the same journey by hand in a private window. If that works, the synthetic credential is probably expired. Rotate it in the Dynatrace credential vault (`DT_SYNTHETIC_*_CREDENTIAL_ID`).
- If it fails for real, check the OIDC provider status and the JWKS endpoint. A rotated signing key that hasn't propagated shows up as a wave of 401s across every API at once.

## P1 ticket spike

Watcher `selfcare-p1-ticket-spike`: at least 5 P1 tickets in 15 minutes and more than 3x the 7-day baseline.

1. Look at the top categories and ZIP codes in the alert. A cluster of `FAULT` tickets in a few ZIPs usually means a fibre cut or OLT outage.
2. Check with the NOC (`#noc`) and get an outage declared in Uconnect so customers see it and compensation runs (`OutageCompensationPolicy`).
3. Once the outage is declared, tell support agents to link new tickets to it rather than triaging them one by one.

## SLO burn

When Dynatrace raises `SLO ... error budget burn rate`:

- A fast burn (10x or more) gets the same response as the matching incident above.
- For a slow burn, open a ticket for the owning team. During business hours, review the change log for the last 7 days.

## Data freshness

Snowflake alert `ALR_INGEST_HEALTH` (email to data-platform on-call).

1. Run `SHOW TASKS IN SCHEMA UNITI_RAW.INGEST;`. A task in `suspended` state has failed 3 times. Check `TABLE(INFORMATION_SCHEMA.TASK_HISTORY())` for the error, fix it, then `ALTER TASK ... RESUME`.
2. Run `SELECT SYSTEM$PIPE_STATUS('UNITI_RAW.INGEST.PIPE_<NAME>');` and look for `executionState` and `lastIngestedTimestamp`. A pipe with errors skips the whole file (`ON_ERROR = SKIP_FILE`). Fix the producer, then reload the file with `COPY INTO ... FILES = (...)`.
3. Run `SHOW STREAMS IN DATABASE UNITI_RAW;`. If `stale = true`, the stream's offset is lost. Recreate the stream and backfill the `_CURRENT` table from the full `_CDC` table with `MERGE_LATEST`.
4. Once data is current, re-run `dbt build --select source:ecom+ source:uconnect+`.

## After the incident

Write a post-incident review within 5 working days. Include the timeline, the correlationIds used during diagnosis, customer impact (orders and tickets affected, from the Snowflake marts) and follow-up actions with owners.
```
