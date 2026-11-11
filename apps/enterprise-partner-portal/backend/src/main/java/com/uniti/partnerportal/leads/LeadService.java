package com.uniti.partnerportal.leads;

import com.uniti.partnerportal.common.domain.ReferenceGenerator;
import com.uniti.partnerportal.common.error.PortalException;
import com.uniti.partnerportal.common.security.CurrentUser;
import com.uniti.partnerportal.deals.DealRegistration;
import com.uniti.partnerportal.deals.DealRegistrationService;
import com.uniti.partnerportal.deals.dto.DealDtos.RegisterDealRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.ConvertLeadRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.LeadRequest;
import com.uniti.partnerportal.leads.dto.LeadDtos.LeadResponse;
import com.uniti.partnerportal.partner.PartnerService;
import com.uniti.partnerportal.users.PartnerUser;
import com.uniti.partnerportal.users.PartnerUserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Lead pipeline for partner agents. Leads are private to the partner; converting a qualified
 * lead registers a deal (which is where cross-partner conflict detection happens).
 */
@Service
@Transactional
public class LeadService {

    private final LeadRepository leads;
    private final LeadScorer scorer;
    private final PartnerService partners;
    private final PartnerUserRepository users;
    private final DealRegistrationService deals;
    private final ReferenceGenerator references;
    private final Clock clock;

    public LeadService(LeadRepository leads, LeadScorer scorer, PartnerService partners, PartnerUserRepository users,
                       DealRegistrationService deals, ReferenceGenerator references, Clock clock) {
        this.leads = leads;
        this.scorer = scorer;
        this.partners = partners;
        this.users = users;
        this.deals = deals;
        this.references = references;
        this.clock = clock;
    }

    public Lead create(LeadRequest request, CurrentUser user) {
        UUID partnerId = user.requirePartnerId();
        partners.requireTransactingPartner(partnerId);
        Lead lead = new Lead(UUID.randomUUID(), references.next(ReferenceGenerator.Kind.LEAD), partnerId,
                user.subject());
        apply(lead, request);
        return leads.save(lead);
    }

    public Lead update(UUID leadId, LeadRequest request, CurrentUser user) {
        Lead lead = loadForUser(leadId, user);
        if (lead.getStatus() == Lead.Status.CONVERTED) {
            throw new PortalException.BusinessRule("lead.converted", "A converted lead can no longer be edited");
        }
        apply(lead, request);
        return lead;
    }

    @Transactional(readOnly = true)
    public Lead get(UUID leadId, CurrentUser user) {
        return loadForUser(leadId, user);
    }

    @Transactional(readOnly = true)
    public Page<Lead> search(Lead.Status status, boolean mineOnly, Integer minScore, String search,
                             Pageable pageable, CurrentUser user) {
        UUID partnerId = user.requirePartnerId();
        String owner = mineOnly || !user.isPartnerAdmin() ? user.subject() : null;
        String term = search == null || search.isBlank() ? null : search.trim();
        return leads.search(partnerId, status, owner, minScore, term, pageable);
    }

    @Transactional(readOnly = true)
    public List<Lead> overdue(CurrentUser user) {
        return leads.findOverdue(user.requirePartnerId(), Instant.now(clock)).stream()
                .filter(l -> user.isPartnerAdmin() || l.getOwnerSubject().equals(user.subject()))
                .toList();
    }

    public Lead transition(UUID leadId, Lead.Status target, String reason, CurrentUser user) {
        Lead lead = loadForUser(leadId, user);
        if (target == Lead.Status.CONVERTED) {
            throw new PortalException.BusinessRule("lead.use_convert", "Use the convert action to convert a lead");
        }
        if (target == Lead.Status.DISQUALIFIED) {
            if (reason == null || reason.isBlank()) {
                throw new PortalException.BusinessRule("lead.reason_required", "A reason is required to disqualify");
            }
            lead.disqualify(reason.trim());
        } else {
            lead.transitionTo(target);
        }
        return lead;
    }

