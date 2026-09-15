import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import CapuchinaLoader from '@/components/ui/CapuchinaLoader';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Home from '@/pages/Home';
const Buscar = lazy(() => import('@/pages/Buscar'));
const Parte = lazy(() => import('@/pages/Parte'));
const Comparar = lazy(() => import('@/pages/Comparar'));
const CompararSeleccion = lazy(() => import('@/pages/CompararSeleccion'));
const CompararReferencia = lazy(() => import('@/pages/CompararReferencia'));
const Decidir = lazy(() => import('@/pages/Decidir'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const OAuthConsent = lazy(() => import('@/pages/OAuthConsent'));
import TrialRoute from '@/components/TrialRoute';
import { LanguageProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';
import { ComparisonSelectionProvider } from '@/lib/comparisonSelection';
import ComparisonDock from '@/components/comparison/ComparisonDock';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Diagnostic: do not block the entire application on Supabase Auth during startup.
  // Authentication continues in AuthContext; public routes must render independently.

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  return (
    <Suspense fallback={<CapuchinaLoader fullScreen />} >
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      {/* La aplicación es navegable públicamente. El login solo vive en /login y no debe interrumpir Buscar, Encontrar, Comparar o Decidir. */}
      <Route path="/" element={<Home />} />
      <Route path="/buscar" element={<TrialRoute><Buscar /></TrialRoute>} />
      <Route path="/parte/:id" element={<TrialRoute><Parte /></TrialRoute>} />
      <Route path="/comparar/:id" element={<TrialRoute><Comparar /></TrialRoute>} />
      <Route path="/comparar-seleccion" element={<TrialRoute><CompararSeleccion /></TrialRoute>} />
      <Route path="/comparar-referencia" element={<TrialRoute><CompararReferencia /></TrialRoute>} />
      <Route path="/decidir" element={<TrialRoute><Decidir /></TrialRoute>} />
      <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <ThemeProvider>
      <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
        <ComparisonSelectionProvider>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
          <ComparisonDock />
        </Router>
        </ComparisonSelectionProvider>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App