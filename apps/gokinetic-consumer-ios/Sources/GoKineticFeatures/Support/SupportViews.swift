import SwiftUI
import GoKineticCore
import GoKineticUI

public struct TicketsView: View {
    @StateObject private var viewModel: TicketsViewModel
    @State private var showingNewTicket = false
    private let makeNewTicket: (@escaping (Ticket) -> Void) -> NewTicketViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> TicketsViewModel,
                makeNewTicket: @escaping (@escaping (Ticket) -> Void) -> NewTicketViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
        self.makeNewTicket = makeNewTicket
    }

    public var body: some View {
        List {
            Section {
                NavigationLink(value: AppRoute.troubleshoot) {
                    Label(L10n.string("support.troubleshoot"), systemImage: "wrench.and.screwdriver")
                }
                NavigationLink(value: DeepLink.appointments.route) {
                    Label(L10n.string("support.appointments"), systemImage: "calendar")
                }
                NavigationLink(value: DeepLink.settings.route) {
                    Label(L10n.string("support.settings"), systemImage: "gearshape")
                }
            }

            Toggle(L10n.string("tickets.includeClosed"), isOn: Binding(
                get: { viewModel.includeClosed },
                set: { include in Task { await viewModel.setIncludeClosed(include) } }
            ))

            AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("tickets.empty"), emptySymbol: "bubble.left.and.bubble.right",
                             retry: { Task { await viewModel.load() } }) { _ in
                ForEach(viewModel.sections) { section in
                    ticketSection(section)
                }
                if viewModel.isLoadingMore { ProgressView().frame(maxWidth: .infinity) }
            }
        }
        .refreshable { await viewModel.load() }
        .navigationTitle(L10n.Tabs.support)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingNewTicket = true } label: {
                    Label(L10n.string("tickets.new"), systemImage: "square.and.pencil")
                }
            }
        }
        .sheet(isPresented: $showingNewTicket) {
            NavigationStack {
                NewTicketView(viewModel: makeNewTicket { viewModel.didCreate($0) })
            }
        }
    }

    private func ticketSection(_ section: TicketsViewModel.Section) -> some View {
        Section(L10n.string(section.titleKey)) {
            ForEach(section.tickets) { ticket in
                NavigationLink(value: DeepLink.ticket(id: ticket.id).route) {
                    TicketRow(ticket: ticket, updatedText: dateFormatter.shortDate(ticket.updatedAt))
                }
                .task { await viewModel.loadMoreIfNeeded(current: ticket) }
            }
        }
    }
}

struct TicketRow: View {
    let ticket: Ticket
    let updatedText: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(ticket.subject).font(Theme.Typography.headline).lineLimit(1)
                Spacer()
                StatusBadge(L10n.string("ticket.status.\(ticket.status.rawValue.lowercased())"), tone: ticket.status.tone)
            }
            Text("\(ticket.reference) \u{00B7} \(ticket.priority.rawValue) \u{00B7} \(updatedText)")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

public struct TicketDetailView: View {
    @StateObject private var viewModel: TicketDetailViewModel
    private let dateFormatter = DisplayDateFormatter()

