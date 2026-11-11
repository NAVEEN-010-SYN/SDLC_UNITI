package com.uniti.partnerportal.deals;

import com.uniti.partnerportal.common.config.PortalProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Scores how likely two registrations refer to the same end customer.
 *
 * <table>
 *   <tr><th>Signal</th><th>Points</th></tr>
 *   <tr><td>Same company registration number</td><td>100</td></tr>
 *   <tr><td>Same corporate email/web domain</td><td>80</td></tr>
 *   <tr><td>Identical normalised name</td><td>70</td></tr>
 *   <tr><td>Similar name (above threshold)</td><td>50</td></tr>
 *   <tr><td>Same postcode district</td><td>20</td></tr>
 * </table>
 * A pair scoring {@value #MATCH_THRESHOLD} or more is a conflict. A similar name on its own is
 * therefore not enough; it needs the same district (or a stronger identifier) to corroborate it.
 */
@Component
public class DealConflictDetector {

    public static final int MATCH_THRESHOLD = 70;

    public enum Reason { COMPANY_NUMBER, DOMAIN, EXACT_NAME, SIMILAR_NAME, SAME_DISTRICT }

    public record Match(DealRegistration existing, Set<Reason> reasons, int score) {

        public String reasonsAsText() {
            return String.join(",", reasons.stream().map(Enum::name).toList());
        }
    }

    private final double similarityThreshold;

    public DealConflictDetector(PortalProperties properties) {
        this(properties.deals().nameSimilarityThreshold());
    }

    DealConflictDetector(double similarityThreshold) {
        this.similarityThreshold = similarityThreshold;
    }

    public List<Match> detect(DealRegistration candidate, List<DealRegistration> existing) {
        List<Match> matches = new ArrayList<>();
        for (DealRegistration other : existing) {
            if (other.getId().equals(candidate.getId())) {
                continue;
            }
            Match match = score(candidate, other);
            if (match.score() >= MATCH_THRESHOLD) {
                matches.add(match);
            }
        }
        matches.sort(Comparator.comparingInt(Match::score).reversed()
                .thenComparing(m -> m.existing().getSubmittedAt()));
        return matches;
    }

    Match score(DealRegistration a, DealRegistration b) {
        Set<Reason> reasons = new LinkedHashSet<>();
        int score = 0;
        if (a.getCustomerCompanyNumber() != null
                && a.getCustomerCompanyNumber().equalsIgnoreCase(Objects.toString(b.getCustomerCompanyNumber(), ""))) {
            reasons.add(Reason.COMPANY_NUMBER);
            score += 100;
        }
        if (a.getCustomerDomain() != null && a.getCustomerDomain().equals(b.getCustomerDomain())) {
            reasons.add(Reason.DOMAIN);
            score += 80;
        }
        if (!a.getNormalisedName().isEmpty() && a.getNormalisedName().equals(b.getNormalisedName())) {
            reasons.add(Reason.EXACT_NAME);
            score += 70;
        } else if (CompanyNameMatcher.similarity(a.getCustomerName(), b.getCustomerName()) >= similarityThreshold) {
            reasons.add(Reason.SIMILAR_NAME);
            score += 50;
        }
        if (a.getOutwardCode() != null && a.getOutwardCode().equals(b.getOutwardCode())) {
            reasons.add(Reason.SAME_DISTRICT);
            score += 20;
        }
        return new Match(b, reasons, score);
    }
}
