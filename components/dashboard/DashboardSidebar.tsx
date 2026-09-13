'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Heart,
  Users,
  Settings,
  MessageSquare,
  Droplet,
  PlusCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navigationItems = [
  {
    title: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Find Donors',
    href: '/dashboard/donors',
    icon: Heart,
  },
  {
    title: 'Blood Requests',
    href: '/dashboard/requests',
    icon: Droplet,
  },
  {
    title: 'My Donations',
    href: '/dashboard/donations',
    icon: Heart,
  },
  {
    title: 'Messages',
    href: '/dashboard/messages',
    icon: MessageSquare,
  },
  {
    title: 'Profile',
    href: '/dashboard/profile',
    icon: Users,
  },
  {
    title: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
];

export default function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-secondary/5 border-r border-border hidden md:block">
      <nav className="p-4 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          // Overview should ONLY be active on /dashboard.
          // Other sections stay active on their own page
          // and any nested pages underneath them.
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
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

        <div className="pt-4 border-t border-border mt-4">
          <Link href="/dashboard/requests/new">
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              <PlusCircle className="w-4 h-4 mr-2" />
              New Request
            </Button>
          </Link>
        </div>
      </nav>
    </aside>
  );
}