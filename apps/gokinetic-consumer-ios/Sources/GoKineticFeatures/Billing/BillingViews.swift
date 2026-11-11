import SwiftUI
import GoKineticCore
import GoKineticUI

public struct BillingView: View {
    @StateObject private var viewModel: BillingViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> BillingViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        List {
            Section {
                AsyncContentView(state: viewModel.overview, emptyTitle: L10n.Billing.noInvoices,
                                 retry: { Task { await viewModel.load(forceRefresh: true) } }) { overview in
                    overviewCard(overview)
                }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)

            if let error = viewModel.inlineError {
                Banner(title: L10n.string(error.titleKey), message: error.detail, tone: .warning,
                       actionTitle: L10n.string("common.dismiss")) { viewModel.inlineError = nil }
            }

            Section(L10n.Billing.history) {
                AsyncContentView(state: viewModel.invoices, emptyTitle: L10n.Billing.noInvoices, emptySymbol: "doc.text",
                                 retry: { Task { await viewModel.load() } }) { invoices in
                    ForEach(invoices) { invoice in
                        NavigationLink(value: DeepLink.invoice(id: invoice.id).route) {
                            InvoiceRowView(row: viewModel.row(for: invoice))
                        }
                        .task { await viewModel.loadMoreIfNeeded(current: invoice) }
                    }
                    if viewModel.isLoadingMore {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .refreshable { await viewModel.load(forceRefresh: true) }
        .navigationTitle(L10n.Tabs.billing)
    }

    private func overviewCard(_ overview: BillingViewModel.Overview) -> some View {
        Card(title: L10n.Billing.balance) {
            Text(overview.balanceText).font(Theme.Typography.metric)
            if let next = overview.nextBillDate {
                Text(L10n.string("billing.nextBill", dateFormatter.longDate(next)))
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if overview.balance.isPositive {
                NavigationLink(value: DeepLink.payBill(invoiceId: nil).route) {
                    Text(L10n.Billing.payNow).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            Divider()
            Toggle(isOn: Binding(
                get: { overview.autopay.enabled },
                set: { enabled in Task { await viewModel.setAutopay(enabled: enabled) } }
            )) {
                VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                    Text(L10n.Billing.autopay)
                    if let method = overview.autopayMethod, overview.autopay.enabled {
                        Text(method.displayName).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .disabled(viewModel.isUpdatingAutopay)
        }
        .padding(.vertical, Theme.Spacing.s)
    }
}

struct InvoiceRowView: View {
    let row: BillingViewModel.InvoiceRow

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
                Text(row.invoice.number).font(Theme.Typography.headline)
                Text(row.periodText).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: Theme.Spacing.xxs) {
                Text(row.amountText).monospacedDigit()
                StatusBadge(L10n.string(row.statusKey), tone: row.tone)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

public struct InvoiceDetailView: View {
    @StateObject private var viewModel: InvoiceDetailViewModel
    @Environment(\.openURL) private var openURL

    public init(viewModel: @autoclosure @escaping () -> InvoiceDetailViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        ScrollView {
            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("error.notFound"),
                             retry: { Task { await viewModel.load() } }) { content in
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    summary(content)
                    breakdown(content)
                    if let error = viewModel.documentError {
                        Banner(title: L10n.string(error.titleKey), tone: .warning)
                    }
                    SecondaryButton(L10n.string("invoice.downloadPDF")) {
                        Task { await viewModel.openDocument() }
                    }
                    .disabled(viewModel.isFetchingDocument)
                    if viewModel.canPay {
                        NavigationLink(value: DeepLink.payBill(invoiceId: content.invoice.id).route) {
                            Text(L10n.Billing.payNow).font(Theme.Typography.headline).frame(maxWidth: .infinity, minHeight: 50)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
                .padding(Theme.Spacing.l)
            }
        }
        .navigationTitle(viewModel.state.value?.invoice.number ?? L10n.string("invoice.title"))
        .onChange(of: viewModel.documentURL) { url in
            guard let url else { return }
            openURL(url)
            viewModel.documentURL = nil
        }
    }

    private func summary(_ content: InvoiceDetailViewModel.Content) -> some View {
        Card {
            HStack {
                Text(content.totalText).font(Theme.Typography.metric)
                Spacer()
                StatusBadge(L10n.string("invoice.status.\(content.effectiveStatus.rawValue.lowercased())"),
                            tone: content.effectiveStatus.tone)
            }
            Text(content.dueText).font(.subheadline).foregroundStyle(.secondary)
            if !content.invoice.isSettled && content.amountDueText != content.totalText {
                Text(L10n.string("invoice.amountDue", content.amountDueText)).font(.subheadline)
            }
        }
    }

    private func breakdown(_ content: InvoiceDetailViewModel.Content) -> some View {
        Card(title: L10n.string("invoice.breakdown")) {
            if content.breakdownIncomplete {
                Banner(title: L10n.string("invoice.breakdownIncomplete"), tone: .info)
            } else {
                ForEach(content.subtotals) { line in amountRow(line, emphasised: true) }
                Divider()
                ForEach(content.lines) { line in amountRow(line, emphasised: false) }
            }
        }
    }

    private func amountRow(_ line: InvoiceDetailViewModel.Line, emphasised: Bool) -> some View {
        HStack {
            Text(line.label).font(emphasised ? .subheadline.weight(.semibold) : .subheadline)
            Spacer()
            Text(line.amountText).monospacedDigit()
                .foregroundStyle(line.isCredit ? Theme.Palette.success : .primary)
        }
    }
}

public struct PayBillView: View {
    @StateObject private var viewModel: PayBillViewModel
    @Environment(\.dismiss) private var dismiss
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> PayBillViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Group {
            if case .succeeded(let payment) = viewModel.phase {
                receipt(payment)
            } else {
                AsyncContentView(state: viewModel.setup, emptyTitle: L10n.string("payment.nothingDue"),
                                 retry: { Task { await viewModel.load() } }) { setup in
                    form(setup)
                }
            }
        }
        .navigationTitle(L10n.Billing.payNow)
    }

    private func form(_ setup: PayBillViewModel.Setup) -> some View {
        Form {
            amountSection(setup)

            methodSection(setup)

            if case .failed(let failure) = viewModel.phase {
                Section {
                    Banner(title: L10n.string(failure.messageKey), tone: failure == .outcomeUnknown ? .warning : .danger,
                           actionTitle: failure == .outcomeUnknown ? L10n.Common.retry : nil) {
                        Task { await viewModel.retry() }
                    }
                }
            }

            Section {
                PrimaryButton(viewModel.confirmTitle, isLoading: viewModel.phase == .submitting, isEnabled: viewModel.canSubmit) {
                    Task { await viewModel.submit() }
                }
                .listRowInsets(EdgeInsets())
            } footer: {
                Text(L10n.string("payment.footer"))
            }
        }
    }

    private func amountSection(_ setup: PayBillViewModel.Setup) -> some View {
        Section(L10n.string("payment.amount")) {
            Picker(L10n.string("payment.amount"), selection: $viewModel.amountChoice) {
                ForEach(setup.options) { option in
                    amountOptionRow(option)
                }
                Text(L10n.string("payment.option.custom")).tag(Optional(PayBillViewModel.AmountChoice.custom))
            }
            .pickerStyle(.inline)
            .labelsHidden()
            if viewModel.amountChoice == .custom {
                ValidatedField(L10n.string("payment.customAmount"), text: $viewModel.customAmountText,
                               message: viewModel.amountMessage, contentType: .amount)
                    .onChange(of: viewModel.customAmountText) { _ in viewModel.customAmountEdited() }
            } else if let message = viewModel.amountMessage {
                Text(message).font(.footnote).foregroundStyle(Theme.Palette.danger)
            }
        }
    }

    private func amountOptionRow(_ option: PaymentAmountOption) -> some View {
        HStack {
            Text(viewModel.label(for: option))
            Spacer()
            Text(viewModel.amountText(option.amount)).monospacedDigit()
        }
        .tag(Optional(PayBillViewModel.AmountChoice.option(option.id)))
    }

    private func methodSection(_ setup: PayBillViewModel.Setup) -> some View {
        Section(L10n.string("payment.method")) {
            if setup.methods.isEmpty {
                Text(L10n.string("payment.noMethods")).foregroundStyle(.secondary)
            } else {
                Picker(L10n.string("payment.method"), selection: $viewModel.selectedMethodId) {
                    ForEach(setup.methods) { method in
                        Text(method.displayName).tag(Optional(method.id))
                    }
                }
            }
            if setup.hasExpiredMethods {
                Text(L10n.string("payment.expiredHidden")).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func receipt(_ payment: Payment) -> some View {
        VStack(spacing: Theme.Spacing.l) {
            Image(systemName: payment.status == .pending ? "clock.badge.checkmark" : "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(Theme.Palette.success)
                .accessibilityHidden(true)
            Text(L10n.string(payment.status == .pending ? "payment.processing" : "payment.success"))
                .font(Theme.Typography.title)
            Text(viewModel.amountText(payment.amount)).font(Theme.Typography.metric)
            Text(L10n.string("payment.receiptDetail", payment.methodDisplay, dateFormatter.longDate(payment.createdAt)))
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Text(L10n.string("payment.reference", payment.id)).font(.caption).foregroundStyle(.secondary)
            Spacer()
            PrimaryButton(L10n.Common.done) { dismiss() }
        }
        .padding(Theme.Spacing.xl)
    }
}
