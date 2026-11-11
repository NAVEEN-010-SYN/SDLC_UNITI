package com.uniti.partnerportal.leads;

import com.uniti.partnerportal.deals.CompanyNameMatcher;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Simple, explainable lead score (0-100) so agents work the most valuable opportunities first.
 * <ul>
 *   <li>Value: up to 40 points, scaled on estimated monthly spend (capped at 5,000.00).</li>
 *   <li>Footprint: up to 25 points for multi-site customers.</li>
 *   <li>Contact quality: 10 points for a corporate (non-free-mail) address, 5 for a phone.</li>
 *   <li>Source: Uniti-shared and referral leads convert best.</li>
 *   <li>Product fit: SD-WAN and gigabit interest indicates an enterprise buyer.</li>
 * </ul>
 */
@Component
public class LeadScorer {

    static final long VALUE_CAP_MINOR = 500_000L;

    public int score(Lead lead) {
        int score = 0;
        long value = Math.min(Math.max(lead.getEstimatedMrcMinor(), 0), VALUE_CAP_MINOR);
        score += (int) (value * 40 / VALUE_CAP_MINOR);

        int sites = lead.getSiteCount();
        if (sites >= 20) {
            score += 25;
        } else if (sites >= 5) {
            score += 15;
        } else if (sites >= 2) {
            score += 8;
        }

        if (CompanyNameMatcher.customerDomain(lead.getContactEmail()) != null) {
            score += 10;
        }
        if (lead.getContactPhone() != null && !lead.getContactPhone().isBlank()) {
            score += 5;
        }

        score += sourcePoints(lead.getSource());

        String interest = lead.getProductInterest() == null ? "" : lead.getProductInterest().toLowerCase(Locale.ROOT);
        if (interest.contains("sd-wan") || interest.contains("sdwan")) {
            score += 8;
        } else if (interest.contains("2 gbps") || interest.contains("1 gbps") || interest.contains("gigabit")) {
            score += 5;
        }
        return Math.min(score, 100);
    }

    private static int sourcePoints(Lead.Source source) {
        if (source == null) {
            return 0;
        }
        switch (source) {
            case UNITI_SHARED:
                return 12;
            case REFERRAL:
                return 10;
            case EVENT:
                return 6;
            case WEBSITE:
                return 5;
            case OUTBOUND:
                return 3;
            default:
                return 0;
        }
    }

    public String band(int score) {
        if (score >= 70) {
            return "HOT";
        }
        if (score >= 40) {
            return "WARM";
        }
        return "COLD";
    }
}