    /**
     * Reassigns a lead to another active agent of the same partner (admins only).
     */
    public Lead assign(UUID leadId, String ownerSubject, CurrentUser user) {
        if (!user.isPartnerAdmin()) {
            throw new PortalException.Forbidden("Only partner administrators can reassign leads");
        }
        Lead lead = loadForUser(leadId, user);
        PartnerUser owner = users.findByIdpSubject(ownerSubject)
                .filter(u -> u.getPartnerId().equals(lead.getPartnerId()))
                .filter(u -> u.getStatus() == PartnerUser.Status.ACTIVE)
                .orElseThrow(() -> new PortalException.BusinessRule("lead.invalid_owner",
                        "The new owner must be an active user of the same partner"));
        lead.setOwnerSubject(owner.getIdpSubject());
        return lead;
    }

    public DealRegistration convert(UUID leadId, ConvertLeadRequest request, CurrentUser user) {
        Lead lead = loadForUser(leadId, user);
        if (lead.getStatus() != Lead.Status.QUALIFIED) {
            throw new PortalException.BusinessRule("lead.not_qualified", "Only qualified leads can be converted");
        }
        if (lead.getEstimatedMrcMinor() <= 0) {
            throw new PortalException.BusinessRule("lead.value_required",
                    "Set an estimated monthly value before converting");
        }
        RegisterDealRequest dealRequest = new RegisterDealRequest(
                lead.getPartnerId(), lead.getId(), lead.getCompanyName(), request.customerCompanyNumber(),
                request.customerWebsite(), lead.getPostcode(), lead.getContactName(), lead.getContactEmail(),
                lead.getSiteCount(), lead.getEstimatedMrcMinor(), request.expectedCloseDate(),
                lead.getProductInterest() == null ? "Fibre connectivity" : lead.getProductInterest());
        DealRegistration deal = deals.register(dealRequest, user);
        lead.markConverted(deal.getId());
        return deal;
    }

    public LeadResponse toResponse(Lead l) {
        return new LeadResponse(l.getId(), l.getReference(), l.getPartnerId(), l.getOwnerSubject(),
                l.getCompanyName(), l.getContactName(), l.getContactEmail(), l.getContactPhone(), l.getPostcode(),
                l.getSiteCount(), l.getEstimatedMrcMinor(), l.getProductInterest(), l.getSource(), l.getStatus(),
                l.getScore(), scorer.band(l.getScore()), l.getNotes(), l.getNextActionAt(), l.getDisqualifyReason(),
                l.getConvertedDealId(), l.getCreatedAt());
    }

    private void apply(Lead lead, LeadRequest request) {
        lead.setCompanyName(request.companyName().trim());
        lead.setContactName(request.contactName().trim());
        lead.setContactEmail(request.contactEmail().trim().toLowerCase(Locale.ROOT));
        lead.setContactPhone(request.contactPhone());
        lead.setPostcode(request.postcode().trim().toUpperCase(Locale.ROOT));
        lead.setSiteCount(request.siteCount());
        lead.setEstimatedMrcMinor(request.estimatedMrcMinor());
        lead.setProductInterest(request.productInterest());
        lead.setSource(request.source());
        lead.setNotes(request.notes());
        lead.setNextActionAt(request.nextActionAt());
        lead.setScore(scorer.score(lead));
    }

    private Lead loadForUser(UUID leadId, CurrentUser user) {
        Lead lead = leads.findById(leadId).orElseThrow(() -> new PortalException.NotFound("Lead", leadId));
        user.assertCanAccess(lead.getPartnerId());
        boolean ownerOrAdmin = user.isInternal() || user.isPartnerAdmin()
                || lead.getOwnerSubject().equals(user.subject());
        if (!ownerOrAdmin) {
            throw new PortalException.Forbidden("This lead is owned by another agent");
        }
        return lead;
    }
}
