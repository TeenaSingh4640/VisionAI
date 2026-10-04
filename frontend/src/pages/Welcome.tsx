import { Link } from "react-router-dom";
import { ArrowRight, AudioLines, Camera, Eye, ShieldCheck } from "lucide-react";

export default function Welcome() {
  return (
    <main className="welcome-screen">
      <div className="welcome-brand"><span><Eye size={22} /></span><div><strong>VisionMate</strong><small>Visual assistance</small></div><i>● READY</i></div>
      <div className="welcome-hero"><div className="hero-mark"><Eye size={34} /></div><p className="hero-eyebrow">SEE · UNDERSTAND · NAVIGATE</p><h1>Move through your day with more awareness.</h1><p>VisionMate describes selected objects and offers cautious, spoken guidance from your camera view.</p></div>
      <div className="welcome-features"><div><span><Camera size={18} /></span><p><strong>Scene awareness</strong><small>Sampled camera or controlled demo scenes</small></p></div><div><span><AudioLines size={18} /></span><p><strong>Voice first</strong><small>Listen to concise updates and guidance</small></p></div><div><span><ShieldCheck size={18} /></span><p><strong>You stay in control</strong><small>Mapped routes are shown for review only</small></p></div></div>
      <aside className="welcome-safety"><strong>Prototype safety</strong><p>This is an experimental demo, not a certified mobility aid. Do not rely on it for outdoor navigation.</p></aside>
      <Link className="welcome-continue" to="/app">Get Started <ArrowRight size={18} /></Link>
      <p className="welcome-privacy">Camera permission is requested only when you start camera preview. You can try demo mode without a camera.</p>
    </main>
  );
}
