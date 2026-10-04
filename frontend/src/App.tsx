import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BottomNav } from "./components/Header";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import Assist from "./pages/Assist";
import NavigatePage from "./pages/Navigate";
import SettingsPage from "./pages/Settings";
import Scan from "./pages/Scan";

export default function App() {
  const location = useLocation();
  const isWelcome = location.pathname === "/";
  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem("visionmate-comfort") || "{}");
      document.documentElement.dataset.text = prefs.textSize || "standard";
      document.documentElement.dataset.theme = prefs.theme || "standard";
      document.documentElement.dataset.contrast = prefs.contrast || "standard";
      document.documentElement.dataset.reduceMotion = String(prefs.reducedMotion ?? true);
    } catch { /* Defaults remain applied. */ }
  }, []);
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/assist" element={<Assist />} />
        <Route path="/app/scan" element={<Scan />} />
        <Route path="/app/navigate" element={<NavigatePage />} />
        <Route path="/app/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!isWelcome && <BottomNav />}
    </div>
  );
}
