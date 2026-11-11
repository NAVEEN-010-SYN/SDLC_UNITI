package com.uniti.qa.pages.epp;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Monthly commission statements for a partner. Amounts are exposed through
 * {@code data-amount-minor} attributes so tests compare integer minor units, not formatted text.
 */
public final class CommissionStatementPage extends BasePage {

    private static final By PERIOD = By.name("statementPeriod");
    private static final By LINES_TABLE = By.cssSelector("table[aria-label='Commission lines']");
    private static final By TOTAL = testId("commission-total");
    private static final By CLAWBACK_TOTAL = testId("commission-clawback-total");
    private static final By DOWNLOAD_CSV = By.cssSelector("a[data-action='download-statement-csv']");
    private static final By NO_STATEMENT = testId("statement-unavailable");

    public CommissionStatementPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/commissions";
    }

    public CommissionStatementPage load() {
        open();
        return this;
    }

    public CommissionStatementPage selectPeriod(YearMonth period) {
        selectByValue(PERIOD, period.toString());
        waits.pageSettled();
        return this;
    }

    public boolean hasStatement() {
        return driver.findElements(NO_STATEMENT).isEmpty();
    }

    public List<CommissionLine> lines() {
        List<CommissionLine> lines = new ArrayList<>();
        for (WebElement row : tableRows(LINES_TABLE)) {
            lines.add(CommissionLine.from(row));
        }
        return lines;
    }

    public long totalMinor() {
        return Long.parseLong(waits.visible(TOTAL).getAttribute("data-amount-minor"));
    }

    public long clawbackMinor() {
        return Long.parseLong(waits.visible(CLAWBACK_TOTAL).getAttribute("data-amount-minor"));
    }

    public String csvHref() {
        return waits.visible(DOWNLOAD_CSV).getAttribute("href");
    }

    public record CommissionLine(String dealId, String accountId, String product, long amountMinor, boolean clawback) {
        static CommissionLine from(WebElement row) {
            List<WebElement> cells = row.findElements(By.tagName("td"));
            WebElement amount = row.findElement(By.cssSelector("[data-amount-minor]"));
            return new CommissionLine(
                    cells.get(0).getText().trim(),
                    cells.get(1).getText().trim(),
                    cells.get(2).getText().trim(),
                    Long.parseLong(amount.getAttribute("data-amount-minor")),
                    "true".equals(row.getAttribute("data-clawback")));
        }
    }
}
