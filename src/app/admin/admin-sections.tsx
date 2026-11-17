"use client";

import type { ReactNode } from "react";
import { Tabs } from "@janjalive/ui/tabs";
import { Users, Server } from "lucide-react";

export function AdminSections({ users, guilds }: { users: ReactNode; guilds: ReactNode }) {
  return (
    <Tabs.Root defaultValue="users" className="admin-workspace">
      <Tabs.List className="admin-navigation" aria-label="Seções do controle" activateOnFocus>
        <Tabs.Tab value="users" className="admin-section-tab"><Users size={17} aria-hidden="true" />Usuários</Tabs.Tab>
        <Tabs.Tab value="guilds" className="admin-section-tab"><Server size={17} aria-hidden="true" />Servidores</Tabs.Tab>
      </Tabs.List>
      <div className="admin-content">
        <Tabs.Panel value="users" keepMounted className="admin-section-panel">{users}</Tabs.Panel>
        <Tabs.Panel value="guilds" keepMounted className="admin-section-panel">{guilds}</Tabs.Panel>
      </div>
    </Tabs.Root>
  );
}
