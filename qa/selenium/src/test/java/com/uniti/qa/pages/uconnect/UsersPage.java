package com.uniti.qa.pages.uconnect;

import com.uniti.qa.pages.BasePage;
import java.net.URI;
import java.util.Optional;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Business user management. Only BUSINESS_ADMIN may invite users or change roles.
 */
public final class UsersPage extends BasePage {

    private static final By INVITE = By.cssSelector("button[data-action='invite-user']");
    private static final By INVITE_EMAIL = By.name("inviteEmail");
    private static final By INVITE_ROLE = By.name("inviteRole");
    private static final By SEND_INVITE = By.cssSelector("[role='dialog'] button[data-action='send-invite']");
    private static final By INVITE_ERROR = By.cssSelector("[role='dialog'] [data-testid='field-error']");
    private static final By USERS_TABLE = By.cssSelector("table[aria-label='Users']");
    private static final By ACCESS_DENIED = testId("access-denied");

    public UsersPage(WebDriver driver, URI baseUrl) {
        super(driver, baseUrl);
    }

    @Override
    protected String path() {
        return "/settings/users";
    }

    public UsersPage load() {
        driver.navigate().to(baseUrl.resolve(path()).toString());
        waits.invisible(SPINNER);
        return this;
    }

    public boolean isAccessDenied() {
        return !driver.findElements(ACCESS_DENIED).isEmpty();
    }

    public UsersPage invite(String email, String role) {
        waits.click(INVITE);
        waits.type(INVITE_EMAIL, email);
        selectByValue(INVITE_ROLE, role);
        waits.click(SEND_INVITE);
        return this;
    }

    public String inviteError() {
        return waits.visible(INVITE_ERROR).getText().trim();
    }

    public Optional<UserRow> user(String email) {
        return tableRows(USERS_TABLE).stream()
                .filter(row -> row.getText().contains(email))
                .findFirst()
                .map(UserRow::from);
    }

    public void revoke(String email) {
        WebElement row = tableRows(USERS_TABLE).stream()
                .filter(r -> r.getText().contains(email))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("User not listed: " + email));
        row.findElement(By.cssSelector("button[data-action='revoke-user']")).click();
        waits.click(By.cssSelector("[role='alertdialog'] button[data-action='confirm']"));
        waits.until(d -> user(email).isEmpty(), "user " + email + " to be removed");
    }

    public record UserRow(String email, String role, String status) {
        static UserRow from(WebElement row) {
            return new UserRow(
                    row.findElement(By.cssSelector("[data-testid='user-email']")).getText().trim(),
                    row.findElement(By.cssSelector("[data-testid='user-role']")).getAttribute("data-role"),
                    row.findElement(By.cssSelector("[data-testid='user-status']")).getAttribute("data-status"));
        }
    }
}
