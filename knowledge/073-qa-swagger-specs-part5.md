# QA automation and API specs: qa/swagger/specs (part 5 of 5)

- **Application:** QA automation and API specs
- **Tech stack:** Playwright, Selenium (Java), Postman, Swagger/OpenAPI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 3

## Files

- `qa/swagger/specs/iconnect-wholesale-orders.yaml` (374 lines)
- `qa/swagger/specs/sdwan-edges.yaml` (325 lines)
- `qa/swagger/specs/uconnect-accounts-billing.yaml` (427 lines)

## qa/swagger/specs/iconnect-wholesale-orders.yaml

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: yaml. Path: `qa/swagger/specs/iconnect-wholesale-orders.yaml`.

```yaml
openapi: 3.0.3
info:
  title: iConnect Wholesale - Orders API
  version: 1.2.0
  description: >
    Wholesale ordering for partners (WHOLESALE_BUYER). Orders are placed against a
    premise UPRN and tracked against a working-hours delivery SLA. Placement is
    idempotent on `Idempotency-Key`; a replay returns 200 with the original order.
servers:
  - url: https://iconnect-api.uniti.com
  - url: https://iconnect-api.sandbox.uniti.com
    description: Partner sandbox
security:
  - bearerAuth: []
tags:
  - name: Orders

paths:
  /api/v1/wholesale/orders:
    get:
      tags: [Orders]
      operationId: listWholesaleOrders
      parameters:
        - $ref: './common.yaml#/components/parameters/Page'
        - $ref: './common.yaml#/components/parameters/PageSize'
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/OrderStatus'
        - name: partnerReference
          in: query
          schema:
            type: string
            maxLength: 64
        - name: slaStatus
          in: query
          schema:
            $ref: '#/components/schemas/SlaStatus'
      responses:
        '200':
          description: Page of orders for the caller's partner.
          content:
            application/json:
              schema:
                allOf:
                  - $ref: './common.yaml#/components/schemas/PageMeta'
                  - type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/OrderSummary'
        '401':
          $ref: './common.yaml#/components/responses/Unauthorized'
    post:
      tags: [Orders]
      operationId: placeWholesaleOrder
      parameters:
        - $ref: './common.yaml#/components/parameters/IdempotencyKey'
        - $ref: './common.yaml#/components/parameters/CorrelationId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PlaceOrderRequest'
      responses:
        '200':
          description: Idempotent replay; the existing order is returned.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderDetail'
        '201':
          description: Order created.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderDetail'
        '400':
          $ref: './common.yaml#/components/responses/BadRequest'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'
        '422':
          description: >
            Premise not serviceable, product not orderable at the premise, or an
            invalid migration auth code.
          content:
            application/problem+json:
              schema:
                $ref: './common.yaml#/components/schemas/ProblemDetails'
        '429':
          $ref: './common.yaml#/components/responses/TooManyRequests'

  /api/v1/wholesale/orders/{orderId}:
    parameters:
      - $ref: '#/components/parameters/OrderId'
    get:
      tags: [Orders]
      operationId: getWholesaleOrder
      responses:
        '200':
          description: Order with SLA clock, charges and history.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderDetail'
        '404':
          $ref: './common.yaml#/components/responses/NotFound'
    patch:
      tags: [Orders]
      operationId: amendWholesaleOrder
      summary: Move the requested date while the order is amendable
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [requestedDate]
              properties:
                requestedDate:
                  type: string
                  format: date
      responses:
        '200':
          description: Amended order.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderDetail'
        '409':
          $ref: './common.yaml#/components/responses/Conflict'
        '422':
          $ref: './common.yaml#/components/responses/UnprocessableEntity'

  /api/v1/wholesale/orders/{orderId}/cancel:
    parameters:
      - $ref: '#/components/parameters/OrderId'
    post:
      tags: [Orders]
      operationId: cancelWholesaleOrder
      description: A cancellation charge applies once the order has reached PROVISIONING.
      requestBody:
        $ref: '#/components/requestBodies/Reason'
      responses:
        '200':
          description: Cancelled order including any cancellation charge.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderDetail'
        '409':
          $ref: './common.yaml#/components/responses/Conflict'

  /api/v1/wholesale/orders/{orderId}/hold:
    parameters:
      - $ref: '#/components/parameters/OrderId'
    post:
      tags: [Orders]
      operationId: holdWholesaleOrder
      summary: Pause the SLA clock (SUPPORT_AGENT only)
      requestBody:
        $ref: '#/components/requestBodies/Reason'
      responses:
        '200':
          description: Order placed on hold.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/OrderDetail'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'
        '409':
          $ref: './common.yaml#/components/responses/Conflict'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: Client-credentials token issued per partner; role WHOLESALE_BUYER or SUPPORT_AGENT.

  parameters:
    OrderId:
      name: orderId
      in: path
      required: true
      schema:
        type: string
        format: uuid

  requestBodies:
    Reason:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [reason]
            properties:
              reason:
                type: string
                minLength: 3
                maxLength: 500

  schemas:
    OrderStatus:
      type: string
      enum: [DRAFT, SUBMITTED, VALIDATED, PROVISIONING, ACTIVE, CANCELLED, FAILED]

    SlaStatus:
      type: string
      enum: [OnTrack, AtRisk, Breached, Paused, Met]

    PlaceOrderRequest:
      type: object
      required: [partnerReference, orderType, uprn, requestedDate]
      additionalProperties: false
      properties:
        partnerReference:
          type: string
          minLength: 1
          maxLength: 64
        orderType:
          type: string
          enum: [PROVIDE, MODIFY, CEASE, MIGRATE]
        uprn:
          type: string
          pattern: '^\d{1,12}$'
          description: Unique Property Reference Number of the premise.
        productCode:
          type: string
          description: Required for PROVIDE, MODIFY and MIGRATE.
        careLevel:
          type: string
          enum: [STANDARD, ENHANCED, PREMIUM]
        existingServiceId:
          type: string
          format: uuid
          description: Required for MODIFY and CEASE.
        migrationAuthCode:
          type: string
          description: Losing-provider authorisation code; required for MIGRATE.
        requestedDate:
          type: string
          format: date

    OrderSummary:
      type: object
      required: [id, reference, partnerReference, type, status, uprn, requestedDate, onHold, createdAt]
      properties:
        id:
          type: string
          format: uuid
        reference:
          type: string
          example: WHO-0001842
        partnerReference:
          type: string
        type:
          type: string
          enum: [PROVIDE, MODIFY, CEASE, MIGRATE]
        status:
          $ref: '#/components/schemas/OrderStatus'
        uprn:
          type: string
        productCode:
          type: string
          nullable: true
        requestedDate:
          type: string
          format: date
        committedDate:
          type: string
          format: date
          nullable: true
        onHold:
          type: boolean
        slaStatus:
          allOf:
            - $ref: '#/components/schemas/SlaStatus'
          nullable: true
        createdAt:
          $ref: './common.yaml#/components/schemas/Timestamp'

    OrderDetail:
      allOf:
        - $ref: '#/components/schemas/OrderSummary'
        - type: object
          required: [careLevel, currency, allowedActions, history]
          properties:
            careLevel:
              type: string
            existingServiceId:
              type: string
              format: uuid
              nullable: true
            resultingServiceId:
              type: string
              format: uuid
              nullable: true
            completedDate:
              type: string
              format: date
              nullable: true
            monthlyRentalMinor:
              type: integer
              format: int64
              nullable: true
            oneOffChargeMinor:
              type: integer
              format: int64
              nullable: true
            cancellationChargeMinor:
              type: integer
              format: int64
              nullable: true
            currency:
              type: string
              pattern: '^[A-Z]{3}$'
            failureReason:
              type: string
              nullable: true
            holdReason:
              type: string
              nullable: true
            sla:
              type: object
              nullable: true
              required: [status, elapsedWorkingHours, targetWorkingHours, workingDaysLate]
              properties:
                status:
                  $ref: '#/components/schemas/SlaStatus'
                elapsedWorkingHours:
                  type: number
                  format: double
                targetWorkingHours:
                  type: number
                  format: double
                dueAt:
                  allOf:
                    - $ref: './common.yaml#/components/schemas/Timestamp'
                  nullable: true
                workingDaysLate:
                  type: integer
                  minimum: 0
            allowedActions:
              type: array
              description: Actions the caller may take now; the server re-checks on execution.
              items:
                type: string
                enum: [cancel, amend, book-appointment, hold, release-hold, start-provisioning, complete, reject]
            history:
              type: array
              items:
                type: object
                required: [to, at, note]
                properties:
                  from:
                    type: string
                    nullable: true
                  to:
                    type: string
                  at:
                    $ref: './common.yaml#/components/schemas/Timestamp'
                  note:
                    type: string
                  actor:
                    type: string
                    nullable: true
```

