'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Users,
  Droplet,
  ClipboardList,
  BarChart3,
  Flag,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigationItems = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
  },
  {
    title: 'Blood Inventory',
    href: '/admin/inventory',
    icon: Droplet,
  },
  {
    title: 'Blood Requests',
    href: '/admin/requests',
    icon: ClipboardList,
  },
  {
    title: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
  },
  {
    title: 'Reports',
    href: '/admin/reports',
    icon: Flag,
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-secondary/5 border-r border-border hidden md:block">
      <nav className="p-4 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          // Dashboard should ONLY be active on /admin.
          // Other sections remain active on their nested pages.
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant="ghost"
                className={cn(
                  'w-full justify-start text-foreground hover:bg-secondary/20',
                  isActive && 'bg-secondary/30 text-primary'
                )}
              >
                <Icon className="w-4 h-4 mr-3" />
                {item.title}
              </Button>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}