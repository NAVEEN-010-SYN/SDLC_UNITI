package com.uniti.qa.tests.uconnect;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.data.TestDataProviders;
import com.uniti.qa.pages.uconnect.InvoicesPage;
import com.uniti.qa.pages.uconnect.InvoicesPage.InvoiceRow;
import com.uniti.qa.pages.uconnect.UsersPage;
import com.uniti.qa.pages.uconnect.UsersPage.UserRow;
import com.uniti.qa.tests.BaseTest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.testng.annotations.Test;

/**
 * Billing history and business user administration in Uconnect.
 */
public class InvoicesAndUsersTest extends BaseTest {

    @Test(groups = {"smoke", "uconnect"}, description = "Invoices are listed newest first")
    public void invoicesNewestFirst() {
        signInToUconnect("business_admin");
        List<InvoiceRow> rows = new InvoicesPage(driver(), uconnectUrl()).load().rows();

        assertThat(rows).isNotEmpty();
        assertThat(rows).isSortedAccordingTo(Comparator.comparing(InvoiceRow::dueDate).reversed());
        assertThat(rows).allSatisfy(row -> assertThat(row.invoiceId()).matches("INV-\\d{8}"));
    }

    @Test(groups = {"uconnect"}, description = "Overdue filter returns only OVERDUE invoices")
    public void overdueFilter() {
        signInToUconnect("business_admin");
        List<InvoiceRow> rows = new InvoicesPage(driver(), uconnectUrl()).load().filter("OVERDUE").rows();

        assertThat(rows).allSatisfy(row -> assertThat(row.status()).isEqualTo("OVERDUE"));
    }

    @Test(groups = {"uconnect"}, description = "Paging through history visits every invoice exactly once")
    public void paginationIsComplete() {
        signInToUconnect("business_admin");
        InvoicesPage invoices = new InvoicesPage(driver(), uconnectUrl()).load();
        int total = invoices.totalInvoices();

        List<String> seen = new ArrayList<>();
        addInvoiceIds(seen, invoices.rows());
        while (invoices.hasNextPage()) {
            addInvoiceIds(seen, invoices.nextPage().rows());
        }
        assertThat(seen).hasSize(total).doesNotHaveDuplicates();
    }

    @Test(groups = {"uconnect"}, dataProvider = "userInvites", dataProviderClass = TestDataProviders.class,
            description = "Business admin invites users; invalid emails are rejected")
    public void inviteUser(String scenario, String role, boolean succeeds, String expectedError) {
        signInToUconnect("business_admin");
        UsersPage users = new UsersPage(driver(), uconnectUrl()).load();
        String email = succeeds
                ? "qa-" + UUID.randomUUID().toString().substring(0, 8) + "@qa.example.net"
                : "not-an-email";

        users.invite(email, role);

        if (succeeds) {
            UserRow row = users.user(email).orElseThrow(() -> new AssertionError(scenario + ": invite not listed"));
            assertThat(row.role()).isEqualTo(role);
            assertThat(row.status()).isEqualTo("INVITED");
            users.revoke(email);
        } else {
            assertThat(users.inviteError()).as(scenario).isEqualTo(expectedError);
        }
    }

    @Test(groups = {"uconnect"}, description = "Business user cannot open user administration")
    public void businessUserDenied() {
        signInToUconnect("business_user");
        assertThat(new UsersPage(driver(), uconnectUrl()).load().isAccessDenied()).isTrue();
    }

    private static void addInvoiceIds(List<String> target, List<InvoiceRow> rows) {
        for (InvoiceRow row : rows) {
            target.add(row.invoiceId());
        }
    }
}
