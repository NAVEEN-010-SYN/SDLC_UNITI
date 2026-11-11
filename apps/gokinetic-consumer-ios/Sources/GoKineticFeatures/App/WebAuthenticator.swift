#if canImport(AuthenticationServices) && os(iOS)
import AuthenticationServices
import UIKit
import GoKineticCore

/// Presents the hosted login in `ASWebAuthenticationSession`, which shares
/// Safari's cookie jar for SSO and keeps credentials out of the app.
@MainActor
public final class SystemWebAuthenticator: NSObject, WebAuthenticating, ASWebAuthenticationPresentationContextProviding {
    private var activeSession: ASWebAuthenticationSession?

    public override init() {}

    nonisolated public func authenticate(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            Task { @MainActor in
                let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { [weak self] callback, error in
                    self?.activeSession = nil
                    if let callback {
                        continuation.resume(returning: callback)
                    } else if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                        continuation.resume(throwing: AuthError.userCancelled)
                    } else {
                        continuation.resume(throwing: AuthError.invalidCallback)
                    }
                }
                session.presentationContextProvider = self
                // Ephemeral sessions would defeat SSO with the web portals.
                session.prefersEphemeralWebBrowserSession = false
                self.activeSession = session
                if !session.start() {
                    self.activeSession = nil
                    continuation.resume(throwing: AuthError.configuration)
                }
            }
        }
    }

    nonisolated public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}
#endif
