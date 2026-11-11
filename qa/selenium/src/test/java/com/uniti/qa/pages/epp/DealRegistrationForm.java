package com.uniti.qa.pages.epp;

import com.uniti.qa.core.wait.Waits;
import com.uniti.qa.data.DealData;
import java.util.ArrayList;
import java.util.List;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Three-step deal registration wizard (customer -> solution -> review) rendered in a modal.
 */
public final class DealRegistrationForm {

    private static final By DIALOG = By.cssSelector("[role='dialog'][aria-labelledby='register-deal-title']");
    private static final By CUSTOMER_NAME = By.name("customerName");
    private static final By CUSTOMER_DOMAIN = By.name("customerDomain");
    private static final By CONTACT_EMAIL = By.name("contactEmail");
    private static final By SITE_COUNT = By.name("siteCount");
    private static final By MONTHLY_VALUE = By.name("estimatedMonthlyValue");
    private static final By NOTES = By.name("notes");
    private static final By CONSENT = By.name("customerConsent");
    private static final By NEXT = By.cssSelector("[role='dialog'] button[data-action='next']");
    private static final By SUBMIT = By.cssSelector("[role='dialog'] button[data-action='submit']");
    private static final By STEP = By.cssSelector("[role='dialog'] [data-testid='wizard-step'][aria-current='step']");
    private static final By FIELD_ERRORS = By.cssSelector("[role='dialog'] [data-testid='field-error']");
    private static final By DIALOG_PROBLEM = By.cssSelector("[role='dialog'] [data-testid='problem-banner']");
    private static final By CREATED_ID = By.cssSelector("[data-testid='toast-message'] [data-deal-id]");

    private final WebDriver driver;
    private final Waits waits;

    DealRegistrationForm(WebDriver driver) {
        this.driver = driver;
        this.waits = new Waits(driver);
        waits.visible(DIALOG);
    }

    public String currentStep() {
        return waits.visible(STEP).getAttribute("data-step");
    }

    public DealRegistrationForm customer(DealData deal) {
        waits.type(CUSTOMER_NAME, deal.customerName());
        waits.type(CUSTOMER_DOMAIN, deal.customerDomain());
        waits.type(CONTACT_EMAIL, deal.contactEmail());
        waits.click(NEXT);
        return this;
    }

    public DealRegistrationForm solution(DealData deal) {
        waits.attributeEquals(STEP, "data-step", "solution");
        for (String sku : deal.products()) {
            WebElement box = waits.clickable(By.cssSelector("input[type='checkbox'][value='" + sku + "']"));
            if (!box.isSelected()) {
                box.click();
            }
        }
        waits.type(SITE_COUNT, Integer.toString(deal.siteCount()));
        waits.type(MONTHLY_VALUE, deal.monthlyValueDisplay());
        waits.click(NEXT);
        return this;
    }

    public DealRegistrationForm review(String notes, boolean consent) {
        waits.attributeEquals(STEP, "data-step", "review");
        if (notes != null) {
            waits.type(NOTES, notes);
        }
        WebElement box = waits.clickable(CONSENT);
        if (box.isSelected() != consent) {
            box.click();
        }
        return this;
    }

    public boolean submitEnabled() {
        return waits.visible(SUBMIT).isEnabled();
    }

    /** Submits and returns the created deal id from the confirmation toast. */
    public String submit() {
        waits.click(SUBMIT);
        waits.invisible(DIALOG);
        return waits.visible(CREATED_ID).getAttribute("data-deal-id");
    }

    /** Submits expecting the server to reject the registration; the dialog stays open. */
    public String submitExpectingProblem() {
        waits.click(SUBMIT);
        return waits.visible(DIALOG_PROBLEM).getText().trim();
    }

    public DealRegistrationForm clickNext() {
        waits.click(NEXT);
        return this;
    }

    public List<String> fieldErrors() {
        List<String> errors = new ArrayList<>();
        for (WebElement error : driver.findElements(FIELD_ERRORS)) {
            errors.add(error.getText().trim());
        }
        return errors;
    }

    public boolean isFieldInvalid(String name) {
        return "true".equals(driver.findElement(By.name(name)).getAttribute("aria-invalid"));
    }

    public String registerAll(DealData deal) {
        return customer(deal).solution(deal).review(deal.notes(), true).submit();
    }
}
