import XCTest
@testable import GoKineticFeatures
import GoKineticCore
import GoKineticTestSupport

@MainActor
final class PayBillViewModelTests: XCTestCase {
    private var accounts: MockAccountRepository!
    private var billing: MockBillingRepository!
    private var analytics: RecordingAnalytics!

    override func setUp() async throws {
        accounts = MockAccountRepository()
        billing = MockBillingRepository()
        analytics = RecordingAnalytics()
        accounts.summaryStub.returns(Fixtures.summary(balance: 8_000))
        billing.invoicesStub.returns(Fixtures.page([
            Fixtures.invoice(id: "OLD", total: 3_000, due: Fixtures.date("2025-03-01T00:00:00Z")),
            Fixtures.invoice(id: "NEW", total: 5_000)
        ]))
        billing.methodsStub.returns([Fixtures.method(id: "EXP", isDefault: true, expiryYear: 2020), Fixtures.method(id: "PM-2", isDefault: false)])
    }

    private func makeViewModel(invoiceId: String? = nil) -> PayBillViewModel {
        PayBillViewModel(invoiceId: invoiceId, accounts: accounts, billing: billing, analytics: analytics,
                         clock: FixedClock(), locale: Locale(identifier: "en_US"))
    }

    func testLoadSelectsBalanceAndFirstUsableMethod() async {
        let viewModel = makeViewModel()
        await viewModel.load()

        XCTAssertEqual(viewModel.resolvedAmount, Fixtures.usd(8_000))
        XCTAssertEqual(viewModel.selectedMethodId, "PM-2")
        XCTAssertEqual(viewModel.setup.value?.hasExpiredMethods, true)
        XCTAssertTrue(viewModel.canSubmit)
    }

    func testPreselectedInvoiceIsHonoured() async {
        let viewModel = makeViewModel(invoiceId: "OLD")
        await viewModel.load()
        XCTAssertEqual(viewModel.selectedOption?.target, .invoice(id: "OLD"))
        XCTAssertEqual(viewModel.resolvedAmount, Fixtures.usd(3_000))
    }

    func testCustomAmountAboveAllowanceIsRejected() async {
        let viewModel = makeViewModel()
        await viewModel.load()
        viewModel.amountChoice = .custom
        viewModel.customAmountText = "200.00" // balance 80.00 + allowance 50.00
        XCTAssertFalse(viewModel.canSubmit)
        viewModel.customAmountText = "120.00"
        XCTAssertTrue(viewModel.canSubmit)
    }

    func testSuccessfulPaymentSendsInvoiceTarget() async {
        billing.payStub.returns(Fixtures.payment(amount: 3_000))
        let viewModel = makeViewModel(invoiceId: "OLD")
        await viewModel.load()
        await viewModel.submit()

        XCTAssertEqual(viewModel.phase, .succeeded(Fixtures.payment(amount: 3_000)))
        XCTAssertEqual(billing.payRequests.last?.invoiceId, "OLD")
        XCTAssertEqual(billing.payRequests.last?.paymentMethodId, "PM-2")
        XCTAssertEqual(analytics.events.calls, [.paymentSubmitted(amountMinor: 3_000, currency: "USD")])
    }

    func testRetryAfterUnknownOutcomeReusesIdempotencyKey() async {
        billing.payStub.enqueue(.failure(APIError.timedOut))
        billing.payStub.enqueue(.success(Fixtures.payment()))
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.submit()
        XCTAssertEqual(viewModel.phase, .failed(.outcomeUnknown))
        await viewModel.retry()

        let keys = billing.payRequests.calls.map(\.idempotencyKey)
        XCTAssertEqual(keys.count, 2)
        XCTAssertEqual(keys[0], keys[1])
        XCTAssertEqual(viewModel.phase, .succeeded(Fixtures.payment()))
    }

