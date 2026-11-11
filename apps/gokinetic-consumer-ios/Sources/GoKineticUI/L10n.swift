import Foundation
import SwiftUI

/// Typed access to `Localizable.strings`. Keys are grouped by feature so a
/// missing translation is a compile-visible change rather than a typo.
public enum L10n {
    public static func string(_ key: String, _ args: CVarArg...) -> String {
        let format = NSLocalizedString(key, bundle: .module, comment: "")
        return args.isEmpty ? format : String(format: format, locale: .current, arguments: args)
    }

    public static func text(_ key: String) -> Text {
        Text(string(key))
    }

    public enum Common {
        public static var retry: String { string("common.retry") }
        public static var cancel: String { string("common.cancel") }
        public static var done: String { string("common.done") }
        public static var save: String { string("common.save") }
        public static var continueAction: String { string("common.continue") }
        public static var loading: String { string("common.loading") }
        public static var credit: String { string("common.credit") }
        public static var perMonth: String { string("common.perMonth") }
    }

    public enum Tabs {
        public static var home: String { string("tab.home") }
        public static var billing: String { string("tab.billing") }
        public static var plan: String { string("tab.plan") }
        public static var wifi: String { string("tab.wifi") }
        public static var support: String { string("tab.support") }
    }

    public enum Login {
        public static var title: String { string("login.title") }
        public static var subtitle: String { string("login.subtitle") }
        public static var signIn: String { string("login.signIn") }
        public static var unlock: String { string("login.unlock") }
        public static var unlockReason: String { string("login.unlockReason") }
        public static var usePassword: String { string("login.usePassword") }
        public static var notConsumer: String { string("login.notConsumer") }
    }

    public enum Billing {
        public static var balance: String { string("billing.balance") }
        public static var dueOn: String { string("billing.dueOn") }
        public static var payNow: String { string("billing.payNow") }
        public static var autopay: String { string("billing.autopay") }
        public static var history: String { string("billing.history") }
        public static var noInvoices: String { string("billing.noInvoices") }
        public static func dueIn(days: Int) -> String { string("billing.dueInDays", days) }
        public static func overdueBy(days: Int) -> String { string("billing.overdueByDays", days) }
    }

    public enum WiFi {
        public static var reboot: String { string("wifi.reboot") }
        public static var rebootConfirm: String { string("wifi.rebootConfirm") }
        public static var changeNetwork: String { string("wifi.changeNetwork") }
        public static var devices: String { string("wifi.devices") }
        public static var block: String { string("wifi.block") }
        public static var unblock: String { string("wifi.unblock") }
    }

}
