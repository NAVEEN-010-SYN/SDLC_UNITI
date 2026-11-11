package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.partner.dto.PartnerDtos.KycDocumentResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerResponse;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerSummary;
import com.uniti.partnerportal.partner.dto.PartnerDtos.TierBenefits;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;

@Component
public class PartnerMapper {

    private final Clock clock;

    public PartnerMapper(Clock clock) {
        this.clock = clock;
    }

    public PartnerResponse toResponse(Partner p) {
        PartnerTier tier = p.getTier();
        return new PartnerResponse(
                p.getId(),
                p.getReference(),
                p.getLegalName(),
                p.getTradingName(),
                p.getCompanyNumber(),
                p.getVatNumber(),
                p.getWebsite(),
                p.getContactName(),
                p.getContactEmail(),
                p.getContactPhone(),
                p.getAddressLine1(),
                p.getAddressLine2(),
                p.getCity(),
                p.getPostcode(),
                p.getCountryCode(),
                p.getStatus(),
                p.getStatusReason(),
                tier,
                new TierBenefits(tier.commissionRateBps(), tier.selfApprovedDiscountPercent(),
                        tier.mdfAccrualBps(), tier.seatLimit()),
                p.getTrailingRevenueMinor(),
                p.getCurrency(),
                p.getTierEvaluatedAt(),
                p.getActivatedAt(),
                p.getCreatedAt());
    }

    public PartnerSummary toSummary(Partner p) {
        return new PartnerSummary(p.getId(), p.getReference(), p.displayName(), p.getStatus(), p.getTier(),
                p.getCreatedAt());
    }

    public KycDocumentResponse toResponse(KycDocument d) {
        return new KycDocumentResponse(
                d.getId(),
                d.getType(),
                d.getFileName(),
                d.getStatus(),
                d.getIssuedOn(),
                d.getUploadedAt(),
                d.getUploadedBy(),
                d.getReviewedAt(),
                d.getReviewedBy(),
                d.getRejectionReason(),
                d.isStale(LocalDate.now(clock)));
    }
}