    func testDeclinedPaymentRotatesKeyForNextAttempt() async {
        billing.payStub.enqueue(.success(Fixtures.payment(status: .failed, failureReason: "CARD_DECLINED")))
        billing.payStub.enqueue(.success(Fixtures.payment()))
        let viewModel = makeViewModel()
        await viewModel.load()

        await viewModel.submit()
        XCTAssertEqual(viewModel.phase, .failed(.declined))
        XCTAssertTrue(analytics.events.calls.contains(.paymentFailed(code: "declined")))
        await viewModel.submit()

        let keys = billing.payRequests.calls.map(\.idempotencyKey)
        XCTAssertNotEqual(keys[0], keys[1])
    }
}

@MainActor
final class BillingViewModelTests: XCTestCase {
    func testAutopayRollsBackWhenServerRejects() async {
        let accounts = MockAccountRepository()
        let billing = MockBillingRepository()
        accounts.summaryStub.returns(Fixtures.summary())
        billing.invoicesStub.returns(Fixtures.page([Fixtures.invoice()]))
        billing.methodsStub.returns([Fixtures.method()])
        billing.autopayStub.returns(AutopaySettings(enabled: false, paymentMethodId: nil))
        billing.setAutopayStub.fails(APIError.server(status: 500, problem: nil))
        let viewModel = BillingViewModel(accounts: accounts, billing: billing, analytics: RecordingAnalytics(), clock: FixedClock())

        await viewModel.load()
        await viewModel.setAutopay(enabled: true)

        XCTAssertEqual(billing.autopayRequests.last, AutopaySettings(enabled: true, paymentMethodId: "PM-1"))
        XCTAssertEqual(viewModel.overview.value?.autopay.enabled, false)
        XCTAssertEqual(viewModel.inlineError?.kind, .server)
    }

    func testEnablingAutopayWithoutValidMethodIsBlockedLocally() async {
        let accounts = MockAccountRepository()
        let billing = MockBillingRepository()
        accounts.summaryStub.returns(Fixtures.summary())
        billing.invoicesStub.returns(Fixtures.page([Invoice]()))
        billing.methodsStub.returns([Fixtures.method(expiryYear: 2020)])
        billing.autopayStub.returns(AutopaySettings(enabled: false, paymentMethodId: nil))
        let viewModel = BillingViewModel(accounts: accounts, billing: billing, analytics: RecordingAnalytics(), clock: FixedClock())

        await viewModel.load()
        await viewModel.setAutopay(enabled: true)

        XCTAssertTrue(billing.autopayRequests.calls.isEmpty)
        XCTAssertEqual(viewModel.inlineError?.titleKey, "billing.autopay.noMethod")
        XCTAssertEqual(viewModel.invoices, .empty)
    }

    func testInvoicePagesAppendWithoutDuplicates() async {
        let accounts = MockAccountRepository()
        let billing = MockBillingRepository()
        accounts.summaryStub.returns(Fixtures.summary())
        billing.methodsStub.returns([])
        billing.autopayStub.returns(AutopaySettings(enabled: false, paymentMethodId: nil))
        billing.invoicesStub.enqueue(.success(Page(items: [Fixtures.invoice(id: "A"), Fixtures.invoice(id: "B")], page: 1, pageSize: 2, total: 4)))
        billing.invoicesStub.enqueue(.success(Page(items: [Fixtures.invoice(id: "B"), Fixtures.invoice(id: "C")], page: 2, pageSize: 2, total: 4)))
        let viewModel = BillingViewModel(accounts: accounts, billing: billing, analytics: RecordingAnalytics(), clock: FixedClock(), pageSize: 2)

        await viewModel.load()
        await viewModel.loadMoreIfNeeded(current: Fixtures.invoice(id: "B"))

        XCTAssertEqual(viewModel.invoices.value?.map(\.id), ["A", "B", "C"])
        XCTAssertEqual(billing.invoicePages.calls, [1, 2])
        XCTAssertFalse(viewModel.hasMoreInvoices)
    }
}
