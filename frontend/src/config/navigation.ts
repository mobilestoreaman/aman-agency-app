import {
  LayoutDashboard,
  Tag,
  Package,
  Smartphone,
  Users,
  ShoppingCart,
  Receipt,
  Banknote,
  ArrowLeftRight,
  Truck,
  ShoppingBag,
  Wallet,
  BarChart3,
  Bell,
  Settings,
  CreditCard,
  CalendarClock,
  Activity,
  TrendingUp,
  PackageSearch,
  UserCheck,
  Boxes,
  Landmark,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  adminOnly?: boolean
  /** Show in the mobile bottom nav (max 5 including "More") */
  mobileTab?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard',  path: '/',          icon: LayoutDashboard, mobileTab: true },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Brands',    path: '/brands',    icon: Tag },
      { label: 'Products',  path: '/products',  icon: Package },
      { label: 'Devices',   path: '/devices',   icon: Smartphone,  mobileTab: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Customers',        path: '/customers',        icon: Users,          mobileTab: true },
      { label: 'Sales',            path: '/sales',            icon: ShoppingCart,   mobileTab: true },
      { label: 'Credit Ledger',    path: '/credit-ledger',    icon: CreditCard },
      { label: 'Payment Promises', path: '/payment-promises', icon: CalendarClock },
      { label: 'Bills',            path: '/bills',            icon: Receipt },
      { label: 'Loan References',  path: '/loan-references',  icon: Banknote },
      { label: 'Borrow / Lend',    path: '/borrow-lends',     icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Procurement',
    items: [
      { label: 'Vendors',    path: '/vendors',    icon: Truck },
      { label: 'Purchases',  path: '/purchases',  icon: ShoppingBag },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Expenses', path: '/expenses', icon: Wallet },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Profit & Loss',        path: '/finance/profit-loss',  icon: TrendingUp,    adminOnly: true },
      { label: 'Product Performance',  path: '/finance/products',     icon: PackageSearch, adminOnly: true },
      { label: 'Customer Insights',    path: '/finance/customers',    icon: UserCheck,     adminOnly: true },
      { label: 'Inventory Health',     path: '/finance/inventory',    icon: Boxes,         adminOnly: true },
      { label: 'Cash Flow',            path: '/finance/cash-flow',    icon: Landmark,      adminOnly: true },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Log Tracing',    path: '/logs',           icon: Activity,   adminOnly: true },
      { label: 'Reports',        path: '/reports',        icon: BarChart3,  adminOnly: true },
      { label: 'Notifications',  path: '/notifications',  icon: Bell },
      { label: 'Settings',       path: '/settings',       icon: Settings,   adminOnly: true },
    ],
  },
]

/** Flat list of all nav items */
export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items)

/** Items shown in the mobile bottom tab bar (first 4 + "More") */
export const mobileTabItems: NavItem[] = allNavItems.filter((i) => i.mobileTab).slice(0, 4)
