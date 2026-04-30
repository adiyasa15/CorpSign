import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { AuthProvider } from "@/contexts/auth-context";
import { LanguageProvider } from "@/contexts/language-context";
import { ProtectedRoute } from "@/components/protected-route";

import Dashboard from "@/pages/dashboard";
import Documents from "@/pages/documents";
import DocumentDetail from "@/pages/document-detail";
import DocumentEditor from "@/pages/document-editor";
import SignDocument from "@/pages/sign-document";
import UploadDocument from "@/pages/upload-document";
import SignatureSettings from "@/pages/signature-settings";
import Signatures from "@/pages/signatures";
import Settings from "@/pages/settings";
import Login from "@/pages/login";
import Users from "@/pages/users";
import Privileges from "@/pages/privileges";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        <ProtectedRoute>
          <Switch>
            <Route path="/documents/:id/editor" component={DocumentEditor} />
            <Route path="/documents/:id/sign" component={SignDocument} />
            <Route>
              <Layout>
                <Switch>
                  <Route path="/" component={Dashboard} />
                  <Route path="/documents/upload" component={UploadDocument} />
                  <Route path="/documents/:id" component={DocumentDetail} />
                  <Route path="/documents" component={Documents} />
                  <Route path="/signatures" component={Signatures} />
                  <Route path="/settings" component={Settings} />
                  <Route path="/signature-settings" component={SignatureSettings} />
                  <Route path="/users" component={Users} />
                  <Route path="/privileges" component={Privileges} />
                  <Route component={NotFound} />
                </Switch>
              </Layout>
            </Route>
          </Switch>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <LanguageProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
