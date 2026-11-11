package com.uniti.qa.tests.uconnect;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.pages.uconnect.DashboardPage;
import com.uniti.qa.pages.uconnect.ServicesPage;
import com.uniti.qa.tests.BaseTest;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * Uconnect account overview and service management for a BUSINESS_ADMIN.
 */
public class AccountServicesTest extends BaseTest {

    private DashboardPage dashboard;

    @BeforeMethod(alwaysRun = true)
    public void open() {
        signInToUconnect("business_admin");
        dashboard = new DashboardPage(driver(), uconnectUrl()).load();
    }

    @Test(groups = {"smoke", "uconnect"}, description = "Dashboard shows the fixture account and its services")
    public void dashboardShowsAccount() {
        assertThat(dashboard.accountId()).isEqualTo(fixture("business.account"));
        assertThat(dashboard.activeServiceCount()).isPositive();
        assertThat(dashboard.balanceMinor()).isNotNegative();
        assertThat(dashboard.primaryNavItems()).contains("Services", "Billing", "Support", "Users");
    }

    @Test(groups = {"uconnect"}, description = "Service detail shows plan, ACTIVE status and service address")
    public void serviceDetail() {
        String serviceId = dashboard.serviceIds().get(0);
        ServicesPage service = dashboard.openService(serviceId);

        assertThat(service.serviceId()).isEqualTo(serviceId);
        assertThat(service.status()).isEqualTo("ACTIVE");
        assertThat(service.planName()).containsPattern("\\d+ (Mbps|Gbps)");
        assertThat(service.serviceAddress()).isEqualTo(fixture("business.service.address"));
    }

    @Test(groups = {"uconnect"}, description = "Upgrade offers only faster plans and raises a SUBMITTED order")
    public void planUpgradeCreatesOrder() {
        ServicesPage service = dashboard.openService(dashboard.serviceIds().get(0));
        List<String> skus = service.availablePlanSkus();
        assertThat(skus).isNotEmpty().doesNotContain(service.planName());

        String target = skus.get(skus.size() - 1);
        String effective = LocalDate.now(ZoneOffset.UTC).plusDays(7).toString();
        service.choosePlan(target, effective);
        assertThat(service.monthlyDeltaMinor()).as("upgrade increases the monthly charge").isPositive();

        String orderId = service.confirmChange();
        assertThat(orderId).matches("ORD-\\d{8}");
    }

    @Test(groups = {"uconnect"}, description = "Backdated plan changes are rejected at the boundary")
    public void backdatedChangeRejected() {
        ServicesPage service = dashboard.openService(dashboard.serviceIds().get(0));
        String target = service.availablePlanSkus().get(0);
        service.choosePlan(target, LocalDate.now(ZoneOffset.UTC).minusDays(1).toString());

        assertThat(service.isEffectiveDateInvalid()).isTrue();
    }

    @Test(groups = {"uconnect"}, description = "Remote line test completes with a definitive result")
    public void lineTestCompletes() {
        ServicesPage service = dashboard.openService(dashboard.serviceIds().get(0));
        assertThat(service.runLineTest()).isIn("PASS", "DEGRADED", "FAIL");
    }
}
