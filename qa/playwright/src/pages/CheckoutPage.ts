import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export interface ContactDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/**
 * Multi-step checkout: contact -> installation slot -> payment -> review.
 * Card entry happens inside the payment provider's iframe; tests use the
 * provider's published sandbox card numbers only.
 */
export class CheckoutPage extends BasePage {
  protected readonly path = '/checkout/contact';

  readonly stepper: Locator;
  readonly summary: Locator;
  readonly continueButton: Locator;
  readonly placeOrder: Locator;
  readonly termsCheckbox: Locator;
  readonly confirmation: Locator;

  constructor(page: Page) {
    super(page);
    this.stepper = page.getByRole('navigation', { name: 'Checkout progress' });
    this.summary = page.getByRole('complementary', { name: 'Order summary' });
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.placeOrder = page.getByRole('button', { name: 'Place order' });
    this.termsCheckbox = page.getByRole('checkbox', { name: /I agree to the terms of service/ });
    this.confirmation = page.getByTestId('order-confirmation');
  }

  async expectStep(name: 'Contact' | 'Installation' | 'Payment' | 'Review'): Promise<void> {
    await expect(this.stepper.getByRole('listitem').filter({ hasText: name })).toHaveAttribute('aria-current', 'step');
  }

  async fillContact(details: ContactDetails): Promise<void> {
    await this.expectStep('Contact');
    await this.page.getByLabel('First name').fill(details.firstName);
    await this.page.getByLabel('Last name').fill(details.lastName);
    await this.page.getByLabel('Email').fill(details.email);
    await this.page.getByLabel('Mobile number').fill(details.phone);
    await this.continueButton.click();
  }

  async chooseFirstInstallSlot(): Promise<string> {
    await this.expectStep('Installation');
    const slots = this.page.getByRole('radiogroup', { name: 'Installation appointment' }).getByRole('radio');
    await expect(slots.first()).toBeVisible();
    const firstEnabled = slots.and(this.page.locator(':not([disabled])')).first();
    const label = (await firstEnabled.getAttribute('aria-label')) ?? '';
    await firstEnabled.check();
    await this.continueButton.click();
    return label;
  }

  async payWithSandboxCard(card: { number: string; expiry: string; cvc: string; postalCode: string }): Promise<void> {
    await this.expectStep('Payment');
    const frame = this.page.frameLocator('iframe[title="Secure card payment input frame"]');
    await frame.getByPlaceholder('Card number').fill(card.number);
    await frame.getByPlaceholder('MM / YY').fill(card.expiry);
    await frame.getByPlaceholder('CVC').fill(card.cvc);
    await frame.getByPlaceholder('ZIP').fill(card.postalCode);
    await this.page.getByRole('checkbox', { name: 'Enrol in AutoPay' }).check();
    await this.continueButton.click();
  }

  async summaryLine(label: string): Promise<string> {
    const row = this.summary.getByRole('row').filter({ hasText: label });
    return (await row.getByRole('cell').last().textContent())?.trim() ?? '';
  }

  async expectSummaryContains(...items: string[]): Promise<void> {
    for (const item of items) {
      await expect(this.summary).toContainText(item);
    }
  }

  async applyPromoCode(code: string): Promise<void> {
    await this.summary.getByRole('button', { name: 'Add promo code' }).click();
    await this.summary.getByLabel('Promo code').fill(code);
    const apply = this.waitForApi('POST', '/api/v1/cart/promotions');
    await this.summary.getByRole('button', { name: 'Apply' }).click();
    await apply;
  }

  /**
   * Places the order and returns the order id from the confirmation page.
   */
  async submitOrder(): Promise<string> {
    await this.expectStep('Review');
    await this.termsCheckbox.check();
    const submit = this.waitForApi('POST', '/api/v1/orders');
    await this.placeOrder.click();
    const response = await submit;
    expect(response.status(), 'order submission status').toBe(201);
    await expect(this.confirmation).toBeVisible();
    const orderId = (await this.confirmation.getByTestId('order-id').textContent())?.trim() ?? '';
    expect(orderId).toMatch(/^ORD-\d{8}$/);
    return orderId;
  }

  async expectPlaceOrderBlockedUntilTermsAccepted(): Promise<void> {
    await this.expectStep('Review');
    await expect(this.placeOrder).toBeDisabled();
    await this.termsCheckbox.check();
    await expect(this.placeOrder).toBeEnabled();
  }
}
