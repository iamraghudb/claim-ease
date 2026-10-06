import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { CircleQuestionMark } from 'lucide-react';
import { Layout } from './components/Layout';
import { ButtonLink, EmptyState, Spinner } from './components/ui';
import Home from './pages/Home';

const IntakeWizard = lazy(() => import('./features/intake/IntakeWizard'));
const Confirmation = lazy(() => import('./features/intake/Confirmation'));
const MyClaims = lazy(() => import('./features/claims/MyClaims'));
const ClaimDetail = lazy(() => import('./features/claims/ClaimDetail'));
const ClaimFile = lazy(() => import('./features/claims/ClaimFile'));
const NotificationsPage = lazy(() => import('./features/claims/NotificationsPage'));
const WorkQueue = lazy(() => import('./features/adjuster/WorkQueue'));
const ClaimReview = lazy(() => import('./features/adjuster/ClaimReview'));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard'));
const ConfigPage = lazy(() => import('./features/admin/ConfigPage'));
const HealthClaimView = lazy(() => import('./features/health/HealthClaimView'));
const GlossaryPage = lazy(() => import('./pages/GlossaryPage'));

const s = (el: ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

function NotFound() {
  return <EmptyState icon={CircleQuestionMark} title="Page not found" message="The page you're looking for doesn't exist." action={<ButtonLink to="/">Go home</ButtonLink>} />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'file', element: s(<IntakeWizard />) },
      { path: 'file/confirmation/:claimNumber', element: s(<Confirmation />) },
      { path: 'claims', element: s(<MyClaims />) },
      { path: 'claims/:claimNumber', element: s(<ClaimDetail />) },
      { path: 'claims/:claimNumber/file', element: s(<ClaimFile />) },
      { path: 'health/:claimNumber', element: s(<HealthClaimView />) },
      { path: 'notifications', element: s(<NotificationsPage />) },
      { path: 'queue', element: s(<WorkQueue />) },
      { path: 'queue/:claimNumber', element: s(<ClaimReview />) },
      { path: 'admin', element: s(<AdminDashboard />) },
      { path: 'admin/config', element: s(<ConfigPage />) },
      { path: 'glossary', element: s(<GlossaryPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
