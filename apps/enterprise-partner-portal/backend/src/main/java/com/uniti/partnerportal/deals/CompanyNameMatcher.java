package com.uniti.partnerportal.deals;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Normalises and compares business names so that "The Acme Widgets Ltd." and
 * "ACME WIDGETS LIMITED" are recognised as the same customer, while staying conservative enough
 * that unrelated companies sharing a common word are not flagged.
 */
public final class CompanyNameMatcher {

    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9 ]");
    private static final Pattern MULTI_SPACE = Pattern.compile("\\s+");
    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}");
    private static final Set<String> NOISE_WORDS = Set.of(
            "the", "ltd", "limited", "plc", "llp", "lp", "inc", "incorporated", "co", "company",
            "corp", "corporation", "group", "holdings", "uk", "gb", "and");
    private static final Set<String> GENERIC_EMAIL_DOMAINS = Set.of(
            "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
            "yahoo.com", "yahoo.co.uk", "icloud.com", "aol.com", "btinternet.com", "sky.com", "protonmail.com");

    private CompanyNameMatcher() {
    }

    public static String normalise(String name) {
        if (name == null) {
            return "";
        }
        String folded = DIACRITICS.matcher(Normalizer.normalize(name, Normalizer.Form.NFD)).replaceAll("");
        String lower = folded.toLowerCase(Locale.ROOT).replace("&", " and ");
        String cleaned = NON_ALNUM.matcher(lower).replaceAll(" ");
        StringBuilder out = new StringBuilder();
        for (String token : MULTI_SPACE.split(cleaned.trim())) {
            if (!token.isEmpty() && !NOISE_WORDS.contains(token)) {
                if (!out.isEmpty()) {
                    out.append(' ');
                }
                out.append(token);
            }
        }
        return out.toString();
    }

    /**
     * Similarity in [0,1] based on Levenshtein distance over the normalised names.
     */
    public static double similarity(String a, String b) {
        String left = normalise(a);
        String right = normalise(b);
        if (left.isEmpty() || right.isEmpty()) {
            return 0.0;
        }
        if (left.equals(right)) {
            return 1.0;
        }
        int distance = levenshtein(left, right);
        return 1.0 - (double) distance / Math.max(left.length(), right.length());
    }

    static int levenshtein(String a, String b) {
        int[] previous = new int[b.length() + 1];
        int[] current = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            previous[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            current[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return previous[b.length()];
    }

    /**
     * Extracts the registrable domain from an email address or website, ignoring free mail
     * providers which say nothing about the customer's identity.
     */
    public static String customerDomain(String emailOrUrl) {
        if (emailOrUrl == null || emailOrUrl.isBlank()) {
            return null;
        }
        String value = emailOrUrl.trim().toLowerCase(Locale.ROOT);
        int at = value.lastIndexOf('@');
        if (at >= 0) {
            value = value.substring(at + 1);
        } else {
            value = value.replaceFirst("^https?://", "");
            int slash = value.indexOf('/');
            if (slash >= 0) {
                value = value.substring(0, slash);
            }
        }
        if (value.startsWith("www.")) {
            value = value.substring(4);
        }
        if (value.isEmpty() || !value.contains(".") || GENERIC_EMAIL_DOMAINS.contains(value)) {
            return null;
        }
        return value;
    }

    /**
     * UK postcode outward code ("SW1A 1AA" -> "SW1A"), which identifies the district.
     */
    public static String outwardCode(String postcode) {
        if (postcode == null || postcode.isBlank()) {
            return null;
        }
        String compact = postcode.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
        if (compact.length() <= 3) {
            return compact;
        }
        return compact.substring(0, compact.length() - 3);
    }
}
