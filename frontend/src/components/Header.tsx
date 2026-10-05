import { NavLink, useLocation } from "react-router-dom";
import { ArrowLeft, AudioLines, CircleUserRound, Eye, Home as HomeIcon, ScanEye, Settings as SettingsIcon, SlidersHorizontal } from "lucide-react";
import { useSession } from "../context/SessionContext";

export function Header() {
  const { connected, session, error } = useSession();
  const location = useLocation();
  const title = location.pathname.includes("settings")
    ? "Profile settings"
    : location.pathname.includes("navigate")
      ? "Navigation"
      : location.pathname.includes("scan")
        ? "Object scanner"
        : location.pathname.includes("assist")
          ? "Live guidance"
          : "Home guidance";

  return (
    <>
    <header className="mobile-header">
      <div className="brand-lockup">
        {location.pathname !== "/app" && (
          <NavLink to="/app" className="icon-button back-button" aria-label="Back to home">
            <ArrowLeft size={20} />
          </NavLink>
        )}
        <span className="brand-icon"><Eye size={19} aria-hidden /></span>
        <div className="brand-copy">
          <div className="brand-name">VisionMate <span className={`live-chip ${connected ? "is-live" : "is-offline"}`}>{connected ? "● LIVE" : "● OFFLINE"}</span></div>
          <div className="brand-subtitle">{title}</div>
        </div>
      </div>
      <div className="header-actions">
        <a className="sos-button" href="tel:112" aria-label="Call emergency services">SOS</a>
        <NavLink to="/app/settings" className="icon-button profile-button" aria-label="Open profile settings">
          {session ? <CircleUserRound size={19} /> : <SettingsIcon size={18} />}
        </NavLink>
      </div>
    </header>
    {error ? <div className="connection-banner" role="status">{error}</div> : null}
    </>
  );
}

export function BottomNav() {
  const tabs = [
    { to: "/app", label: "Home", Icon: HomeIcon, end: true },
    { to: "/app/scan", label: "Scan", Icon: ScanEye },
    { to: "/app/assist", label: "Audio", Icon: AudioLines },
    { to: "/app/settings", label: "Settings", Icon: SlidersHorizontal },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `bottom-tab ${isActive ? "active" : ""}`}>
          <tab.Icon className="tab-icon" size={19} aria-hidden />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
