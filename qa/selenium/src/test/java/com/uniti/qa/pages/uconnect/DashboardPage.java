package com.uniti.qa.pages.uconnect;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Uconnect dashboard: account summary card, active services and quick links.
 */
public final class DashboardPage extends BasePage {

    private static final By ACCOUNT_ID = testId("account-id");
    private static final By ACCOUNT_NAME = testId("account-name");
    private static final By BALANCE = testId("balance-amount");
    private static final By SERVICE_TILES = By.cssSelector("[data-testid='service-tile']");
    private static final By OPEN_TICKETS = testId("open-ticket-count");
    private static final By ACCOUNT_SWITCHER = By.cssSelector("select[aria-label='Switch account']");
    private static final By NAV = By.cssSelector("nav[aria-label='Primary']");

    public DashboardPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/dashboard";
    }

    public DashboardPage load() {
        open();
        return this;
    }

    public String accountId() {
        return waits.visible(ACCOUNT_ID).getText().trim();
    }

    public String accountName() {
        return waits.visible(ACCOUNT_NAME).getText().trim();
    }

    public long balanceMinor() {
        return Long.parseLong(waits.visible(BALANCE).getAttribute("data-amount-minor"));
    }

    public int activeServiceCount() {
        int count = 0;
        for (WebElement tile : driver.findElements(SERVICE_TILES)) {
            if ("ACTIVE".equals(tile.getAttribute("data-status"))) {
                count++;
            }
        }
        return count;
    }

    public List<String> serviceIds() {
        List<String> ids = new ArrayList<>();
        for (WebElement tile : driver.findElements(SERVICE_TILES)) {
            ids.add(tile.getAttribute("data-service-id"));
        }
        return ids;
    }

    public int openTicketCount() {
        return Integer.parseInt(waits.visible(OPEN_TICKETS).getText().trim());
    }

    public boolean hasAccountSwitcher() {
        return !driver.findElements(ACCOUNT_SWITCHER).isEmpty();
    }

    public DashboardPage switchAccount(String accountId) {
        selectByValue(ACCOUNT_SWITCHER, accountId);
        waits.textPresent(ACCOUNT_ID, accountId);
        return this;
    }

    public List<String> primaryNavItems() {
        List<String> items = new ArrayList<>();
        for (WebElement link : waits.visible(NAV).findElements(By.cssSelector("a"))) {
            items.add(link.getText().trim());
        }
        return items;
    }

    public ServicesPage openService(String serviceId) {
        waits.click(By.cssSelector("[data-testid='service-tile'][data-service-id='" + serviceId + "'] a"));
        ServicesPage page = new ServicesPage(driver, baseUrl);
        page.waitUntilLoaded();
        return page;
    }
}
