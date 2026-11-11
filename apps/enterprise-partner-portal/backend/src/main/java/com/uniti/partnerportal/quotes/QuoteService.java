package com.uniti.partnerportal.quotes;

import com.uniti.partnerportal.catalog.CatalogProduct;
import com.uniti.partnerportal.catalog.CatalogProductRepository;
import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.DealRegistrationService;
import com.uniti.partnerportal.partner.Partner;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteLineRequest;
import com.uniti.partnerportal.quotes.dto.QuoteDtos.QuoteRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Quote lifecycle: build from the catalog, price, route for approval according to the discount
 * matrix, send to the customer and record the customer's decision. Accepted quotes are turned
 * into orders by the orders module.
 */
@Service
@Transactional
public class QuoteService {

    private static final Logger log = LoggerFactory.getLogger(QuoteService.class);

    private final QuoteRepository quotes;
    private final CatalogProductRepository catalog;
    private final QuotePricingEngine pricing;
    private final PartnerService partners;
    private final DealRegistrationService deals;
    private final ReferenceGenerator references;
    private final PortalProperties properties;
    private final Clock clock;

    public QuoteService(QuoteRepository quotes, CatalogProductRepository catalog, QuotePricingEngine pricing,
                        PartnerService partners, DealRegistrationService deals, ReferenceGenerator references,
                        PortalProperties properties, Clock clock) {
        this.quotes = quotes;
        this.catalog = catalog;
        this.pricing = pricing;
        this.partners = partners;
        this.deals = deals;
        this.references = references;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * Prices a prospective quote without saving it, so the builder can show the discount stack
     * and the approval it will need as the partner edits.
     */
    @Transactional(readOnly = true)
    public QuotePricingEngine.PricingResult preview(QuoteRequest request, CurrentUser user) {
        UUID partnerId = user.effectivePartner(request.partnerId());
        Partner partner = partners.requireTransactingPartner(partnerId);
        List<QuoteLine> lines = buildLines(request.lines(), request.termMonths(), partner.getCurrency());
        return pricing.price(pricingInput(lines, request.termMonths(), request.requestedDiscountPercent(),
                partner, request.dealId()));
    }

    public Quote create(QuoteRequest request, CurrentUser user) {
        UUID partnerId = user.effectivePartner(request.partnerId());
        Partner partner = partners.requireTransactingPartner(partnerId);
        Quote quote = new Quote(UUID.randomUUID(), references.next(ReferenceGenerator.Kind.QUOTE), partnerId,
                partner.getCurrency());
        applyAndPrice(quote, request, partner);
        Quote saved = quotes.save(quote);
        log.info("quote_created quoteRef={} partnerId={} lines={}", saved.getReference(), partnerId,
                saved.getLines().size());
        return saved;
    }

    public Quote update(UUID quoteId, QuoteRequest request, CurrentUser user) {
        Quote quote = get(quoteId, user);
        if (!quote.getStatus().isEditable()) {
            throw new PortalException.BusinessRule("quote.not_editable",
                    "Quote " + quote.getReference() + " is " + quote.getStatus() + "; revise it before editing");
        }
        applyAndPrice(quote, request, partners.requireTransactingPartner(quote.getPartnerId()));
        return quote;
    }

    @Transactional(readOnly = true)
    public Quote get(UUID quoteId, CurrentUser user) {
        Quote quote = load(quoteId);
        user.assertCanAccess(quote.getPartnerId());
        return quote;
    }

    @Transactional(readOnly = true)
    public Page<Quote> search(UUID partnerId, QuoteStatus status, UUID dealId, String search, Pageable pageable,
                              CurrentUser user) {
        UUID scope = user.isInternal() ? partnerId : user.requirePartnerId();
        String term = search == null || search.isBlank() ? null : search.trim();
        return quotes.search(scope, status, dealId, term, pageable);
    }

    @Transactional(readOnly = true)
    public Page<Quote> approvalQueue(Pageable pageable) {
        return quotes.findByStatus(QuoteStatus.PENDING_APPROVAL, pageable);
    }

    /**
     * Re-prices against the partner's current tier and deal protection, then either self-approves
     * (within allowance) or routes to the approval queue. Anything not quotable is refused with
     * the blockers listed so the builder can show them.
     */
    public Quote submit(UUID quoteId, CurrentUser user) {
        Quote quote = get(quoteId, user);
        Partner partner = partners.requireTransactingPartner(quote.getPartnerId());
        QuotePricingEngine.PricingResult result = reprice(quote, partner);
        if (!result.isQuotable()) {
            throw (PortalException) new PortalException.BusinessRule("quote.not_quotable",
                    "The quote cannot be submitted as priced").withDetail("blockers", result.blockers());
        }
        if (result.approvalLevel() == ApprovalLevel.NONE) {
            quote.transitionTo(QuoteStatus.APPROVED);
            quote.setValidUntil(validityFrom(Instant.now(clock)));
            return quote;
        }
        if (quote.getJustification() == null || quote.getJustification().isBlank()) {
            throw new PortalException.BusinessRule("quote.justification_required",
                    "A justification is required for discounts that need Uniti approval");
        }
        quote.transitionTo(QuoteStatus.PENDING_APPROVAL);
        log.info("quote_submitted_for_approval quoteRef={} level={} discount={}", quote.getReference(),
                result.approvalLevel(), quote.getRequestedDiscountPercent());
        return quote;
    }

    /**
     * Records one channel-manager approval. Deal-desk quotes need two distinct approvers, and
     * nobody may approve a quote they raised.
     */
    public Quote approve(UUID quoteId, String note, CurrentUser manager) {
        Quote quote = load(quoteId);
        requirePending(quote);
        assertIndependentApprover(quote, manager);
        Instant now = Instant.now(clock);
        quote.addApproval(new QuoteApproval(UUID.randomUUID(), quote.getRevision(), manager.subject(),
                QuoteApproval.Decision.APPROVED, quote.getRequestedDiscountPercent(), note, now));
        if (quote.approvalsForCurrentRevision() >= quote.getApprovalLevel().approvalsRequired()) {
            quote.transitionTo(QuoteStatus.APPROVED);
            quote.setValidUntil(validityFrom(now));
            log.info("quote_approved quoteRef={} revision={}", quote.getReference(), quote.getRevision());
        }
        return quote;
    }

    public Quote reject(UUID quoteId, String note, CurrentUser manager) {
        Quote quote = load(quoteId);
        requirePending(quote);
        assertIndependentApprover(quote, manager);
        quote.addApproval(new QuoteApproval(UUID.randomUUID(), quote.getRevision(), manager.subject(),
                QuoteApproval.Decision.REJECTED, quote.getRequestedDiscountPercent(), note, Instant.now(clock)));
        quote.transitionTo(QuoteStatus.REJECTED);
        quote.setClosedReason(note);
        return quote;
    }

    public Quote revise(UUID quoteId, CurrentUser user) {
        Quote quote = get(quoteId, user);
        quote.revise();
        quote.setClosedReason(null);
        return quote;
    }

    public Quote markSent(UUID quoteId, CurrentUser user) {
        Quote quote = get(quoteId, user);
        assertStillValid(quote);
        quote.transitionTo(QuoteStatus.SENT);
        quote.setSentAt(Instant.now(clock));
        return quote;
    }

    public Quote recordCustomerDecision(UUID quoteId, boolean accepted, String reason, CurrentUser user) {
        Quote quote = get(quoteId, user);
        if (accepted) {
            assertStillValid(quote);
            quote.transitionTo(QuoteStatus.ACCEPTED);
            quote.setAcceptedAt(Instant.now(clock));
        } else {
            quote.transitionTo(QuoteStatus.DECLINED);
            quote.setClosedReason(reason);
        }
        return quote;
    }

    /**
     * Used by the orders module: only an accepted quote of the caller's partner can be ordered.
     */
    public Quote claimForOrder(UUID quoteId, CurrentUser user) {
        Quote quote = get(quoteId, user);
        if (quote.getStatus() != QuoteStatus.ACCEPTED) {
            throw new PortalException.BusinessRule("quote.not_accepted",
                    "Only accepted quotes can be ordered; " + quote.getReference() + " is " + quote.getStatus());
        }
        quote.transitionTo(QuoteStatus.ORDERED);
        return quote;
    }

    @Scheduled(cron = "0 5 0 * * *", zone = "UTC")
    public void expireLapsedQuotes() {
        List<Quote> lapsed = quotes.findByStatusInAndValidUntilBefore(
                EnumSet.of(QuoteStatus.APPROVED, QuoteStatus.SENT), Instant.now(clock));
        lapsed.forEach(q -> {
            q.transitionTo(QuoteStatus.EXPIRED);
            q.setClosedReason("Validity period lapsed");
        });
        if (!lapsed.isEmpty()) {
            log.info("quotes_expired count={}", lapsed.size());
        }
    }

    private void applyAndPrice(Quote quote, QuoteRequest request, Partner partner) {
        if (request.dealId() != null) {
            deals.requireQuotableDeal(request.dealId(), partner.getId());
        }
        quote.setDealId(request.dealId());
        quote.setCustomerName(request.customerName().trim());
        quote.setCustomerAccountId(request.customerAccountId());
        quote.setCustomerContactEmail(request.customerContactEmail().trim().toLowerCase(Locale.ROOT));
        quote.setTermMonths(request.termMonths());
        quote.setRequestedDiscountPercent(request.requestedDiscountPercent());
        quote.setJustification(request.justification() == null ? null : request.justification().trim());
        quote.replaceLines(buildLines(request.lines(), request.termMonths(), quote.getCurrency()));
        reprice(quote, partner);
    }

    private QuotePricingEngine.PricingResult reprice(Quote quote, Partner partner) {
        QuotePricingEngine.PricingResult result = pricing.price(pricingInput(quote.getLines(), quote.getTermMonths(),
                quote.getRequestedDiscountPercent(), partner, quote.getDealId()));
        quote.applyPricing(result);
        return result;
    }

    private QuotePricingEngine.PricingInput pricingInput(List<QuoteLine> lines, int termMonths, BigDecimal discount,
                                                         Partner partner, UUID dealId) {
        boolean protectedDeal = dealId != null;
        BigDecimal max = BigDecimal.valueOf(properties.pricing().maxDiscountPercent());
        return new QuotePricingEngine.PricingInput(lines, termMonths, discount, partner.getTier(), protectedDeal, max,
                partner.getCurrency());
    }

    /**
     * Snapshots catalog prices into quote lines. Unknown or retired SKUs, currency mismatches and
     * products whose minimum term exceeds the quote term are rejected up front.
     */
    List<QuoteLine> buildLines(List<QuoteLineRequest> requested, int termMonths, String currency) {
        Map<String, CatalogProduct> bySku = catalog.findBySkuIn(
                        requested.stream().map(QuoteLineRequest::sku).collect(Collectors.toSet())).stream()
                .filter(CatalogProduct::isActive)
                .collect(Collectors.toMap(CatalogProduct::getSku, Function.identity()));
        List<String> problems = new ArrayList<>();
        List<QuoteLine> lines = new ArrayList<>();
        int lineNo = 1;
        for (QuoteLineRequest r : requested) {
            CatalogProduct product = bySku.get(r.sku());
            if (product == null) {
                problems.add(r.sku() + " is not an available product");
                continue;
            }
            if (!product.getCurrency().equals(currency)) {
                problems.add(r.sku() + " is priced in " + product.getCurrency() + ", not " + currency);
                continue;
            }
            if (termMonths < product.getMinTermMonths()) {
                problems.add(r.sku() + " requires a minimum term of " + product.getMinTermMonths() + " months");
                continue;
            }
            int quantity = product.isPerSite() ? 1 : r.quantity();
            lines.add(new QuoteLine(UUID.randomUUID(), lineNo++, product.getSku(), product.getName(),
                    r.siteName().trim(), r.sitePostcode().trim().toUpperCase(Locale.ROOT), quantity,
                    product.getMonthlyPriceMinor(), product.getInstallPriceMinor(),
                    product.getFloorMonthlyPriceMinor()));
        }
        if (!problems.isEmpty()) {
            throw (PortalException) new PortalException.BusinessRule("quote.invalid_lines",
                    "One or more quote lines are invalid").withDetail("problems", problems);
        }
        return lines;
    }

    private void assertIndependentApprover(Quote quote, CurrentUser manager) {
        if (manager.subject().equals(quote.getCreatedBy())) {
            throw new PortalException.Forbidden("You cannot approve a quote you raised");
        }
        if (quote.hasApprovalFrom(manager.subject())) {
            throw new PortalException.Conflict("quote.already_decided",
                    "You have already recorded a decision on this revision");
        }
    }

    private static void requirePending(Quote quote) {
        if (quote.getStatus() != QuoteStatus.PENDING_APPROVAL) {
            throw new PortalException.BusinessRule("quote.not_pending",
                    "Quote " + quote.getReference() + " is not awaiting approval");
        }
    }

    private void assertStillValid(Quote quote) {
        if (quote.getValidUntil() != null && quote.getValidUntil().isBefore(Instant.now(clock))) {
            throw new PortalException.BusinessRule("quote.expired",
                    "Quote " + quote.getReference() + " expired on " + quote.getValidUntil());
        }
    }

    private Instant validityFrom(Instant from) {
        return from.plus(properties.pricing().quoteValidityDays(), ChronoUnit.DAYS);
    }

    private Quote load(UUID quoteId) {
        return quotes.findById(quoteId).orElseThrow(() -> new PortalException.NotFound("Quote", quoteId));
    }
}
