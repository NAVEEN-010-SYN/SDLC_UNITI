package com.uniti.partnerportal.partner;

import com.uniti.partnerportal.common.config.PortalProperties;
import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.partner.dto.PartnerDtos.ChecklistItem;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycChecklist;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycDocumentRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.KycReviewRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerApplicationRequest;
import com.uniti.partnerportal.partner.dto.PartnerDtos.PartnerProfileUpdateRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Partner onboarding (application, KYC evidence, review, activation) and lifecycle control
 * (suspension, reinstatement, termination). Also the single place other modules ask whether a
 * partner is allowed to transact.
 */
@Service
@Transactional
public class PartnerService {

    private static final Logger log = LoggerFactory.getLogger(PartnerService.class);
    private static final EnumSet<PartnerStatus> LIVE_STATUSES = EnumSet.of(
            PartnerStatus.APPLIED, PartnerStatus.KYC_PENDING, PartnerStatus.KYC_UNDER_REVIEW,
            PartnerStatus.ACTIVE, PartnerStatus.SUSPENDED);
    private static final EnumSet<PartnerStatus> DOCUMENT_UPLOAD_STATUSES = EnumSet.of(
            PartnerStatus.APPLIED, PartnerStatus.KYC_PENDING, PartnerStatus.ACTIVE);

    private final PartnerRepository partners;
    private final ReferenceGenerator references;
    private final PortalProperties properties;
    private final Clock clock;

    public PartnerService(PartnerRepository partners, ReferenceGenerator references,
                          PortalProperties properties, Clock clock) {
        this.partners = partners;
        this.references = references;
        this.properties = properties;
        this.clock = clock;
    }

    public Partner apply(PartnerApplicationRequest request) {
        String companyNumber = request.companyNumber().toUpperCase(Locale.ROOT);
        if (partners.existsByCompanyNumberIgnoreCaseAndStatusIn(companyNumber, LIVE_STATUSES)) {
            throw new PortalException.Conflict("partner.duplicate_company",
                    "An application or partnership already exists for company " + companyNumber);
        }
        Partner partner = new Partner(UUID.randomUUID(), references.next(ReferenceGenerator.Kind.PARTNER),
                request.legalName().trim(), companyNumber, properties.pricing().defaultCurrency());
        partner.setTradingName(blankToNull(request.tradingName()));
        partner.setVatNumber(blankToNull(request.vatNumber()));
        partner.setWebsite(blankToNull(request.website()));
        partner.setContactName(request.contactName().trim());
        partner.setContactEmail(request.contactEmail().trim().toLowerCase(Locale.ROOT));
        partner.setContactPhone(blankToNull(request.contactPhone()));
        partner.setAddressLine1(request.addressLine1().trim());
        partner.setAddressLine2(blankToNull(request.addressLine2()));
        partner.setCity(request.city().trim());
        partner.setPostcode(normalisePostcode(request.postcode()));
        partner.setCountryCode(request.countryCode());
        Partner saved = partners.save(partner);
        log.info("partner_applied partnerId={} reference={}", saved.getId(), saved.getReference());
        return saved;
    }

    @Transactional(readOnly = true)
    public Partner get(UUID partnerId, CurrentUser user) {
        user.assertCanAccess(partnerId);
        return load(partnerId);
    }

    @Transactional(readOnly = true)
    public Page<Partner> search(PartnerStatus status, PartnerTier tier, String search, Pageable pageable) {
        String term = search == null || search.isBlank() ? null : search.trim();
        return partners.search(status, tier, term, pageable);
    }

    public Partner updateProfile(UUID partnerId, PartnerProfileUpdateRequest request, CurrentUser user) {
        user.assertCanAccess(partnerId);
        Partner partner = load(partnerId);
        if (partner.getStatus() == PartnerStatus.TERMINATED || partner.getStatus() == PartnerStatus.REJECTED) {
            throw new PortalException.BusinessRule("partner.closed", "A closed partner profile cannot be edited");
        }
        partner.setTradingName(blankToNull(request.tradingName()));
        partner.setWebsite(blankToNull(request.website()));
        partner.setContactName(request.contactName().trim());
        partner.setContactEmail(request.contactEmail().trim().toLowerCase(Locale.ROOT));
        partner.setContactPhone(blankToNull(request.contactPhone()));
        partner.setAddressLine1(request.addressLine1().trim());
        partner.setAddressLine2(blankToNull(request.addressLine2()));
        partner.setCity(request.city().trim());
        partner.setPostcode(normalisePostcode(request.postcode()));
        return partner;
    }

