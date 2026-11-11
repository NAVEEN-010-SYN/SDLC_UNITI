package com.uniti.qa.tests.epp;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.core.config.TestConfig.Credentials;
import com.uniti.qa.pages.common.SignInPage;
import com.uniti.qa.pages.epp.DealsPage;
import com.uniti.qa.tests.BaseTest;
import org.testng.annotations.Test;

public class PartnerSignInTest extends BaseTest {

    @Test(groups = {"smoke", "epp"}, description = "Partner admin lands on deals after sign-in")
    public void partnerAdminLandsOnDeals() {
        signInToPartnerPortal("partner_admin");

        DealsPage deals = new DealsPage(driver(), eppUrl());
        deals.waitUntilLoaded();
        assertThat(deals.heading()).isEqualTo("Deals");
        assertThat(deals.canRegisterDeals()).as("PARTNER_ADMIN may register deals").isTrue();
    }

    @Test(groups = {"epp"}, description = "Partner agent has read-only access to deals")
    public void partnerAgentIsReadOnly() {
        signInToPartnerPortal("partner_agent");

        DealsPage deals = new DealsPage(driver(), eppUrl()).load();
        assertThat(deals.canRegisterDeals()).as("PARTNER_AGENT must not see Register deal").isFalse();
    }

    @Test(groups = {"epp"}, description = "Wrong password is rejected without revealing which field was wrong")
    public void wrongPasswordIsRejected() {
        SignInPage signIn = new SignInPage(driver(), eppUrl(), "/login").open();
        Credentials real = config.credentials("partner_admin");
        signIn.submit(new Credentials(real.username(), real.password() + "-wrong"));

        assertThat(signIn.errorMessage()).isEqualTo("Incorrect email or password.");
        assertThat(signIn.isDisplayed()).isTrue();
    }

    @Test(groups = {"epp"}, description = "Deep link to a protected page returns to it after sign-in")
    public void deepLinkSurvivesSignIn() {
        driver().navigate().to(eppUrl().resolve("/commissions").toString());
        SignInPage signIn = new SignInPage(driver(), eppUrl(), "/login");
        assertThat(signIn.isDisplayed()).isTrue();

        signIn.submit(config.credentials("partner_admin"));
        assertThat(driver().getCurrentUrl()).contains("/commissions");
    }
}
