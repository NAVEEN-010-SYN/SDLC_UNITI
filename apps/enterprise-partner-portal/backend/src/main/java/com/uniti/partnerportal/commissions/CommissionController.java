package com.uniti.partnerportal.commissions;

import com.uniti.partnerportal.commissions.dto.CommissionDtos.AdjustmentRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionRuleRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionRuleResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.CommissionSummaryResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.DisputeRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.EntryResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.GenerateStatementRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.PayoutFailedRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.PayoutPaidRequest;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.PayoutResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.StatementDetailResponse;
import com.uniti.partnerportal.commissions.dto.CommissionDtos.StatementResponse;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.common.security.CurrentUserProvider;
import com.uniti.partnerportal.common.security.Roles;
import com.uniti.partnerportal.common.web.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/commissions")
@Tag(name = "Commissions", description = "Commission rules, monthly statements and payouts")
public class CommissionController {

    private final CommissionService service;
    private final CurrentUserProvider currentUser;

    public CommissionController(CommissionService service, CurrentUserProvider currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @GetMapping("/summary")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Year-to-date earnings, unbilled balance and outstanding payouts")
    public CommissionSummaryResponse summary(@RequestParam(required = false) UUID partnerId) {
        return service.summary(partnerId, currentUser.get());
    }

    @GetMapping("/statements")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    public PageResponse<StatementResponse> statements(@RequestParam(required = false) UUID partnerId,
                                                      @RequestParam(required = false) StatementStatus status,
                                                      @RequestParam(required = false) Integer page,
                                                      @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by(Sort.Direction.DESC, "periodStart"));
        return PageResponse.from(service.searchStatements(partnerId, status, pageable, currentUser.get()),
                this::toStatementResponse);
    }

    @GetMapping("/statements/{statementId}")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Statement with its ledger entries and payout")
    public StatementDetailResponse statement(@PathVariable UUID statementId) {
        return detail(service.getStatement(statementId, currentUser.get()));
    }

    @PostMapping("/statements")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Generate a statement for a closed month")
    public StatementDetailResponse generate(@Valid @RequestBody GenerateStatementRequest request) {
        CommissionStatement statement = service.generateStatement(request.partnerId(), request.period())
                .orElseThrow(() -> new PortalException.BusinessRule("commission.nothing_to_bill",
                        "There are no unbilled commission entries for " + request.period()));
        return detail(statement);
    }

    @PostMapping("/statements/{statementId}/issue")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public StatementResponse issue(@PathVariable UUID statementId) {
        return toStatementResponse(service.issue(statementId));
    }

    @PostMapping("/statements/{statementId}/dispute")
    @PreAuthorize("hasRole('PARTNER_ADMIN')")
    @Operation(summary = "Dispute an issued statement")
    public StatementResponse dispute(@PathVariable UUID statementId, @Valid @RequestBody DisputeRequest request) {
        return toStatementResponse(service.dispute(statementId, request.reason(), currentUser.get()));
    }

    @PostMapping("/statements/{statementId}/adjustments")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public StatementDetailResponse adjust(@PathVariable UUID statementId,
                                          @Valid @RequestBody AdjustmentRequest request) {
        CurrentUser user = currentUser.get();
        return detail(service.adjust(statementId, request.amountMinor(), request.description(), user));
    }

    @PostMapping("/statements/{statementId}/reissue")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public StatementResponse reissue(@PathVariable UUID statementId) {
        return toStatementResponse(service.reissue(statementId));
    }

    @PostMapping("/statements/{statementId}/approve")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    @Operation(summary = "Approve for payment, or carry forward if below the payout minimum")
    public StatementDetailResponse approve(@PathVariable UUID statementId) {
        return detail(service.approve(statementId, currentUser.get()));
    }

