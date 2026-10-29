import React from "react";
import {
  BarChart3,
  Bot,
  Database,
  GitCompare,
  Globe,
  Monitor,
  Package,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";

// ชื่อไอคอนใน swarm-data.ts (avatarIcon) และไอคอนของมุมตรวจ
const ICONS: Record<string, LucideIcon> = {
  Database, ShoppingCart, Truck, Package, Scale, Receipt, BarChart3, ShieldCheck, Settings, GitCompare,
  screen: Monitor, data: Database, api: Globe,
};

export const BotIcon: React.FC<{ name: string; className?: string }> = ({ name, className = "w-5 h-5" }) => {
  const Icon = ICONS[name] ?? Bot;
  return <Icon className={className} />;
};
