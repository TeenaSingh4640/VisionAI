import { Link } from "react-router-dom";
import { Eye, Mic, ShieldAlert, Camera } from "lucide-react";
import { BigButton, Logo } from "../components/ui";

export default function Welcome() {
  return (
    <main className="min-h-screen bg-navy-950 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Logo />
        <h1 className="font-display mt-8 text-4xl font-semibold leading-tight md:text-5xl">
          See the surroundings. Understand the situation. Navigate with awareness.
        </h1>
        <p className="mt-4 text-lg text-slate-300">
          VisionMate is an experimental visual assistance prototype. It combines camera perception, conservative hazard
          rules, and an agent orchestrator that can check mapped routes and speak cautious guidance.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            { icon: Camera, t: "Perception", d: "Detects selected objects from sampled camera or demo frames." },
            { icon: ShieldAlert, t: "Hazard assessment", d: "Uses deterministic heuristics. It does not measure distance." },
            { icon: Eye, t: "Agentic tools", d: "Chooses observation, routing, or communication based on context." },
            { icon: Mic, t: "Voice assistance", d: "Speaks concise templates and accepts basic voice commands." },
          ].map((item) => (
            <li key={item.t} className="rounded-2xl border border-slate-700 bg-navy-900 p-4">
              <item.icon className="text-accent" />
              <h2 className="mt-2 font-display text-lg">{item.t}</h2>
              <p className="text-sm text-slate-400">{item.d}</p>
            </li>
          ))}
        </ul>
        <aside className="mt-8 rounded-2xl border border-caution/50 bg-caution/10 p-4" role="note">
          <h2 className="font-display text-lg text-caution">Safety disclaimer</h2>
          <p className="mt-2 text-slate-200">
            This is a hackathon prototype, not a certified mobility aid. It must not be used for unsupervised real-world
            navigation. Routes are never guaranteed safe. Camera and microphone access stay on-device except for sampled
            frames sent to your local backend.
          </p>
        </aside>
        <p className="mt-6 text-sm text-slate-400">
          Get Started will request camera and microphone only when you use those features. You can run a fully simulated
          demonstration without a camera.
        </p>
        <div className="mt-6">
          <Link to="/app">
            <BigButton>Get Started</BigButton>
          </Link>
        </div>
      </div>
    </main>
  );
}
