package com.uniti.qa.pages.uconnect;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Invoice history with status filter and server-side pagination.
 */
public final class InvoicesPage extends BasePage {

    private static final By TABLE = By.cssSelector("table[aria-label='Invoices']");
    private static final By STATUS_FILTER = By.cssSelector("select[aria-label='Invoice status']");
    private static final By PAGE_INFO = testId("pagination-summary");
    private static final By NEXT_PAGE = By.cssSelector("nav[aria-label='Pagination'] button[data-action='next']");

    public InvoicesPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/billing";
    }

    public InvoicesPage load() {
        open();
        return this;
    }

    public List<InvoiceRow> rows() {
        return tableRows(TABLE).stream().map(InvoiceRow::from).toList();
    }

    public InvoicesPage filter(String status) {
        selectByValue(STATUS_FILTER, status);
        waits.pageSettled();
        return this;
    }

    public boolean hasNextPage() {
        List<WebElement> next = driver.findElements(NEXT_PAGE);
        return !next.isEmpty() && next.get(0).isEnabled();
    }

    public InvoicesPage nextPage() {
        String before = waits.visible(PAGE_INFO).getText();
        waits.click(NEXT_PAGE);
        waits.until(d -> !d.findElement(PAGE_INFO).getText().equals(before), "pagination summary to change");
        return this;
    }

    /** Parses "Showing 13-24 of 40" into the total count. */
    public int totalInvoices() {
        String text = waits.visible(PAGE_INFO).getText().trim();
        return Integer.parseInt(text.substring(text.lastIndexOf(' ') + 1));
    }

    public record InvoiceRow(String invoiceId, LocalDate dueDate, long amountMinor, String status) {
        static InvoiceRow from(WebElement row) {
            return new InvoiceRow(
                    row.findElement(By.cssSelector("[data-testid='invoice-id']")).getText().trim(),
                    LocalDate.parse(row.findElement(By.cssSelector("time[data-testid='invoice-due']")).getAttribute("datetime")),
                    Long.parseLong(row.findElement(By.cssSelector("[data-amount-minor]")).getAttribute("data-amount-minor")),
                    row.findElement(By.cssSelector("[data-testid='invoice-status']")).getAttribute("data-status"));
        }
    }
}