## qa/swagger/specs/sdwan-edges.yaml

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: yaml. Path: `qa/swagger/specs/sdwan-edges.yaml`.

```yaml
openapi: 3.0.3
info:
  title: SD-WAN Portal - Sites & Edges API
  version: 1.3.0
  description: >
    Vendor-neutral view of SD-WAN sites, edges and WAN link health across
    VeloCloud and Fortinet controllers. `vendor` is the only vendor-specific field
    exposed; everything else is normalised by the provider adapters.
servers:
  - url: https://sdwan-api.uniti.com
security:
  - bearerAuth: []
tags:
  - name: Sites
  - name: Edges

paths:
  /api/v1/sdwan/sites:
    get:
      tags: [Sites]
      operationId: listSites
      parameters:
        - name: accountId
          in: query
          required: true
          schema:
            $ref: './common.yaml#/components/schemas/AccountId'
        - $ref: './common.yaml#/components/parameters/Page'
        - $ref: './common.yaml#/components/parameters/PageSize'
        - name: vendor
          in: query
          schema:
            $ref: '#/components/schemas/Vendor'
      responses:
        '200':
          description: Page of sites.
          content:
            application/json:
              schema:
                allOf:
                  - $ref: './common.yaml#/components/schemas/PageMeta'
                  - type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/Site'
        '400':
          $ref: './common.yaml#/components/responses/BadRequest'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'

  /api/v1/sdwan/edges:
    get:
      tags: [Edges]
      operationId: listEdges
      parameters:
        - name: accountId
          in: query
          required: true
          schema:
            $ref: './common.yaml#/components/schemas/AccountId'
        - name: siteId
          in: query
          schema:
            type: string
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/EdgeStatus'
        - $ref: './common.yaml#/components/parameters/Page'
        - $ref: './common.yaml#/components/parameters/PageSize'
      responses:
        '200':
          description: Page of edges with their WAN links.
          content:
            application/json:
              schema:
                allOf:
                  - $ref: './common.yaml#/components/schemas/PageMeta'
                  - type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/Edge'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'
        '502':
          $ref: '#/components/responses/ControllerUnavailable'

  /api/v1/sdwan/edges/{edgeId}:
    parameters:
      - $ref: '#/components/parameters/EdgeId'
    get:
      tags: [Edges]
      operationId: getEdge
      responses:
        '200':
          description: The edge.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Edge'
        '404':
          $ref: './common.yaml#/components/responses/NotFound'
        '502':
          $ref: '#/components/responses/ControllerUnavailable'

  /api/v1/sdwan/edges/{edgeId}/health:
    parameters:
      - $ref: '#/components/parameters/EdgeId'
    get:
      tags: [Edges]
      operationId: getEdgeHealth
      summary: Aggregated per-link quality over a time range
      parameters:
        - name: from
          in: query
          required: true
          schema:
            $ref: './common.yaml#/components/schemas/Timestamp'
        - name: to
          in: query
          required: true
          schema:
            $ref: './common.yaml#/components/schemas/Timestamp'
        - name: bucket
          in: query
          schema:
            type: string
            enum: [5m, 1h, 1d]
            default: 1h
      responses:
        '200':
          description: Link health series and a 0-100 score per link.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EdgeHealth'
        '400':
          description: Range is inverted or exceeds 31 days.
          content:
            application/problem+json:
              schema:
                $ref: './common.yaml#/components/schemas/ValidationProblem'
        '404':
          $ref: './common.yaml#/components/responses/NotFound'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: Roles BUSINESS_ADMIN, BUSINESS_USER, PARTNER_ADMIN, PARTNER_AGENT, SUPPORT_AGENT.

  parameters:
    EdgeId:
      name: edgeId
      in: path
      required: true
      schema:
        type: string
        minLength: 1
        maxLength: 64

  responses:
    ControllerUnavailable:
      description: The upstream VeloCloud Orchestrator or FortiManager failed or timed out.
      content:
        application/problem+json:
          schema:
            $ref: './common.yaml#/components/schemas/ProblemDetails'

  schemas:
    Vendor:
      type: string
      enum: [VELOCLOUD, FORTINET]

    EdgeStatus:
      type: string
      enum: [UP, DEGRADED, DOWN, UNKNOWN]

    Site:
      type: object
      required: [id, accountId, name, address, vendor, edgeIds]
      properties:
        id:
          type: string
        accountId:
          $ref: './common.yaml#/components/schemas/AccountId'
        name:
          type: string
        address:
          type: object
          required: [line1, city, postcode, country]
          properties:
            line1:
              type: string
            city:
              type: string
            postcode:
              type: string
            country:
              type: string
              pattern: '^[A-Z]{2}$'
        vendor:
          $ref: '#/components/schemas/Vendor'
        region:
          type: string
        edgeIds:
          type: array
          items:
            type: string

    WanLink:
      type: object
      required: [id, name, interface, transport, bandwidthDownKbps, bandwidthUpKbps, state]
      properties:
        id:
          type: string
        name:
          type: string
        interface:
          type: string
          example: GE3
        transport:
          type: string
          enum: [FIBRE, BROADBAND, LTE, MPLS, UNKNOWN]
        ispName:
          type: string
        publicIp:
          type: string
          format: ipv4
        bandwidthDownKbps:
          type: integer
          minimum: 0
        bandwidthUpKbps:
          type: integer
          minimum: 0
        state:
          type: string
          enum: [UP, DOWN, STANDBY, UNKNOWN]

    Edge:
      type: object
      required: [id, siteId, accountId, vendor, name, model, serialNumber, softwareVersion, status, haState, links]
      properties:
        id:
          type: string
        siteId:
          type: string
        accountId:
          $ref: './common.yaml#/components/schemas/AccountId'
        vendor:
          $ref: '#/components/schemas/Vendor'
        name:
          type: string
        model:
          type: string
          example: Edge 610
        serialNumber:
          type: string
        softwareVersion:
          type: string
        status:
          $ref: '#/components/schemas/EdgeStatus'
        haState:
          type: string
          enum: [STANDALONE, ACTIVE, STANDBY, FAILED]
        lastContact:
          $ref: './common.yaml#/components/schemas/Timestamp'
        links:
          type: array
          items:
            $ref: '#/components/schemas/WanLink'

    EdgeHealth:
      type: object
      required: [edgeId, from, to, bucket, links]
      properties:
        edgeId:
          type: string
        from:
          $ref: './common.yaml#/components/schemas/Timestamp'
        to:
          $ref: './common.yaml#/components/schemas/Timestamp'
        bucket:
          type: string
        links:
          type: array
          items:
            type: object
            required: [linkId, score, series]
            properties:
              linkId:
                type: string
              score:
                type: integer
                minimum: 0
                maximum: 100
              series:
                type: array
                items:
                  type: object
                  required: [timestamp, latencyMs, jitterMs, lossPct]
                  properties:
                    timestamp:
                      $ref: './common.yaml#/components/schemas/Timestamp'
                    latencyMs:
                      type: number
                    jitterMs:
                      type: number
                    lossPct:
                      type: number
                      minimum: 0
                      maximum: 100
                    rxBps:
                      type: integer
                    txBps:
                      type: integer
```

