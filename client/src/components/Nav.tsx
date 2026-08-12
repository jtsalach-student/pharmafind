import { Link } from 'react-router-dom';

const links = [
  ['/', 'Home'],
  ['/search', 'Search'],
  ['/emergency', 'Emergency'],
  ['/prescriptions/upload', 'Upload Rx'],
  ['/deliveries/track', 'Track'],
  ['/admin/dashboard', 'Dashboard']
];

export function Nav() {
  return (
    <nav className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-3 px-4 py-3">
        {links.map(([to, label]) => (
          <Link key={to} to={to} className="rounded px-3 py-1 text-sm hover:bg-slate-100">
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
