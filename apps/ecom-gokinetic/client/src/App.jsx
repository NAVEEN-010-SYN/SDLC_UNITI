import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout, ProtectedRoute } from './components/Layout';
import { PlansPage } from './pages/PlansPage';
import { ComparePage } from './pages/ComparePage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/checkout/CheckoutPage';
import { LoginPage, RegisterPage, ActivatePage } from './pages/AuthPages';
import { AccountLayout, OrdersList, OrderPage, InvoicesList, ProfilePage } from './pages/account/AccountPages';
import { QuotesPage, QuoteRequestPage, QuoteDetailPage, TeamPage } from './pages/business/BusinessPages';
import { EmptyState } from './components/ui';

const signedIn = (element, options) => <ProtectedRoute {...options}>{element}</ProtectedRoute>;
const business = { segment: 'BUSINESS' };

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PlansPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="business/activate" element={<ActivatePage />} />
        <Route path="checkout" element={signedIn(<CheckoutPage />, { roles: ['CONSUMER', 'BUSINESS_ADMIN', 'BUSINESS_USER'] })} />
        <Route path="orders/:orderNumber" element={signedIn(<OrderPage />)} />
        <Route path="account" element={signedIn(<AccountLayout />)}>
          <Route index element={<OrdersList />} />
          <Route path="invoices" element={<InvoicesList />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
        <Route path="business" element={<Navigate to="/business/quotes" replace />} />
        <Route path="business/quotes" element={signedIn(<QuotesPage />, business)} />
        <Route path="business/quotes/new" element={signedIn(<QuoteRequestPage />, business)} />
        <Route path="business/quotes/:quoteNumber" element={signedIn(<QuoteDetailPage />, business)} />
        <Route path="business/team" element={signedIn(<TeamPage />, { ...business, roles: ['BUSINESS_ADMIN'] })} />
        <Route path="*" element={<EmptyState title="Page not found"><p>The page you were looking for does not exist.</p></EmptyState>} />
      </Route>
    </Routes>
  );
}
