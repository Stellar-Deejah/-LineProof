import { Routes, Route, Link, NavLink } from 'react-router-dom';
import HomePage from './pages/HomePage';
import QueuePage from './pages/QueuePage';
import QueuesPage from './pages/QueuesPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm transition ${isActive ? 'font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-900'}`;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <span className="h-5 w-5 rounded-full bg-slate-900 inline-block" aria-hidden="true" />
            LineProof
          </Link>
          <div className="flex items-center gap-6">
            <NavLink to="/queues" className={navClass}>Queues</NavLink>
            <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/queues" element={<QueuesPage />} />
          <Route path="/queues/:id" element={<QueuePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between text-xs text-slate-400">
          <span>LineProof Protocol — MIT License</span>
          <a href="https://github.com/lineproof/lineproof" className="hover:text-slate-600" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
