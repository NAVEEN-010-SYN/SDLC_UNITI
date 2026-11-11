package com.uniti.qa.tests.epp;

import static org.assertj.core.api.Assertions.assertThat;

import com.uniti.qa.pages.epp.CommissionStatementPage;
import com.uniti.qa.pages.epp.CommissionStatementPage.CommissionLine;
import com.uniti.qa.tests.BaseTest;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.testng.SkipException;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * Commission statements: totals must reconcile to the line items in integer minor units,
 * and clawbacks (cancelled services within the clawback window) appear as negative lines.
 */
public class CommissionStatementTest extends BaseTest {

    private CommissionStatementPage statements;
    private final YearMonth lastMonth = YearMonth.now(ZoneOffset.UTC).minusMonths(1);

    @BeforeMethod(alwaysRun = true)
    public void open() {
        signInToPartnerPortal("partner_admin");
        statements = new CommissionStatementPage(driver(), eppUrl()).load().selectPeriod(lastMonth);
        if (!statements.hasStatement()) {
            throw new SkipException("No commission statement published for " + lastMonth);
        }
    }

    @Test(groups = {"smoke", "epp"}, description = "Statement total equals the sum of its lines")
    public void totalReconcilesToLines() {
        List<CommissionLine> lines = statements.lines();
        long sum = sumMinor(lines);

        assertThat(lines).isNotEmpty();
        assertThat(statements.totalMinor()).isEqualTo(sum);
    }

    @Test(groups = {"epp"}, description = "Clawback lines are negative and summarised separately")
    public void clawbacksAreNegative() {
        List<CommissionLine> clawbacks = new ArrayList<>();
        for (CommissionLine line : statements.lines()) {
            if (line.clawback()) {
                clawbacks.add(line);
            }
        }
        long clawbackSum = sumMinor(clawbacks);

        assertThat(clawbacks).allSatisfy(line -> assertThat(line.amountMinor()).isNegative());
        assertThat(statements.clawbackMinor()).isEqualTo(clawbackSum);
    }

    @Test(groups = {"epp"}, description = "Every line references a deal and an account in canonical format")
    public void linesReferenceCanonicalIds() {
        assertThat(statements.lines()).allSatisfy(line -> {
            assertThat(line.dealId()).matches("DEAL-\\d{8}");
            assertThat(line.accountId()).matches("ACC-\\d{8}");
        });
    }

    @Test(groups = {"epp"}, description = "CSV download link targets the versioned statement API for the period")
    public void csvLinkTargetsPeriod() {
        assertThat(statements.csvHref())
                .contains("/api/v1/partner/commissions/statements/" + lastMonth)
                .endsWith("format=csv");
    }

    private static long sumMinor(List<CommissionLine> lines) {
        long sum = 0;
        for (CommissionLine line : lines) {
            sum += line.amountMinor();
        }
        return sum;
    }
}
