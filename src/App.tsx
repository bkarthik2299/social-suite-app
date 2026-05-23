import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoaderOne from "@/components/ui/loader-one";
import Index from "./pages/Index";
import Projects from "./pages/Projects";
import Folders from "./pages/Folders";
import Campaigns from "./pages/Campaigns";
import CampaignDashboard from "./pages/CampaignDashboard";
import Tasks from "./pages/Tasks";
import Calendar from "./pages/Calendar";
import Teams from "./pages/Teams";
import NotFound from "./pages/NotFound";
import PasswordVault from "./pages/tools/PasswordVault";
import FeedMonitor from "./pages/tools/FeedMonitor";
import ClientPortal from "./pages/tools/ClientPortal";
import BrandGuide from "./pages/tools/BrandGuide";
import SocialPreview from '@/pages/tools/SocialPreview';
import Notes from './pages/tools/Notes';
import AuthPage from "./pages/Auth";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
    },
  },
});

// Protected route wrapper — redirects to /auth if not authenticated
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, organization } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoaderOne />
      </div>
    );
  }

  if (!isAuthenticated || !organization) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

// Auth route — redirects to / if already authenticated
function AuthRoute() {
  const { isAuthenticated, isLoading, organization } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoaderOne />
      </div>
    );
  }

  if (isAuthenticated && organization) {
    return <Navigate to="/" replace />;
  }

  return <AuthPage />;
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>

          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Public route */}
                <Route path="/auth" element={<AuthRoute />} />

                {/* Protected routes */}
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
                <Route path="/projects/:projectId/folders" element={<ProtectedRoute><Folders /></ProtectedRoute>} />
                <Route path="/projects/:projectId/folders/:folderId/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
                <Route path="/projects/:projectId/folders/:folderId/campaigns/:campaignId" element={<ProtectedRoute><CampaignDashboard /></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
                <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
                <Route path="/tools/vault" element={<ProtectedRoute><PasswordVault /></ProtectedRoute>} />
                <Route path="/tools/feed" element={<ProtectedRoute><FeedMonitor /></ProtectedRoute>} />
                <Route path="/tools/client-portal" element={<ProtectedRoute><ClientPortal /></ProtectedRoute>} />
                <Route path="/tools/brand-guide" element={<ProtectedRoute><BrandGuide /></ProtectedRoute>} />
                <Route path="/tools/sm-preview" element={<ProtectedRoute><SocialPreview /></ProtectedRoute>} />
                <Route path="/tools/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>

      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
