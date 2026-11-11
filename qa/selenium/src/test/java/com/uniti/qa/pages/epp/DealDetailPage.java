package com.uniti.qa.pages.epp;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Deal detail: summary, activity timeline and the withdraw action.
 */
public final class DealDetailPage extends BasePage {

    private static final By STAGE_BADGE = testId("deal-detail-stage");
    private static final By ACTIVITY_TAB = By.cssSelector("[role='tab'][data-tab='activity']");
    private static final By NOTE_INPUT = By.name("activityNote");
    private static final By POST_NOTE = By.cssSelector("button[data-action='post-note']");
    private static final By TIMELINE_ITEMS = By.cssSelector("[data-testid='activity-timeline'] li");
    private static final By WITHDRAW = By.cssSelector("button[data-action='withdraw-deal']");
    private static final By CONFIRM = By.cssSelector("[role='alertdialog'] button[data-action='confirm']");
    private static final By WITHDRAW_REASON = By.cssSelector("[role='alertdialog'] textarea[name='reason']");

    public DealDetailPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        throw new UnsupportedOperationException("Deal detail is reached from the deal list");
    }

    public String stage() {
        return waits.visible(STAGE_BADGE).getAttribute("data-stage");
    }

    public DealDetailPage addNote(String note) {
        waits.click(ACTIVITY_TAB);
        int before = driver.findElements(TIMELINE_ITEMS).size();
        waits.type(NOTE_INPUT, note);
        waits.click(POST_NOTE);
        waits.countEquals(TIMELINE_ITEMS, before + 1);
        return this;
    }

    public List<String> timeline() {
        waits.click(ACTIVITY_TAB);
        List<String> items = new ArrayList<>();
        for (WebElement item : waits.allVisible(TIMELINE_ITEMS)) {
            items.add(item.getText().trim());
        }
        return items;
    }

    public void withdraw(String reason) {
        waits.click(WITHDRAW);
        waits.type(WITHDRAW_REASON, reason);
        waits.click(CONFIRM);
        waits.attributeEquals(STAGE_BADGE, "data-stage", "WITHDRAWN");
    }
}
