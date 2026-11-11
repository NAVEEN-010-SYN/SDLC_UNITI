import XCTest
@testable import GoKineticCore
import GoKineticTestSupport

final class PaymentPlanningTests: XCTestCase {
    private let now = Fixtures.date("2025-03-10T12:00:00Z")

    func testAmountOptionsListBalanceThenOverdueInvoiceFirst() {
        let overdue = Fixtures.invoice(id: "OLD", total: 3_000, due: Fixtures.date("2025-03-01T00:00:00Z"))
        let current = Fixtures.invoice(id: "NEW", total: 5_000, due: Fixtures.date("2025-03-20T00:00:00Z"))
        let paid = Fixtures.invoice(id: "PAID", total: 5_000, paid: 5_000, status: .paid)

        let options = PaymentPlanner.amountOptions(balance: Fixtures.usd(8_000), invoices: [current, paid, overdue], at: now)

        XCTAssertEqual(options.map(\.kind), [.balance, .overdueInvoice, .invoice])
        XCTAssertEqual(options.map(\.target), [.accountBalance, .invoice(id: "OLD"), .invoice(id: "NEW")])
    }

    func testInvoiceMatchingBalanceIsNotOfferedTwice() {
        let invoice = Fixtures.invoice(total: 8_499)
        let options = PaymentPlanner.amountOptions(balance: Fixtures.usd(8_499), invoices: [invoice], at: now)
        XCTAssertEqual(options.count, 1)
        XCTAssertEqual(options.first?.kind, .balance)
    }

    func testCreditBalanceStillOffersUnpaidInvoices() {
        let invoice = Fixtures.invoice(total: 2_000)
        let options = PaymentPlanner.amountOptions(balance: Fixtures.usd(-500), invoices: [invoice], at: now)
        XCTAssertEqual(options.map(\.kind), [.invoice])
    }

    func testPreferredMethodSkipsExpiredDefault() {
        let expiredDefault = Fixtures.method(id: "OLD", isDefault: true, expiryYear: 2024)
        let valid = Fixtures.method(id: "OK", isDefault: false)
        XCTAssertEqual(PaymentPlanner.preferredMethod([expiredDefault, valid], at: now)?.id, "OK")
        XCTAssertNil(PaymentPlanner.preferredMethod([expiredDefault], at: now))
    }

    func testOverpaymentAllowanceIgnoresVoidAndOtherCurrencies() {
        let invoices = [
            Fixtures.invoice(id: "A", total: 6_000),
            Fixtures.invoice(id: "B", total: 9_000, status: .void),
            Invoice(id: "C", number: "C", issuedAt: now, dueAt: now, periodStart: now, periodEnd: now,
                    total: Money(minorUnits: 50_000, currency: "EUR"), amountPaid: Money(minorUnits: 0, currency: "EUR"),
                    status: .open, lineItems: [])
        ]
        XCTAssertEqual(PaymentPlanner.overpaymentAllowance(invoices: invoices, currency: "USD"), Fixtures.usd(6_000))
    }

    func testDraftKeepsKeyWhenTermsUnchangedAndRotatesOnChange() {
        var counter = 0
        let makeKey: () -> String = { counter += 1; return "K\(counter)" }
        var draft = PaymentDraft(idempotencyKey: "K0")

        XCTAssertTrue(draft.update(amount: .some(Fixtures.usd(1_000)), paymentMethodId: .some("PM-1"), makeKey: makeKey))
        XCTAssertEqual(draft.idempotencyKey, "K1")
        XCTAssertFalse(draft.update(amount: .some(Fixtures.usd(1_000)), paymentMethodId: .some("PM-1"), makeKey: makeKey))
        XCTAssertEqual(draft.idempotencyKey, "K1")
        XCTAssertTrue(draft.update(target: .invoice(id: "INV-9"), makeKey: makeKey))
        XCTAssertEqual(draft.idempotencyKey, "K2")

        let request = draft.request
        XCTAssertEqual(request?.invoiceId, "INV-9")
        XCTAssertEqual(request?.idempotencyKey, "K2")
    }

    func testDraftWithoutMethodHasNoRequest() {
        let draft = PaymentDraft(amount: Fixtures.usd(100))
        XCTAssertNil(draft.request)
    }

    func testFailureClassificationFromProblemCodes() {
        XCTAssertEqual(PaymentFailure(Fixtures.validationProblem(code: "card-declined")), .declined)
        XCTAssertEqual(PaymentFailure(Fixtures.validationProblem(code: "insufficient-funds")), .insufficientFunds)
        XCTAssertEqual(PaymentFailure(Fixtures.validationProblem(code: "amount-too-large", field: "amount", message: "Too much")),
                       .amountRejected(detail: "Too much"))
        XCTAssertEqual(PaymentFailure(APIError.conflict(nil)), .duplicate)
        XCTAssertEqual(PaymentFailure(APIError.timedOut), .outcomeUnknown)
        XCTAssertEqual(PaymentFailure(APIError.server(status: 504, problem: nil)), .outcomeUnknown)
        XCTAssertEqual(PaymentFailure(APIError.server(status: 500, problem: nil)).messageKey, "error.server")
    }

    func testOnlyUnknownOutcomesKeepTheKey() {
        XCTAssertFalse(PaymentFailure.outcomeUnknown.isFinal)
        XCTAssertTrue(PaymentFailure.declined.isFinal)
    }

    func testFailedPaymentStatusMapsReason() {
        XCTAssertEqual(PaymentFailure(payment: Fixtures.payment(status: .failed, failureReason: "INSUFFICIENT_FUNDS")), .insufficientFunds)
        XCTAssertEqual(PaymentFailure(payment: Fixtures.payment(status: .failed, failureReason: nil)), .declined)
        XCTAssertNil(PaymentFailure(payment: Fixtures.payment(status: .pending)))
    }
}
