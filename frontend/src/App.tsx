import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";

// Workspace pages load on demand so the landing page stays light
const AppLayout = lazy(() => import("./app/AppLayout"));
const Overview = lazy(() => import("./app/Overview"));
const Investigate = lazy(() => import("./app/Investigate"));
const Scenarios = lazy(() => import("./app/Scenarios"));
const DataSources = lazy(() => import("./app/DataSources"));

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink-950" />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Overview />} />
          <Route path="investigate" element={<Investigate />} />
          <Route path="scenarios" element={<Scenarios />} />
          <Route path="data" element={<DataSources />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </Suspense>
  );
}
