import { Navigate, Route, Routes } from "react-router-dom";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import Assist from "./pages/Assist";
import NavigatePage from "./pages/Navigate";
import SettingsPage from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/app" element={<Dashboard />} />
      <Route path="/app/assist" element={<Assist />} />
      <Route path="/app/navigate" element={<NavigatePage />} />
      <Route path="/app/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
