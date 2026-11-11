import Foundation
import GoKineticCore
import GoKineticUI

/// Raise a support ticket. Priority follows the category's suggestion
/// until the customer picks one explicitly, and P1 is reserved for total
/// loss of service.
@MainActor
public final class NewTicketViewModel: ObservableObject {
    @Published public var subject: String
    @Published public var details: String
    @Published public var category: TicketCategory {
        didSet {
            if !priorityChosenByUser || !selectablePriorities.contains(priority) {
                priority = category.suggestedPriority
            }
        }
    }
    @Published public private(set) var priority: TicketPriority
    @Published public private(set) var isSubmitting = false
    @Published public private(set) var submitError: UserFacingError?
    @Published public private(set) var created: Ticket?
    @Published private var attemptedSubmit = false

    private var priorityChosenByUser = false
    /// Stable for the lifetime of the form so a retried submit after a
    /// timeout can't open two tickets.
    private let idempotencyKey: String
    private let serviceId: String?
    private let support: SupportRepository
    private let analytics: AnalyticsTracking
    private let onCreated: (Ticket) -> Void

    public init(serviceId: String?, support: SupportRepository, analytics: AnalyticsTracking,
                prefill: NewTicketRequest? = nil, idempotencyKey: String = UUID().uuidString,
                onCreated: @escaping (Ticket) -> Void = { _ in }) {
        self.serviceId = prefill?.serviceId ?? serviceId
        self.support = support
        self.analytics = analytics
        self.idempotencyKey = idempotencyKey
        self.onCreated = onCreated
        self.subject = prefill?.subject ?? ""
        self.details = prefill?.description ?? ""
        self.category = prefill?.category ?? .connectivity
        self.priority = prefill?.priority ?? (prefill?.category ?? .connectivity).suggestedPriority
        self.priorityChosenByUser = prefill != nil
    }

    /// P1 is only selectable for connectivity problems.
    public var selectablePriorities: [TicketPriority] {
        category == .connectivity ? TicketPriority.allCases : TicketPriority.allCases.filter { $0 != .p1 }
    }

    public func choosePriority(_ newValue: TicketPriority) {
        guard selectablePriorities.contains(newValue) else { return }
        priority = newValue
        priorityChosenByUser = true
    }

    public var validation: ValidationResult {
        TicketValidator.validate(subject: subject, description: details)
    }

    public func message(for field: String) -> String? {
        guard attemptedSubmit, let key = validation.message(for: field) else { return nil }
        return L10n.string(key)
    }

    public var remainingDescriptionCharacters: Int {
        TicketValidator.descriptionRange.upperBound - details.trimmingCharacters(in: .whitespacesAndNewlines).count
    }

    public func submit() async {
        attemptedSubmit = true
        guard validation.isValid, !isSubmitting, created == nil else { return }
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }
        let request = NewTicketRequest(subject: subject, description: details, category: category,
                                       priority: priority, serviceId: serviceId)
        do {
            let ticket = try await support.createTicket(request, idempotencyKey: idempotencyKey)
            created = ticket
            analytics.track(.ticketCreated(category: category.rawValue))
            onCreated(ticket)
        } catch {
            submitError = UserFacingError(error)
        }
    }
}
