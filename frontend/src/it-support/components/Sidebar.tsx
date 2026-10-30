import { NavLink } from 'react-router-dom';
import { DatabaseBackup, LogOut } from 'lucide-react';
import { useITAdminAuth } from '../context/ITAdminAuthContext';

const NAV_ITEMS = [
  { id: 'data-export', label: 'Data Export', icon: DatabaseBackup, path: '/it-support/data-export' },
];

export default function Sidebar() {
  const { itAdmin, logout } = useITAdminAuth();
  const initials = (itAdmin?.name || 'IT').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex h-[64px] items-center gap-2.5 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
          <DatabaseBackup size={16} />
        </span>
        <span className="font-display text-[16px] font-bold text-fg">IT Support</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  isActive ? 'bg-accent-soft text-accent-fg' : 'text-fg-3 hover:bg-panel-3 hover:text-fg'
                }`
              }
            >
              <item.icon size={17} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-3 text-[12px] font-bold text-accent-fg">{initials}</span>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-bold text-fg">{itAdmin?.name}</div>
            <div className="truncate text-[11px] text-fg-4">{itAdmin?.email}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold text-fg-3 hover:bg-danger-soft hover:text-danger"
        >
          <LogOut size={16} strokeWidth={1.8} />
          Log out
        </button>
      </div>
    </aside>
  );
}
