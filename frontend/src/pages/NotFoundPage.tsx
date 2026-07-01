import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <p className="text-6xl font-bold text-slate-200">404</p>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        The page you're looking for doesn't exist or was moved.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Go home
      </Link>
    </div>
  );
}
