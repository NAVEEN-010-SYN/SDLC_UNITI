package com.uniti.partnerportal.partner;

import java.util.EnumSet;
import java.util.Set;

public enum KycDocumentType {
    CERTIFICATE_OF_INCORPORATION(true, 0),
    VAT_REGISTRATION(true, 0),
    BANK_CONFIRMATION_LETTER(true, 6),
    DIRECTOR_ID(true, 0),
    PROOF_OF_ADDRESS(false, 3),
    INSURANCE_CERTIFICATE(false, 12),
    SIGNED_PARTNER_AGREEMENT(true, 0);

    private final boolean required;
    private final int maxAgeMonths;

    KycDocumentType(boolean required, int maxAgeMonths) {
        this.required = required;
        this.maxAgeMonths = maxAgeMonths;
    }

    public boolean isRequired() {
        return required;
    }

    /** Maximum age of the document at time of review; 0 means it does not go stale. */
    public int maxAgeMonths() {
        return maxAgeMonths;
    }

    public static Set<KycDocumentType> required() {
        Set<KycDocumentType> set = EnumSet.noneOf(KycDocumentType.class);
        for (KycDocumentType type : values()) {
            if (type.required) {
                set.add(type);
            }
        }
        return set;
    }
}
