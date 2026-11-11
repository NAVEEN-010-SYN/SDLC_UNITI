package com.uniti.qa.tests.epp;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.data.DealData;
import com.uniti.qa.data.TestDataProviders;
import com.uniti.qa.pages.epp.DealDetailPage;
import com.uniti.qa.pages.epp.DealRegistrationForm;
import com.uniti.qa.pages.epp.DealsPage;
import com.uniti.qa.pages.epp.DealsPage.DealRow;
import com.uniti.qa.tests.BaseTest;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * Deal registration in the Enterprise Partner Portal. Registered deals start REGISTERED and
 * are protected for 90 days; a domain may only be protected by one partner at a time.
 */
public class DealRegistrationTest extends BaseTest {

    private static final int PROTECTION_DAYS = 90;

    private DealsPage deals;

    @BeforeMethod(alwaysRun = true)
    public void signIn() {
        signInToPartnerPortal("partner_admin");
        deals = new DealsPage(driver(), eppUrl()).load();
    }

    @Test(groups = {"smoke", "epp"}, dataProvider = "validDeals", dataProviderClass = TestDataProviders.class,
            description = "Valid deals are registered and protected for 90 days")
    public void registersValidDeal(String scenario, DealData deal) {
        String dealId = deals.startRegistration().registerAll(deal.withNotes("Scenario: " + scenario));

        assertThat(dealId).matches("DEAL-\\d{8}");
        DealRow row = deals.showStage("REGISTERED").search(deal.customerName()).rowFor(deal.customerName())
                .orElseThrow(() -> new AssertionError("Registered deal not listed: " + deal.customerName()));
        assertThat(row.dealId()).isEqualTo(dealId);
        assertThat(row.stage()).isEqualTo("REGISTERED");
        assertThat(row.monthlyValueMinor()).isEqualTo(deal.monthlyValueMinor());

        LocalDate expected = LocalDate.now(ZoneOffset.UTC).plusDays(PROTECTION_DAYS);
        assertThat(row.expiresOn()).isBetween(expected.minusDays(1), expected);
    }

    @Test(groups = {"epp"}, dataProvider = "invalidDealCustomer", dataProviderClass = TestDataProviders.class,
            description = "Customer step rejects invalid input and stays on the step")
    public void rejectsInvalidCustomer(String scenario, String name, String domain, String email, String invalidField) {
        DealRegistrationForm form = deals.startRegistration();
        DealData input = new DealData(name, domain, email, List.of("FIB-BIZ-1G"), 1, 59_900, "USD", null);
        form.customer(input);

        assertThat(form.currentStep()).as(scenario).isEqualTo("customer");
        assertThat(form.isFieldInvalid(invalidField)).as(scenario + " flags " + invalidField).isTrue();
        assertThat(form.fieldErrors()).as(scenario).isNotEmpty();
    }

    @Test(groups = {"epp"}, description = "Submit is disabled until customer consent is confirmed")
    public void consentIsRequired() {
        DealData deal = DealData.unique(List.of("FIB-BIZ-500"), 2, 119_800);
        DealRegistrationForm form = deals.startRegistration().customer(deal).solution(deal).review(null, false);
        assertThat(form.submitEnabled()).isFalse();

        form.review(null, true);
        assertThat(form.submitEnabled()).isTrue();
    }

    @Test(groups = {"epp"}, description = "A protected customer domain cannot be registered twice")
    public void duplicateDomainIsRejected() {
        DealData original = DealData.unique(List.of("FIB-BIZ-1G"), 1, 59_900);
        deals.startRegistration().registerAll(original);

        DealData duplicate = original.withCustomerName(original.customerName() + " Holdings");
        DealRegistrationForm form = deals.startRegistration().customer(duplicate).solution(duplicate).review(null, true);
        String problem = form.submitExpectingProblem();

        assertThat(problem).containsIgnoringCase("already registered");
    }

    @Test(groups = {"epp"}, description = "Notes and withdrawal are recorded on the deal timeline")
    public void withdrawRecordsTimeline() {
        DealData deal = DealData.unique(List.of("SDWAN-VC-STD"), 4, 199_600);
        deals.startRegistration().registerAll(deal);

        DealDetailPage detail = deals.search(deal.customerName()).open(deal.customerName());
        detail.addNote("Customer postponed procurement to next quarter.");
        detail.withdraw("Customer postponed procurement.");

        assertThat(detail.stage()).isEqualTo("WITHDRAWN");
        assertThat(detail.timeline())
                .anyMatch(item -> item.contains("Customer postponed procurement to next quarter."))
                .anyMatch(item -> item.contains("Withdrawn"));
    }
}