    public init(viewModel: @autoclosure @escaping () -> TicketDetailViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                AsyncContentView(state: viewModel.state, emptyTitle: L10n.string("error.notFound"),
                                 retry: { Task { await viewModel.load() } }) { ticket in
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        header(ticket)
                        ForEach(viewModel.visibleComments) { comment in
                            CommentBubble(comment: comment, timestamp: dateFormatter.relative(comment.createdAt, to: Date()),
                                          isPending: comment.id == viewModel.pendingComment?.id)
                        }
                    }
                    .padding(Theme.Spacing.l)
                }
            }
            if viewModel.state.value?.status.acceptsComments == true { composer }
        }
        .navigationTitle(viewModel.state.value?.reference ?? L10n.string("ticket.title"))
        .refreshable { await viewModel.load() }
    }

    private func header(_ ticket: Ticket) -> some View {
        Card {
            HStack {
                Text(ticket.subject).font(Theme.Typography.headline)
                Spacer()
                StatusBadge(L10n.string("ticket.status.\(ticket.status.rawValue.lowercased())"), tone: ticket.status.tone)
            }
            Text(L10n.string("ticket.category.\(ticket.category.rawValue.lowercased())")).font(.footnote).foregroundStyle(.secondary)
            if ticket.status.awaitsCustomer {
                Banner(title: L10n.string("ticket.awaitingYou"), tone: .warning)
            }
            HStack {
                chatButton
                if let type = viewModel.suggestedAppointmentType {
                    NavigationLink(value: AppRoute.bookAppointment(type: type, ticketId: ticket.id)) {
                        Label(L10n.string("ticket.bookVisit"), systemImage: "calendar.badge.plus")
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    @ViewBuilder private var chatButton: some View {
        switch viewModel.chat {
        case .idle, .failed:
            Button { Task { await viewModel.startChat() } } label: {
                Label(L10n.string("ticket.chat"), systemImage: "bubble.left.and.text.bubble.right")
            }
            .buttonStyle(.bordered)
        case .connecting:
            ProgressView()
        case .connected(let session):
            Label(session.estimatedWaitSeconds.map { L10n.string("chat.wait", max(1, $0 / 60)) } ?? L10n.string("chat.connected"),
                  systemImage: "person.wave.2")
                .font(.footnote)
        case .unavailable:
            Text(L10n.string("chat.unavailable")).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            if let error = viewModel.replyError {
                Text(L10n.string(error.titleKey)).font(.footnote).foregroundStyle(Theme.Palette.danger)
            }
            HStack(alignment: .bottom) {
                TextField(L10n.string("ticket.replyPlaceholder"), text: $viewModel.replyText, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.roundedBorder)
                Button { Task { await viewModel.sendReply() } } label: {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(!viewModel.canReply)
                .accessibilityLabel(L10n.string("ticket.send"))
            }
        }
        .padding(Theme.Spacing.m)
        .background(.bar)
    }
}

struct CommentBubble: View {
    let comment: TicketComment
    let timestamp: String
    let isPending: Bool

    var body: some View {
        HStack {
            if comment.isFromCustomer { Spacer(minLength: Theme.Spacing.xxl) }
            VStack(alignment: comment.isFromCustomer ? .trailing : .leading, spacing: Theme.Spacing.xs) {
                Text(comment.body)
                    .padding(Theme.Spacing.m)
                    .background(comment.isFromCustomer ? Theme.Palette.brand.opacity(0.15) : Theme.Palette.surface,
                                in: RoundedRectangle(cornerRadius: Theme.Radius.card))
                Text(isPending ? L10n.string("ticket.sending") : [comment.author, timestamp].filter { !$0.isEmpty }.joined(separator: " \u{00B7} "))
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .opacity(isPending ? 0.6 : 1)
            if !comment.isFromCustomer { Spacer(minLength: Theme.Spacing.xxl) }
        }
    }
}

public struct NewTicketView: View {
    @StateObject private var viewModel: NewTicketViewModel
    @Environment(\.dismiss) private var dismiss

    public init(viewModel: @autoclosure @escaping () -> NewTicketViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel())
    }

    public var body: some View {
        Group {
            if let ticket = viewModel.created {
                VStack(spacing: Theme.Spacing.l) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 56)).foregroundStyle(Theme.Palette.success)
                    Text(L10n.string("tickets.created")).font(Theme.Typography.title)
                    Text(L10n.string("tickets.createdReference", ticket.reference)).foregroundStyle(.secondary)
                    PrimaryButton(L10n.Common.done) { dismiss() }
                }
                .padding(Theme.Spacing.xl)
            } else {
                form
            }
        }
        .navigationTitle(L10n.string("tickets.new"))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(L10n.Common.cancel) { dismiss() }
            }
        }
    }

    private var form: some View {
        Form {
            Picker(L10n.string("tickets.category"), selection: $viewModel.category) {
                ForEach(TicketCategory.allCases) { category in
                    Text(L10n.string("ticket.category.\(category.rawValue.lowercased())")).tag(category)
                }
            }
            Picker(L10n.string("tickets.priority"), selection: Binding(
                get: { viewModel.priority },
                set: { viewModel.choosePriority($0) }
            )) {
                ForEach(viewModel.selectablePriorities, id: \.self) { priority in
                    Text(L10n.string("ticket.priority.\(priority.rawValue.lowercased())")).tag(priority)
                }
            }
            ValidatedField(L10n.string("tickets.subject"), text: $viewModel.subject, message: viewModel.message(for: "subject"))
            Section {
                TextEditor(text: $viewModel.details).frame(minHeight: 140)
                if let message = viewModel.message(for: "description") {
                    Text(message).font(.footnote).foregroundStyle(Theme.Palette.danger)
                }
            } header: {
                Text(L10n.string("tickets.description"))
            } footer: {
                Text(L10n.string("tickets.charactersLeft", viewModel.remainingDescriptionCharacters))
            }
            if let error = viewModel.submitError {
                Banner(title: L10n.string(error.titleKey), message: error.detail, tone: .danger)
            }
            PrimaryButton(L10n.string("tickets.submit"), isLoading: viewModel.isSubmitting) {
                Task { await viewModel.submit() }
            }
            .listRowInsets(EdgeInsets())
        }
    }
}