    /**
     * A channel manager accepts the application and takes ownership; the partner can then
     * provide KYC evidence.
     */
    public Partner acceptApplication(UUID partnerId, CurrentUser channelManager) {
        Partner partner = load(partnerId);
        partner.transitionTo(PartnerStatus.KYC_PENDING, null, Instant.now(clock));
        partner.setChannelManagerId(channelManager.subject());
        return partner;
    }

    public KycDocument uploadDocument(UUID partnerId, KycDocumentRequest request, CurrentUser user) {
        user.assertCanAccess(partnerId);
        Partner partner = load(partnerId);
        if (!DOCUMENT_UPLOAD_STATUSES.contains(partner.getStatus())) {
            throw new PortalException.BusinessRule("kyc.upload_not_allowed",
                    "Documents cannot be uploaded while the partner is " + partner.getStatus());
        }
        boolean duplicate = partner.getDocuments().stream()
                .anyMatch(d -> d.getSha256().equals(request.sha256()) && d.getStatus() != KycDocument.Status.REJECTED);
        if (duplicate) {
            throw new PortalException.Conflict("kyc.duplicate_document", "This file has already been uploaded");
        }
        KycDocument document = new KycDocument(UUID.randomUUID(), request.type(), request.fileName(),
                request.storageKey(), request.sha256(), request.issuedOn(), Instant.now(clock), user.subject());
        if (document.isStale(LocalDate.now(clock))) {
            throw new PortalException.BusinessRule("kyc.document_stale",
                    request.type() + " must be issued within the last " + request.type().maxAgeMonths() + " months");
        }
        return partner.addDocument(document);
    }

    @Transactional(readOnly = true)
    public KycChecklist checklist(UUID partnerId, CurrentUser user) {
        user.assertCanAccess(partnerId);
        return buildChecklist(load(partnerId));
    }

    KycChecklist buildChecklist(Partner partner) {
        LocalDate today = LocalDate.now(clock);
        List<ChecklistItem> items = new ArrayList<>();
        boolean allRequiredPresent = true;
        boolean allRequiredVerified = true;
        for (KycDocumentType type : KycDocumentType.values()) {
            Optional<KycDocument> latest = partner.latestDocument(type);
            KycDocument.Status status = latest.map(KycDocument::getStatus).orElse(null);
            boolean stale = latest.map(d -> d.isStale(today)).orElse(false);
            items.add(new ChecklistItem(type, type.isRequired(), status, stale));
            if (type.isRequired()) {
                boolean usable = status != null && status != KycDocument.Status.REJECTED && !stale;
                allRequiredPresent &= usable;
                allRequiredVerified &= usable && status == KycDocument.Status.VERIFIED;
            }
        }
        return new KycChecklist(items, allRequiredPresent, allRequiredVerified);
    }

    public Partner submitForReview(UUID partnerId, CurrentUser user) {
        user.assertCanAccess(partnerId);
        Partner partner = load(partnerId);
        KycChecklist checklist = buildChecklist(partner);
        if (!checklist.readyForReview()) {
            List<String> missing = checklist.items().stream()
                    .filter(i -> i.required()
                            && (i.status() == null || i.status() == KycDocument.Status.REJECTED || i.stale()))
                    .map(i -> i.type().name())
                    .toList();
            throw (PortalException) new PortalException.BusinessRule("kyc.incomplete",
                    "Required KYC documents are missing, rejected or out of date").withDetail("missing", missing);
        }
        partner.transitionTo(PartnerStatus.KYC_UNDER_REVIEW, null, Instant.now(clock));
        return partner;
    }

