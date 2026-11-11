import Foundation
import GoKineticCore
import GoKineticUI

/// Account holder details with editable contact email and phone.
@MainActor
public final class ProfileViewModel: ObservableObject {
    @Published public private(set) var state: ViewState<UserProfile> = .idle
    @Published public var email = ""
    @Published public var phone = ""
    @Published public private(set) var isSaving = false
    @Published public private(set) var fieldErrors: [String: String] = [:]
    @Published public private(set) var saveError: UserFacingError?
    @Published public private(set) var didSave = false

    private let accounts: AccountRepository

    public init(accounts: AccountRepository) {
        self.accounts = accounts
    }

    public func load(forceRefresh: Bool = false) async {
        state = state.reloading()
        do {
            let profile = try await accounts.profile(forceRefresh: forceRefresh)
            state = .loaded(profile)
            resetFields(to: profile)
        } catch {
            state = state.failing(error)
        }
    }

    private func resetFields(to profile: UserProfile) {
        email = profile.email
        phone = profile.phone ?? ""
        fieldErrors = [:]
    }

    /// Only fields that differ from the stored profile are sent.
    var changes: (email: String?, phone: String?) {
        guard let profile = state.value else { return (nil, nil) }
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPhone = phone.trimmingCharacters(in: .whitespacesAndNewlines)
        let emailChange = trimmedEmail.lowercased() == profile.email.lowercased() ? nil : trimmedEmail
        let currentPhone = profile.phone.flatMap(ContactValidator.normalizePhone) ?? profile.phone ?? ""
        let phoneChange = (ContactValidator.normalizePhone(trimmedPhone) ?? trimmedPhone) == currentPhone ? nil : trimmedPhone
        return (emailChange, phoneChange)
    }

    public var hasChanges: Bool {
        let pending = changes
        return pending.email != nil || pending.phone != nil
    }

    func validate() -> [String: String] {
        var errors: [String: String] = [:]
        let pending = changes
        if let email = pending.email, !ContactValidator.isValidEmail(email.lowercased()) {
            errors["email"] = L10n.string("profile.validation.email")
        }
        if let phone = pending.phone, ContactValidator.normalizePhone(phone) == nil {
            errors["phone"] = L10n.string("profile.validation.phone")
        }
        return errors
    }

    public func save() async {
        guard hasChanges, !isSaving else { return }
        didSave = false
        saveError = nil
        fieldErrors = validate()
        guard fieldErrors.isEmpty else { return }

        isSaving = true
        defer { isSaving = false }
        let pending = changes
        do {
            let updated = try await accounts.updateContact(email: pending.email, phone: pending.phone)
            state = .loaded(updated)
            resetFields(to: updated)
            didSave = true
        } catch APIError.validation(let problem) where problem.errors?.isEmpty == false {
            // Server-side rules (e.g. email already in use) land on the field.
            fieldErrors = ["email", "phone"].reduce(into: [:]) { result, field in
                if let message = problem.firstError(for: field) { result[field] = message }
            }
            if fieldErrors.isEmpty { saveError = UserFacingError(APIError.validation(problem)) }
        } catch {
            saveError = UserFacingError(error)
        }
    }

    public func discardChanges() {
        if let profile = state.value { resetFields(to: profile) }
    }
}
