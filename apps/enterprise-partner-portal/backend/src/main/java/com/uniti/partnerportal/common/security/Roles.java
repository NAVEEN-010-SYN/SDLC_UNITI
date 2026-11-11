package com.uniti.partnerportal.common.security;

/**
 * Role names as they appear in the JWT {@code roles} claim. {@code PARTNER_ADMIN} and
 * {@code PARTNER_AGENT} are platform roles; {@code CHANNEL_MANAGER} is the Uniti-internal role
 * that onboards partners and approves deals, quotes and MDF claims. {@code SUPPORT_AGENT} works
 * partner support cases.
 */
public final class Roles {

    public static final String PARTNER_ADMIN = "PARTNER_ADMIN";
    public static final String PARTNER_AGENT = "PARTNER_AGENT";
    public static final String CHANNEL_MANAGER = "CHANNEL_MANAGER";
    public static final String SUPPORT_AGENT = "SUPPORT_AGENT";

    public static final String HAS_PARTNER_ROLE =
            "hasAnyRole('PARTNER_ADMIN','PARTNER_AGENT','CHANNEL_MANAGER')";
    public static final String HAS_PARTNER_ADMIN =
            "hasAnyRole('PARTNER_ADMIN','CHANNEL_MANAGER')";
    public static final String IS_CHANNEL_MANAGER = "hasRole('CHANNEL_MANAGER')";
    public static final String CAN_WORK_CASES =
            "hasAnyRole('PARTNER_ADMIN','PARTNER_AGENT','SUPPORT_AGENT','CHANNEL_MANAGER')";

    private Roles() {
    }
}