    public KycDocument reviewDocument(UUID partnerId, UUID documentId, KycReviewRequest review,
                                      CurrentUser reviewer) {
        Partner partner = load(partnerId);
        if (partner.getStatus() != PartnerStatus.KYC_UNDER_REVIEW && partner.getStatus() != PartnerStatus.ACTIVE) {
            throw new PortalException.BusinessRule("kyc.not_in_review",
                    "Documents can only be reviewed once the partner has submitted for review");
        }
        KycDocument document = partner.getDocuments().stream()
                .filter(d -> d.getId().equals(documentId))
                .findFirst()
                .orElseThrow(() -> new PortalException.NotFound("KycDocument", documentId));
        if (document.getUploadedBy().equals(reviewer.subject())) {
            throw new PortalException.Forbidden("Reviewers cannot verify documents they uploaded");
        }
        Instant now = Instant.now(clock);
        if (Boolean.TRUE.equals(review.approved())) {
            if (document.isStale(LocalDate.now(clock))) {
                throw new PortalException.BusinessRule("kyc.document_stale", "Document is out of date");
            }
            document.verify(reviewer.subject(), now);
        } else {
            document.reject(reviewer.subject(), now, review.reason());
        }
        return document;
    }

    public Partner approve(UUID partnerId, CurrentUser channelManager) {
        Partner partner = load(partnerId);
        if (!buildChecklist(partner).readyForApproval()) {
            throw new PortalException.BusinessRule("kyc.not_verified",
                    "All required KYC documents must be verified before activation");
        }
        partner.transitionTo(PartnerStatus.ACTIVE, null, Instant.now(clock));
        if (partner.getChannelManagerId() == null) {
            partner.setChannelManagerId(channelManager.subject());
        }
        log.info("partner_activated partnerId={} by={}", partnerId, channelManager.subject());
        return partner;
    }

    public Partner returnForRework(UUID partnerId, String reason) {
        return transition(partnerId, PartnerStatus.KYC_PENDING, reason);
    }

    public Partner reject(UUID partnerId, String reason) {
        return transition(partnerId, PartnerStatus.REJECTED, reason);
    }

    public Partner suspend(UUID partnerId, String reason) {
        return transition(partnerId, PartnerStatus.SUSPENDED, reason);
    }

    public Partner reinstate(UUID partnerId, String reason) {
        Partner partner = load(partnerId);
        if (partner.getStatus() == PartnerStatus.SUSPENDED && !buildChecklist(partner).readyForApproval()) {
            throw new PortalException.BusinessRule("kyc.not_verified",
                    "KYC must be current and verified before a partner can be reinstated");
        }
        partner.transitionTo(PartnerStatus.ACTIVE, reason, Instant.now(clock));
        return partner;
    }

    public Partner terminate(UUID partnerId, String reason) {
        return transition(partnerId, PartnerStatus.TERMINATED, reason);
    }

    /**
     * Guard used by deals, quotes, orders and claims: only an ACTIVE partner can register deals,
     * price, order or claim funds.
     */
    @Transactional(readOnly = true)
    public Partner requireTransactingPartner(UUID partnerId) {
        Partner partner = load(partnerId);
        if (!partner.getStatus().canTransact()) {
            throw new PortalException.BusinessRule("partner.not_active",
                    "Partner " + partner.getReference() + " is " + partner.getStatus() + " and cannot transact");
        }
        return partner;
    }

    @Transactional(readOnly = true)
    public Partner load(UUID partnerId) {
        return partners.findById(partnerId).orElseThrow(() -> new PortalException.NotFound("Partner", partnerId));
    }

    private Partner transition(UUID partnerId, PartnerStatus next, String reason) {
        Partner partner = load(partnerId);
        partner.transitionTo(next, reason, Instant.now(clock));
        log.info("partner_status_changed partnerId={} status={}", partnerId, next);
        return partner;
    }

    static String normalisePostcode(String postcode) {
        String compact = postcode.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        if (compact.length() < 5) {
            return compact;
        }
        return compact.substring(0, compact.length() - 3) + " " + compact.substring(compact.length() - 3);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
