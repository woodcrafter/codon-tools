import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Link, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CodonOptimizationPage from "./pages/CodonOptimization";
import PrimerDesignPage from "./pages/PrimerDesign";
import HostSpeciesPage from "./pages/HostSpecies";
import RestrictionEnzymesPage from "./pages/RestrictionEnzymes";
import HistoryPage from "./pages/History";
import OptimizationResults from "./pages/OptimizationResults";

function Router() {
  return (
    <div className="min-h-screen">
      <div className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center">
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/codon" className="text-muted-foreground hover:text-foreground">
              密码子优化
            </Link>
            <Link href="/primers" className="text-muted-foreground hover:text-foreground">
              引物设计
            </Link>
            <Link href="/data/hosts" className="text-muted-foreground hover:text-foreground">
              宿主物种
            </Link>
            <Link href="/data/enzymes" className="text-muted-foreground hover:text-foreground">
              限制酶
            </Link>
            <Link href="/history" className="text-muted-foreground hover:text-foreground">
              历史
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Switch>
          <Route path="/" component={CodonOptimizationPage} />
          <Route path="/codon" component={CodonOptimizationPage} />
          <Route path="/optimization/:jobId" component={OptimizationResults} />
          <Route path="/primers" component={PrimerDesignPage} />
          <Route path="/data/hosts" component={HostSpeciesPage} />
          <Route path="/data/enzymes" component={RestrictionEnzymesPage} />
          <Route path="/history" component={HistoryPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