    @GetMapping("/payouts")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    public PageResponse<PayoutResponse> payouts(@RequestParam(required = false) UUID partnerId,
                                                @RequestParam(required = false) CommissionPayout.Status status,
                                                @RequestParam(required = false) Integer page,
                                                @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by(Sort.Direction.DESC, "scheduledFor"));
        return PageResponse.from(service.searchPayouts(partnerId, status, pageable, currentUser.get()),
                CommissionController::toPayoutResponse);
    }

    @PostMapping("/payouts/{payoutId}/paid")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PayoutResponse paid(@PathVariable UUID payoutId, @Valid @RequestBody PayoutPaidRequest request) {
        return toPayoutResponse(service.markPayoutPaid(payoutId, request.paymentReference()));
    }

    @PostMapping("/payouts/{payoutId}/failed")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PayoutResponse failed(@PathVariable UUID payoutId, @Valid @RequestBody PayoutFailedRequest request) {
        return toPayoutResponse(service.markPayoutFailed(payoutId, request.reason()));
    }

    @PostMapping("/payouts/{payoutId}/reschedule")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public PayoutResponse reschedule(@PathVariable UUID payoutId) {
        return toPayoutResponse(service.reschedulePayout(payoutId));
    }

    @GetMapping("/rules")
    @PreAuthorize(Roles.HAS_PARTNER_ADMIN)
    @Operation(summary = "Incentive rules currently or formerly on offer")
    public PageResponse<CommissionRuleResponse> rules(@RequestParam(defaultValue = "true") boolean active,
                                                      @RequestParam(required = false) Integer page,
                                                      @RequestParam(required = false) Integer pageSize) {
        var pageable = PageResponse.pageable(page, pageSize, Sort.by("validFrom").descending());
        return PageResponse.from(service.listRules(active, pageable), CommissionController::toRuleResponse);
    }

    @PostMapping("/rules")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public CommissionRuleResponse createRule(@Valid @RequestBody CommissionRuleRequest request) {
        return toRuleResponse(service.createRule(request));
    }

    @PostMapping("/rules/{ruleId}/deactivate")
    @PreAuthorize(Roles.IS_CHANNEL_MANAGER)
    public CommissionRuleResponse deactivateRule(@PathVariable UUID ruleId) {
        return toRuleResponse(service.deactivateRule(ruleId));
    }

    private StatementDetailResponse detail(CommissionStatement s) {
        var lines = service.statementEntries(s.getId()).stream()
                .map(e -> new EntryResponse(e.getId(), e.getOrderId(), e.getOrderReference(), e.getType(),
                        e.getComponent(), e.getDescription(), e.getAmountMinor(), e.getCurrency(), e.getEarnedOn()))
                .toList();
        PayoutResponse payout = service.statementPayout(s.getId()).map(CommissionController::toPayoutResponse).orElse(null);
        return new StatementDetailResponse(toStatementResponse(s), lines, payout);
    }

    private StatementResponse toStatementResponse(CommissionStatement s) {
        return new StatementResponse(s.getId(), s.getReference(), s.getPartnerId(), s.getPeriodStart(),
                s.getPeriodEnd(), s.getCurrency(), s.getStatus(), s.getAccruedMinor(), s.getClawbackMinor(),
                s.getAdjustmentMinor(), s.getBroughtForwardMinor(), s.getNetPayableMinor(), s.getIssuedAt(),
                s.getDisputeReason(), s.getDecidedAt(), s.getPaidAt(), service.isDisputable(s));
    }

    private static PayoutResponse toPayoutResponse(CommissionPayout p) {
        return new PayoutResponse(p.getId(), p.getStatementId(), p.getPartnerId(), p.getAmountMinor(),
                p.getCurrency(), p.getStatus(), p.getScheduledFor(), p.getPaymentReference(), p.getPaidAt(),
                p.getFailureReason());
    }

    private static CommissionRuleResponse toRuleResponse(CommissionRule r) {
        return new CommissionRuleResponse(r.getId(), r.getName(), r.getProductCategory(), r.getMinTier(),
                r.getMinTermMonths(), r.getRateBps(), r.getFlatBonusMinor(), r.getCurrency(), r.getValidFrom(),
                r.getValidTo(), r.isActive());
    }
}