## qa/swagger/specs/uconnect-accounts-billing.yaml

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: yaml. Path: `qa/swagger/specs/uconnect-accounts-billing.yaml`.

```yaml
openapi: 3.0.3
info:
  title: Uconnect - Accounts & Billing API
  version: 2.1.0
  description: >
    Account profile, service inventory, invoices and payments for consumer and
    business accounts. Consumers only see their own account; BUSINESS_ADMIN and
    BUSINESS_USER see accounts they are linked to; SUPPORT_AGENT sees all.
servers:
  - url: https://uconnect-api.uniti.com
  - url: https://uconnect-api.staging.uniti.com
security:
  - bearerAuth: []
tags:
  - name: Accounts
  - name: Invoices
  - name: Payments

paths:
  /api/v1/accounts/{accountId}:
    parameters:
      - $ref: './common.yaml#/components/parameters/AccountIdPath'
      - $ref: './common.yaml#/components/parameters/CorrelationId'
    get:
      tags: [Accounts]
      operationId: getAccount
      summary: Account profile with balance and autopay state
      responses:
        '200':
          description: The account.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Account'
        '401':
          $ref: './common.yaml#/components/responses/Unauthorized'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'
        '404':
          $ref: './common.yaml#/components/responses/NotFound'
    patch:
      tags: [Accounts]
      operationId: updateAccountProfile
      summary: Update contact details (BUSINESS_ADMIN, CONSUMER owner)
      requestBody:
        required: true
        content:
          application/merge-patch+json:
            schema:
              type: object
              minProperties: 1
              additionalProperties: false
              properties:
                displayName:
                  type: string
                  maxLength: 120
                contactEmail:
                  type: string
                  format: email
                contactPhone:
                  type: string
                  maxLength: 20
                billingAddress:
                  $ref: './common.yaml#/components/schemas/PostalAddress'
                paperlessBilling:
                  type: boolean
      responses:
        '200':
          description: Updated account.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Account'
        '400':
          $ref: './common.yaml#/components/responses/BadRequest'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'

  /api/v1/accounts/{accountId}/services:
    parameters:
      - $ref: './common.yaml#/components/parameters/AccountIdPath'
    get:
      tags: [Accounts]
      operationId: listServices
      parameters:
        - $ref: './common.yaml#/components/parameters/Page'
        - $ref: './common.yaml#/components/parameters/PageSize'
        - name: status
          in: query
          schema:
            type: string
            enum: [PENDING_ACTIVATION, ACTIVE, SUSPENDED, CANCELLED]
      responses:
        '200':
          description: Page of services.
          content:
            application/json:
              schema:
                allOf:
                  - $ref: './common.yaml#/components/schemas/PageMeta'
                  - type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/Service'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'

  /api/v1/accounts/{accountId}/invoices:
    parameters:
      - $ref: './common.yaml#/components/parameters/AccountIdPath'
    get:
      tags: [Invoices]
      operationId: listInvoices
      parameters:
        - $ref: './common.yaml#/components/parameters/Page'
        - $ref: './common.yaml#/components/parameters/PageSize'
        - name: status
          in: query
          schema:
            $ref: '#/components/schemas/InvoiceStatus'
        - name: issuedFrom
          in: query
          schema:
            type: string
            format: date
      responses:
        '200':
          description: Page of invoices, newest billing period first.
          content:
            application/json:
              schema:
                allOf:
                  - $ref: './common.yaml#/components/schemas/PageMeta'
                  - type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/Invoice'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'

  /api/v1/invoices/{invoiceId}/pdf:
    get:
      tags: [Invoices]
      operationId: downloadInvoicePdf
      parameters:
        - name: invoiceId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Rendered invoice.
          content:
            application/pdf:
              schema:
                type: string
                format: binary
        '404':
          $ref: './common.yaml#/components/responses/NotFound'
        '409':
          description: Invoice is still DRAFT and has no PDF.
          content:
            application/problem+json:
              schema:
                $ref: './common.yaml#/components/schemas/ProblemDetails'

  /api/v1/accounts/{accountId}/payments:
    parameters:
      - $ref: './common.yaml#/components/parameters/AccountIdPath'
    get:
      tags: [Payments]
      operationId: listPayments
      parameters:
        - $ref: './common.yaml#/components/parameters/Page'
        - $ref: './common.yaml#/components/parameters/PageSize'
      responses:
        '200':
          description: Page of payments.
          content:
            application/json:
              schema:
                allOf:
                  - $ref: './common.yaml#/components/schemas/PageMeta'
                  - type: object
                    required: [items]
                    properties:
                      items:
                        type: array
                        items:
                          $ref: '#/components/schemas/Payment'
    post:
      tags: [Payments]
      operationId: makePayment
      summary: Pay an issued, partially paid or overdue invoice
      parameters:
        - $ref: './common.yaml#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [invoiceId, paymentMethodId, amountMinor]
              additionalProperties: false
              properties:
                invoiceId:
                  type: string
                  format: uuid
                paymentMethodId:
                  type: string
                  format: uuid
                amountMinor:
                  type: integer
                  format: int64
                  minimum: 1
                  description: Must not exceed the invoice balance due.
      responses:
        '201':
          description: Payment accepted for processing.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Payment'
        '400':
          $ref: './common.yaml#/components/responses/BadRequest'
        '403':
          $ref: './common.yaml#/components/responses/Forbidden'
        '409':
          $ref: './common.yaml#/components/responses/Conflict'
        '422':
          $ref: './common.yaml#/components/responses/UnprocessableEntity'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    InvoiceStatus:
      type: string
      enum: [DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, VOID]

    Account:
      type: object
      required: [accountId, type, status, displayName, currency, balanceMinor, autopayEnabled, createdAt]
      properties:
        accountId:
          $ref: './common.yaml#/components/schemas/AccountId'
        type:
          type: string
          enum: [CONSUMER, BUSINESS]
        status:
          type: string
          enum: [ACTIVE, SUSPENDED, CLOSED]
        displayName:
          type: string
        contactEmail:
          type: string
          format: email
        contactPhone:
          type: string
        billingAddress:
          $ref: './common.yaml#/components/schemas/PostalAddress'
        currency:
          type: string
          pattern: '^[A-Z]{3}$'
        balanceMinor:
          type: integer
          format: int64
          description: Outstanding balance across payable invoices; negative means credit.
        autopayEnabled:
          type: boolean
        paperlessBilling:
          type: boolean
        createdAt:
          $ref: './common.yaml#/components/schemas/Timestamp'

    Service:
      type: object
      required: [serviceId, productType, planCode, status, monthlyPrice]
      properties:
        serviceId:
          type: string
          format: uuid
        productType:
          type: string
          enum: [BROADBAND, VOICE, SDWAN, HOSTED_SERVICES]
        planCode:
          type: string
          example: FIBER-500
        planName:
          type: string
        status:
          type: string
          enum: [PENDING_ACTIVATION, ACTIVE, SUSPENDED, CANCELLED]
        downloadMbps:
          type: integer
        uploadMbps:
          type: integer
        monthlyPrice:
          $ref: './common.yaml#/components/schemas/Money'
        serviceAddress:
          $ref: './common.yaml#/components/schemas/PostalAddress'
        activatedOn:
          type: string
          format: date
        contractEndsOn:
          type: string
          format: date
          nullable: true

    InvoiceLine:
      type: object
      required: [type, description, amountMinor]
      properties:
        type:
          type: string
          enum: [RECURRING, PRORATION, ONE_OFF, USAGE, CREDIT, DISCOUNT, EARLY_TERMINATION_FEE]
        description:
          type: string
        serviceId:
          type: string
          format: uuid
          nullable: true
        amountMinor:
          type: integer
          format: int64
          description: Negative for CREDIT and DISCOUNT lines.

    Invoice:
      type: object
      required: [invoiceId, invoiceNumber, status, periodStart, periodEnd, currency, subtotalMinor, taxMinor, totalMinor, amountPaidMinor, balanceDueMinor]
      properties:
        invoiceId:
          type: string
          format: uuid
        invoiceNumber:
          type: string
          example: INV-2026-0012345
        status:
          $ref: '#/components/schemas/InvoiceStatus'
        periodStart:
          type: string
          format: date
        periodEnd:
          type: string
          format: date
        issuedOn:
          type: string
          format: date
          nullable: true
        dueOn:
          type: string
          format: date
          nullable: true
        currency:
          type: string
          pattern: '^[A-Z]{3}$'
        subtotalMinor:
          type: integer
          format: int64
        taxRateBasisPoints:
          type: integer
          minimum: 0
          maximum: 10000
        taxMinor:
          type: integer
          format: int64
        totalMinor:
          type: integer
          format: int64
        amountPaidMinor:
          type: integer
          format: int64
        balanceDueMinor:
          type: integer
          format: int64
        lines:
          type: array
          items:
            $ref: '#/components/schemas/InvoiceLine'

    Payment:
      type: object
      required: [paymentId, invoiceId, amount, status, channel, createdAt]
      properties:
        paymentId:
          type: string
          format: uuid
        invoiceId:
          type: string
          format: uuid
        amount:
          $ref: './common.yaml#/components/schemas/Money'
        refundedMinor:
          type: integer
          format: int64
          default: 0
        status:
          type: string
          enum: [PENDING, SUCCEEDED, FAILED, REFUNDED, PARTIALLY_REFUNDED]
        channel:
          type: string
          enum: [PORTAL, AUTOPAY, AGENT]
        methodType:
          type: string
          enum: [CARD, DIRECT_DEBIT]
        failureCode:
          type: string
          nullable: true
        createdAt:
          $ref: './common.yaml#/components/schemas/Timestamp'
        settledAt:
          allOf:
            - $ref: './common.yaml#/components/schemas/Timestamp'
          nullable: true
```
